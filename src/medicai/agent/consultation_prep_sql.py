"""
Database-first consultation preparation generator.

This module generates consultation prep summaries using PostgreSQL data,
making it compatible with multi-instance deployments.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict

from medicai.storage.postgres import get_conn, ping_db

logger = logging.getLogger(__name__)


def _format_ref(ref_low: Optional[float], ref_high: Optional[float]) -> str:
    """Format reference range string."""
    if ref_low is not None and ref_high is not None:
        return f"({ref_low}–{ref_high})"
    if ref_high is not None:
        return f"(< {ref_high})"
    if ref_low is not None:
        return f"(> {ref_low})"
    return ""


def _get_lab_data(patient_id: str) -> List[Dict[str, Any]]:
    """Fetch all lab results for a patient from DB."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT doc_id, date_of_service, panel_name, test_name, 
                       value, unit, ref_low, ref_high, flag
                FROM lab_results
                WHERE patient_id = %s
                ORDER BY date_of_service DESC NULLS LAST, test_name
            """, (patient_id,))
            
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def _get_radiology_data(patient_id: str) -> List[Dict[str, Any]]:
    """Fetch all radiology reports for a patient from DB."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT doc_id, date_of_service, exam_type, 
                       contexte_clinique, resultats, conclusion
                FROM radiology_reports
                WHERE patient_id = %s
                ORDER BY date_of_service DESC NULLS LAST
            """, (patient_id,))
            
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def _get_medication_data(patient_id: str) -> List[Dict[str, Any]]:
    """Fetch all prescriptions for a patient from DB."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT doc_id, date_of_service, drug_name, 
                       strength_or_concentration, dose, frequency,
                       duration, form, route, instructions, prescriber_name
                FROM prescription_items
                WHERE patient_id = %s
                ORDER BY date_of_service DESC NULLS LAST
            """, (patient_id,))
            
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def _group_labs_by_date(labs: List[Dict]) -> Dict[str, List[Dict]]:
    """Group lab results by date."""
    by_date = defaultdict(list)
    for lab in labs:
        ds = lab.get('date_of_service')
        date_key = ds.isoformat() if ds else 'unknown'
        by_date[date_key].append(lab)
    return dict(by_date)


def _analyze_lab_trends(labs: List[Dict]) -> Dict[str, Dict]:
    """Analyze trends for each test across all dates."""
    by_test = defaultdict(list)
    for lab in labs:
        test_name = lab.get('test_name', '').strip()
        if not test_name:
            continue
        by_test[test_name].append(lab)
    
    trends = {}
    for test_name, points in by_test.items():
        # Sort by date ascending
        sorted_pts = sorted(points, key=lambda x: x.get('date_of_service') or date.min)
        
        if len(sorted_pts) >= 2:
            first = sorted_pts[0]
            last = sorted_pts[-1]
            
            first_val = first.get('value')
            last_val = last.get('value')
            
            if first_val and last_val and first_val != 0:
                pct_change = ((last_val - first_val) / abs(first_val)) * 100
                
                if pct_change > 10:
                    direction = "en hausse"
                elif pct_change < -10:
                    direction = "en baisse"
                else:
                    direction = "stable"
                
                trends[test_name] = {
                    "direction": direction,
                    "pct_change": round(pct_change, 1),
                    "first_date": first.get('date_of_service'),
                    "last_date": last.get('date_of_service'),
                    "first_value": first_val,
                    "last_value": last_val,
                }
    
    return trends


def generate_consultation_prep_sql(patient_id: str) -> Optional[str]:
    """
    Generate consultation prep summary using database data.
    
    Returns None if no data found or DB unavailable.
    """
    if not ping_db():
        return None
    
    try:
        labs = _get_lab_data(patient_id)
        radiology = _get_radiology_data(patient_id)
        meds = _get_medication_data(patient_id)
        
        if not labs and not radiology and not meds:
            return None
        
        lines = []
        lines.append(f"# PRÉPARATION CONSULTATION – Patient {patient_id}")
        lines.append(f"_Généré le {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
        
        # --- LABS SECTION ---
        if labs:
            lines.append("## 🧪 BIOLOGIE")
            
            # Group by date
            labs_by_date = _group_labs_by_date(labs)
            dates_sorted = sorted(labs_by_date.keys(), reverse=True)
            
            # Latest panel
            if dates_sorted:
                latest_date = dates_sorted[0]
                latest_labs = labs_by_date[latest_date]
                doc_id = latest_labs[0].get('doc_id') if latest_labs else 'unknown'
                
                lines.append(f"\n### Dernier bilan ({latest_date}) [doc: {doc_id}]")
                
                # Abnormals first
                abnormals = [l for l in latest_labs if l.get('flag') in ('low', 'high')]
                normals = [l for l in latest_labs if l.get('flag') not in ('low', 'high')]
                
                if abnormals:
                    lines.append("\n**Anomalies:**")
                    for lab in abnormals:
                        ref = _format_ref(lab.get('ref_low'), lab.get('ref_high'))
                        flag_emoji = "⬇️" if lab.get('flag') == 'low' else "⬆️"
                        lines.append(
                            f"- {flag_emoji} **{lab.get('test_name')}**: "
                            f"{lab.get('value')} {lab.get('unit')} {ref}"
                        )
                
                if normals:
                    lines.append("\n**Normaux:**")
                    for lab in normals[:10]:  # Limit to top 10 normals
                        ref = _format_ref(lab.get('ref_low'), lab.get('ref_high'))
                        lines.append(
                            f"- {lab.get('test_name')}: "
                            f"{lab.get('value')} {lab.get('unit')} {ref}"
                        )
                    if len(normals) > 10:
                        lines.append(f"- _{len(normals) - 10} autres résultats normaux..._")
            
            # Trends
            trends = _analyze_lab_trends(labs)
            if trends:
                lines.append("\n### Tendances")
                for test_name, trend in list(trends.items())[:10]:
                    lines.append(
                        f"- {test_name}: {trend['direction']} "
                        f"({trend['first_value']} → {trend['last_value']}, "
                        f"{trend['pct_change']:+.1f}%)"
                    )
        
        # --- RADIOLOGY SECTION ---
        if radiology:
            lines.append("\n## 🩻 IMAGERIE")
            
            for i, report in enumerate(radiology[:5]):  # Limit to 5 most recent
                ds = report.get('date_of_service')
                date_str = ds.isoformat() if ds else 'date inconnue'
                doc_id = report.get('doc_id', 'unknown')
                exam_type = report.get('exam_type', 'Examen')
                
                lines.append(f"\n### {exam_type} ({date_str}) [doc: {doc_id}]")
                
                if report.get('contexte_clinique'):
                    lines.append(f"**Contexte:** {report['contexte_clinique'][:200]}...")
                
                if report.get('conclusion'):
                    lines.append(f"**Conclusion:** {report['conclusion']}")
        
        # --- MEDICATIONS SECTION ---
        if meds:
            lines.append("\n## 💊 MÉDICAMENTS RÉCENTS")
            
            # Group by date
            meds_by_date = defaultdict(list)
            for med in meds:
                ds = med.get('date_of_service')
                date_key = ds.isoformat() if ds else 'unknown'
                meds_by_date[date_key].append(med)
            
            dates_sorted = sorted(meds_by_date.keys(), reverse=True)[:3]  # Top 3 dates
            
            for date_key in dates_sorted:
                date_meds = meds_by_date[date_key]
                doc_id = date_meds[0].get('doc_id') if date_meds else 'unknown'
                prescriber = date_meds[0].get('prescriber_name', 'Prescripteur inconnu')
                
                lines.append(f"\n### Ordonnance {date_key} [doc: {doc_id}]")
                lines.append(f"_Prescripteur: {prescriber}_")
                
                for med in date_meds[:10]:
                    drug = med.get('drug_name', 'Médicament')
                    form = med.get('form', '')
                    dose = med.get('dose', '')
                    freq = med.get('frequency', '')
                    duration = med.get('duration', '')
                    
                    med_line = f"- {drug}"
                    if form:
                        med_line += f" ({form})"
                    if dose:
                        med_line += f": {dose}"
                    if freq:
                        med_line += f", {freq}"
                    if duration:
                        med_line += f" — {duration}"
                    lines.append(med_line)
        
        # --- SUMMARY SECTION ---
        lines.append("\n## 📋 RÉSUMÉ")
        
        # Count abnormals
        total_abnormals = sum(1 for l in labs if l.get('flag') in ('low', 'high'))
        lines.append(f"- **Anomalies biologiques:** {total_abnormals}")
        lines.append(f"- **Examens d'imagerie:** {len(radiology)}")
        lines.append(f"- **Médicaments prescrits:** {len(set(m.get('drug_name') for m in meds if m.get('drug_name')))}")
        
        lines.append("\n---")
        lines.append("_Source: Base de données PostgreSQL. Vérifier les documents originaux pour confirmation._")
        
        return "\n".join(lines)
        
    except Exception as e:
        logger.error(f"Failed to generate consultation prep from DB for {patient_id}: {e}")
        return None
