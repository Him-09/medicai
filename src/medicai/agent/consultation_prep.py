import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict
from langchain_openai import ChatOpenAI

LabKey = Tuple[str, str, Optional[float], Optional[float]]  # (name, unit, ref_low, ref_high)
LabPoint = Tuple[str, float, str, str, Optional[float], Optional[float]]  # (date, value, unit, flag, ref_low, ref_high)


def _load_patient_docs(patient_id: str, processed_dir: str) -> List[Dict[str, Any]]:
    docs = []
    base_path = Path(processed_dir)
    
    # Try subdirectory first (e.g., p3/p3_*.json)
    patient_dir = base_path / patient_id
    if patient_dir.exists():
        for fp in patient_dir.glob("*.json"):
            # Filter by patient_id prefix
            if fp.stem.startswith(f"{patient_id}_"):
                with open(fp, "r", encoding="utf-8") as f:
                    docs.append(json.load(f))
    
    # Fallback: try top level (e.g., patient1_*.json)
    if not docs:
        for fp in base_path.glob("*.json"):
            # Filter by patient_id prefix
            if fp.stem.startswith(f"{patient_id}_"):
                with open(fp, "r", encoding="utf-8") as f:
                    docs.append(json.load(f))
    
    return docs


def _iso_date(x: Optional[str]) -> str:
    return x if x else "unknown"


def _doc_date(doc: Dict[str, Any]) -> str:
    return (doc.get("metadata") or {}).get("date_of_service") or "0000-00-00"


def _sort_docs_by_date_desc(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(docs, key=_doc_date, reverse=True)




def _group_lab_docs_by_date(lab_docs: list[dict]) -> dict[str, list[dict]]:
    g = defaultdict(list)
    for d in lab_docs:
        ds = (d.get("metadata") or {}).get("date_of_service") or "unknown"
        g[ds].append(d)
    return dict(g)



def _format_ref(ref_low, ref_high) -> str:
    if ref_low is not None and ref_high is not None:
        return f"({ref_low}–{ref_high})"
    if ref_high is not None:
        return f"(< {ref_high})"
    if ref_low is not None:
        return f"(> {ref_low})"
    return ""


def _abnormal_distance_ratio(value: Optional[float],
                            ref_low: Optional[float],
                            ref_high: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if ref_low is not None and value < ref_low and ref_low != 0:
        return (ref_low - value) / ref_low
    if ref_high is not None and value > ref_high and ref_high != 0:
        return (value - ref_high) / ref_high
    return None


def _distinct_known_dates(points: List[LabPoint]) -> List[str]:
    dates = [p[0] for p in points if p[0] and p[0] != "unknown"]
    return sorted(set(dates))


def _trend_label(points: List[LabPoint]) -> str:
    known_dates = _distinct_known_dates(points)
    if len(known_dates) < 2:
        return "données insuffisantes (besoin ≥2 dates distinctes)"

    pts = [p for p in points if p[0] in known_dates]
    if len(pts) < 2:
        return "données insuffisantes (besoin ≥2 dates distinctes)"

    pts = sorted(pts, key=lambda x: x[0] or "0000-00-00")
    v0, v1 = pts[0][1], pts[-1][1]
    if v1 > v0:
        return "en hausse"
    if v1 < v0:
        return "en baisse"
    return "stable"


def _collect_lab_points(lab_docs: List[Dict[str, Any]]) -> Dict[LabKey, List[LabPoint]]:
    by_test: Dict[LabKey, List[LabPoint]] = {}
    for ld in lab_docs:
        ds = (ld.get("metadata") or {}).get("date_of_service") or "unknown"
        for t in (ld.get("structured") or {}).get("tests", []):
            name = (t.get("name") or "").strip()
            unit = (t.get("unit") or "").strip()
            value = t.get("value")
            ref_low, ref_high = t.get("ref_low"), t.get("ref_high")
            flag = t.get("flag") or "unknown"
            if not name or value is None:
                continue
            key: LabKey = (name, unit, ref_low, ref_high)
            by_test.setdefault(key, []).append((ds, float(value), unit, flag, ref_low, ref_high))

    for k in by_test:
        by_test[k] = sorted(by_test[k], key=lambda x: x[0] or "0000-00-00")
    return by_test


def _tests_map_from_doc(lab_doc: Dict[str, Any]) -> Dict[LabKey, dict]:
    """
    For diffing latest vs previous.
    """
    out: Dict[LabKey, dict] = {}
    for t in (lab_doc.get("structured") or {}).get("tests", []):
        name = (t.get("name") or "").strip()
        unit = (t.get("unit") or "").strip()
        ref_low, ref_high = t.get("ref_low"), t.get("ref_high")
        if not name:
            continue
        key: LabKey = (name, unit, ref_low, ref_high)
        out[key] = t
    return out


def _diff_labs(latest: Dict[str, Any], previous: Dict[str, Any]) -> List[str]:
    """
    Deterministic diff:
    - New abnormal
    - Resolved abnormal
    - Biggest numeric deltas (same key)
    """
    lines = []
    latest_date = (latest.get("metadata") or {}).get("date_of_service")
    prev_date = (previous.get("metadata") or {}).get("date_of_service")

    L = _tests_map_from_doc(latest)
    P = _tests_map_from_doc(previous)

    # New / resolved abnormal flags
    new_abn = []
    resolved_abn = []

    for key, lt in L.items():
        lp = P.get(key)
        lf = lt.get("flag", "unknown")
        pf = lp.get("flag", "unknown") if lp else "unknown"
        if lf in ("low", "high") and pf in ("normal", "unknown"):
            new_abn.append((key, lt, pf))
        if lf == "normal" and pf in ("low", "high"):
            resolved_abn.append((key, lp, lf))

    if new_abn:
        lines.append(f"- Nouvelles anomalies (vs {prev_date} → {latest_date}) :")
        for (name, unit, rl, rh), lt, pf in new_abn[:10]:
            ref = _format_ref(rl, rh)
            lines.append(f"  • {name} [{unit}] : {lt.get('value')} {unit} {ref} → {lt.get('flag')} (était {pf})")
    else:
        lines.append(f"- Nouvelles anomalies : aucune détectée (vs {prev_date})")

    if resolved_abn:
        lines.append(f"- Anomalies résolues (vs {prev_date} → {latest_date}) :")
        for (name, unit, rl, rh), pt, lf in resolved_abn[:10]:
            ref = _format_ref(rl, rh)
            lines.append(f"  • {name} [{unit}] : {pt.get('value')} {unit} {ref} était {pt.get('flag')}, maintenant normal")
    else:
        lines.append(f"- Anomalies résolues : aucune détectée (vs {prev_date})")

    # Biggest numeric deltas (same key)
    deltas = []
    for key, lt in L.items():
        pt = P.get(key)
        if not pt:
            continue
        lv, pv = lt.get("value"), pt.get("value")
        if lv is None or pv is None:
            continue
        try:
            delta = float(lv) - float(pv)
        except Exception:
            continue
        deltas.append((abs(delta), delta, key, pv, lv))

    deltas.sort(reverse=True, key=lambda x: x[0])
    if deltas:
        lines.append(f"- Plus grands changements de valeurs (même analyte+unité, vs {prev_date}) :")
        for absd, d, (name, unit, rl, rh), pv, lv in deltas[:5]:
            lines.append(f"  • {name} [{unit}] : {pv} → {lv} (Δ {d:+g})")
    else:
        lines.append(f"- Plus grands changements de valeurs : aucune comparable (vs {prev_date})")

    return lines



from typing import Optional, List, Dict, Any, Tuple

def _abnormal_distance_ratio(value: Optional[float],
                            ref_low: Optional[float],
                            ref_high: Optional[float]) -> Optional[float]:
    # Pure math: how far outside the range, normalized to bound
    if value is None:
        return None
    if ref_low is not None and value < ref_low and ref_low != 0:
        return (ref_low - value) / ref_low
    if ref_high is not None and value > ref_high and ref_high != 0:
        return (value - ref_high) / ref_high
    return None


def _latest_date_abnormal_count(latest_date_labs: List[Dict[str, Any]]) -> int:
    count = 0
    for labdoc in latest_date_labs:
        for t in (labdoc.get("structured") or {}).get("tests", []):
            if t.get("flag") in ("low", "high"):
                count += 1
    return count


def _top_outside_ref_latest_date(
    latest_date_labs: List[Dict[str, Any]],
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    Returns up to top_k items across all latest-date lab panels, ranked by distance outside ref.
    Output items contain: panel_name, name, value, unit, ref_low/ref_high, flag, ratio
    Deduplicates by analyte name only - keeps the one with highest % outside reference.
    """
    items = []
    for labdoc in latest_date_labs:
        md = labdoc.get("metadata") or {}
        panel = md.get("panel_name") or "unknown"
        for t in (labdoc.get("structured") or {}).get("tests", []):
            flag = t.get("flag")
            if flag not in ("low", "high"):
                continue
            value = t.get("value")
            rl, rh = t.get("ref_low"), t.get("ref_high")
            ratio = _abnormal_distance_ratio(value, rl, rh)

            items.append({
                "panel": panel,
                "name": t.get("name"),
                "value": value,
                "unit": t.get("unit"),
                "ref_low": rl,
                "ref_high": rh,
                "flag": flag,
                "ratio": ratio,
            })

    # Deduplicate by name only (across units/panels), keeping highest ratio
    collapsed = {}
    for item in items:
        name = item["name"]
        if name not in collapsed or (item["ratio"] or 0) > (collapsed[name]["ratio"] or 0):
            collapsed[name] = item

    items = list(collapsed.values())

    # Sort by ratio (higher deviation = higher priority)
    def key(x):
        r = x.get("ratio")
        return (0 if r is not None else 1, -(r or 0.0))

    items.sort(key=key)
    return items[:top_k]



def _previous_doc_distinct_date(sorted_docs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Get the first document with a different date than the latest."""
    if not sorted_docs:
        return None
    latest_date = (sorted_docs[0].get("metadata") or {}).get("date_of_service")
    for d in sorted_docs[1:]:
        ds = (d.get("metadata") or {}).get("date_of_service")
        if ds and latest_date and ds != latest_date:
            return d
    return None


def compute_latest_lab_context(lab_docs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute latest lab context including latest/previous labs, date groupings, etc.
    
    Returns dict with keys: latest_lab, prev_lab, latest_lab_date, latest_date_labs, 
    abnormal_items, lab_docs_sorted
    """
    lab_docs_sorted = _sort_docs_by_date_desc(lab_docs)
    latest_lab = lab_docs_sorted[0] if lab_docs_sorted else None
    prev_lab = _previous_doc_distinct_date(lab_docs_sorted)
    
    labs_by_date = _group_lab_docs_by_date(lab_docs_sorted)
    latest_lab_date = (lab_docs_sorted[0].get("metadata") or {}).get("date_of_service") if lab_docs_sorted else None
    latest_date_labs = labs_by_date.get(latest_lab_date, []) if latest_lab_date else []
    
    # Compute abnormal items from latest lab
    abnormal_items = []
    if latest_lab:
        for t in (latest_lab.get("structured") or {}).get("tests", []):
            flag = t.get("flag")
            if flag not in ("low", "high"):
                continue
            name = (t.get("name") or "").strip()
            unit = (t.get("unit") or "").strip()
            value = t.get("value")
            rl, rh = t.get("ref_low"), t.get("ref_high")
            ratio = _abnormal_distance_ratio(value, rl, rh)
            abnormal_items.append((name, unit, value, rl, rh, flag, ratio))
    
    abnormal_items.sort(key=lambda x: (0 if x[6] is not None else 1, -(x[6] or 0), x[0]))
    
    return {
        "latest_lab": latest_lab,
        "prev_lab": prev_lab,
        "latest_lab_date": latest_lab_date,
        "latest_date_labs": latest_date_labs,
        "abnormal_items": abnormal_items,
        "lab_docs_sorted": lab_docs_sorted,
    }


def compute_top_flags(latest_date_labs: List[Dict[str, Any]], top_k: int = 3) -> List[Dict[str, Any]]:
    """Compute top K abnormal flags by % outside reference."""
    return _top_outside_ref_latest_date(latest_date_labs, top_k=top_k)


def compute_trends(lab_docs: List[Dict[str, Any]], latest_lab: Optional[Dict[str, Any]]) -> List[str]:
    """
    Compute top 3 trend series (prioritize abnormal + multi-date).
    Returns list of formatted trend lines.
    """
    points_by_test = _collect_lab_points(lab_docs)
    
    latest_flags = {}
    if latest_lab:
        for t in (latest_lab.get("structured") or {}).get("tests", []):
            name = (t.get("name") or "").strip()
            unit = (t.get("unit") or "").strip()
            rl, rh = t.get("ref_low"), t.get("ref_high")
            if not name:
                continue
            latest_flags[(name, unit, rl, rh)] = t.get("flag") or "unknown"
    
    candidates = []
    for key, pts in points_by_test.items():
        is_abn = 1 if latest_flags.get(key) in ("low", "high") else 0
        has_multidate = 1 if len(_distinct_known_dates(pts)) >= 2 else 0
        candidates.append((is_abn, has_multidate, len(pts), key))
    
    candidates.sort(reverse=True)
    
    # Deduplicate by analyte name only, keeping first (highest priority) occurrence
    seen_names = set()
    chosen_keys = []
    for _, _, _, key in candidates:
        name = key[0]  # key is (name, unit, ref_low, ref_high)
        if name not in seen_names:
            seen_names.add(name)
            chosen_keys.append(key)
            if len(chosen_keys) >= 3:
                break
    
    trend_lines = []
    if chosen_keys:
        for key in chosen_keys:
            name, unit, rl, rh = key
            pts = points_by_test.get(key, [])
            trend_lines.append(f"- {name} [{unit}] : {_trend_label(pts)}")
            for (d, v, u, fl, rlow, rhigh) in pts[-3:]:
                ref = _format_ref(rlow, rhigh)
                trend_lines.append(f"  • {d} : {v} {u} {ref} ({fl})")
    else:
        trend_lines.append("- Aucune donnée de tendance disponible")
    
    return trend_lines


def render_consultation_prep(
    patient_id: str,
    lab_ctx: Dict[str, Any],
    rad_docs: List[Dict[str, Any]],
    other_docs: List[Dict[str, Any]],
    top_flags: List[Dict[str, Any]],
    trend_lines: List[str],
) -> str:
    """
    Render the final consultation prep text from computed components.
    """
    latest_lab = lab_ctx["latest_lab"]
    prev_lab = lab_ctx["prev_lab"]
    latest_lab_date = lab_ctx["latest_lab_date"]
    latest_date_labs = lab_ctx["latest_date_labs"]
    abnormal_items = lab_ctx["abnormal_items"]
    lab_docs_sorted = lab_ctx["lab_docs_sorted"]
    
    rad_docs_sorted = _sort_docs_by_date_desc(rad_docs)
    latest_rad = rad_docs_sorted[0] if rad_docs_sorted else None
    prev_rad = rad_docs_sorted[1] if len(rad_docs_sorted) >= 2 else None
    latest_rad_date = (latest_rad.get("metadata") or {}).get("date_of_service") if latest_rad else None
    
    rad_conclusion = None
    if latest_rad:
        rad_conclusion = ((latest_rad.get("structured") or {}).get("conclusion") or "").strip() or None
    
    # Data gaps
    gaps = []
    if not lab_docs_sorted:
        gaps.append("- Bilans manquants : aucun document de laboratoire trouvé")
    else:
        gaps.append(f"- Bilans : aucune donnée de laboratoire après {_iso_date(latest_lab_date)}")
    
    if not rad_docs:
        gaps.append("- Imagerie manquante : aucun document radiologique trouvé")
    else:
        gaps.append(f"- Imagerie : aucune imagerie après {_iso_date(latest_rad_date)}")
    
    # Scoreboard
    today = datetime.now().strftime("%Y-%m-%d")
    latest_abnormal_total = _latest_date_abnormal_count(latest_date_labs)
    
    # Render
    lines = []
    lines.append(f"PRÉPARATION CONSULTATION — Patient {patient_id}")
    lines.append(f"Généré le {today}")
    lines.append("")
    
    lines.append("TABLEAU DE BORD")
    lines.append(
        f"- Dernier bilan : {_iso_date(latest_lab_date)} | Bilans biologiques : {len(lab_docs_sorted)} | "
        f"Panneaux à la dernière date : {len(latest_date_labs)} | "
        f"Anormaux sur les panneaux de la dernière date : {latest_abnormal_total}"
    )
    lines.append(f"- Dernière imagerie : {_iso_date(latest_rad_date)} | Comptes rendus radiologiques : {len(rad_docs)}")
    lines.append("")
    
    if top_flags:
        lines.append("ALERTES PRINCIPALES (plus grand % hors référence, bilans de la dernière date)")
        lines.append("(Note : déviation quantitative uniquement, pas la gravité clinique)")
        for x in top_flags:
            ref = _format_ref(x["ref_low"], x["ref_high"])
            r = x.get("ratio")
            r_str = f"{r*100:.0f}%" if r is not None else "n/a"
            lines.append(
                f"- [{x['panel']}] {x['name']} : {x['value']} {x['unit']} {ref} → {x['flag']} ({r_str} hors référence)"
            )
        lines.append("")
    
    lines.append("1) Dernières données clés")
    if latest_lab:
        lines.append("- Derniers panneaux de laboratoire :")
        lines.append(f"  • Date : {_iso_date(latest_lab_date)}")
        lines.append(f"  • Panneaux disponibles : {len(latest_date_labs)}")
        
        for labdoc in sorted(latest_date_labs, key=lambda d: ((d.get("metadata") or {}).get("panel_name") or "")):
            md = labdoc.get("metadata") or {}
            panel = md.get("panel_name") or "inconnu"
            lines.append(f"  • Panneau : {panel}")
            
            # abnormal list per panel
            abnormal_lines = []
            for t in (labdoc.get("structured") or {}).get("tests", []):
                if t.get("flag") in ("low", "high"):
                    ref = _format_ref(t.get("ref_low"), t.get("ref_high"))
                    abnormal_lines.append(f"    - {t.get('name')} : {t.get('value')} {t.get('unit')} {ref} → {t.get('flag')}")
            if abnormal_lines:
                lines.append("    Valeurs anormales :")
                lines.extend(abnormal_lines)
            else:
                lines.append("    Valeurs anormales : aucune identifiée dans ce panneau")
    else:
        lines.append("- Dernier panneau de laboratoire : aucun trouvé")
    
    lines.append("")
    if latest_rad:
        md = latest_rad.get("metadata") or {}
        lines.append("- Dernier examen radiologique :")
        lines.append(f"  • Date : {_iso_date(md.get('date_of_service'))}")
        lines.append(f"  • Type d'examen : {md.get('type_examen') or 'inconnu'}")
        lines.append("  • Conclusion :")
        lines.append(f"    {rad_conclusion or 'Aucun texte de conclusion disponible'}")
    else:
        lines.append("- Dernier examen radiologique : aucun trouvé")
    
    lines.append("")
    lines.append("2) Tendances notables (si disponibles)")
    lines.extend(trend_lines)
    
    lines.append("")
    lines.append("3) Changements depuis la dernière visite")
    if latest_lab and prev_lab:
        lines.extend(_diff_labs(latest_lab, prev_lab))
    else:
        # Determine if there is any prior distinct lab date
        all_lab_dates = []
        for d in lab_docs_sorted:
            ds = (d.get("metadata") or {}).get("date_of_service")
            if ds:
                all_lab_dates.append(ds)
        
        distinct_dates = sorted(set(all_lab_dates))
        if latest_lab_date and len(distinct_dates) <= 1:
            lines.append(f"- Bilans : aucune date de bilan antérieure à comparer (tous les panneaux de laboratoire datés {latest_lab_date})")
        else:
            lines.append("- Bilans : aucun rapport de laboratoire antérieur à comparer")
    
    if latest_rad and prev_rad:
        # Simple factual diff: show if conclusion text changed
        prev_conc = ((prev_rad.get("structured") or {}).get("conclusion") or "").strip()
        latest_conc = ((latest_rad.get("structured") or {}).get("conclusion") or "").strip()
        if prev_conc != latest_conc:
            prev_date = (prev_rad.get("metadata") or {}).get("date_of_service")
            latest_date = (latest_rad.get("metadata") or {}).get("date_of_service")
            lines.append(f"- Imagerie : le texte de conclusion diffère (vs {prev_date} → {latest_date})")
        else:
            lines.append("- Imagerie : texte de conclusion inchangé vs rapport précédent")
    else:
        lines.append("- Imagerie : aucun rapport radiologique antérieur à comparer")
    
    lines.append("")
    lines.append("4) Lacunes dans les données")
    lines.extend(gaps)
    
    lines.append("")
    lines.append("5) Couverture des sources")
    lines.append("- Documents examinés :")
    lines.append(f"  • Rapports de laboratoire : {len(lab_docs_sorted)}")
    lines.append(f"  • Rapports de radiologie : {len(rad_docs)}")
    lines.append(f"  • Autres documents : {len(other_docs)}")
    
    return "\n".join(lines)


def generate_consultation_prep(patient_id: str, processed_dir: str = "data/processed") -> str:
    """
    Generate consultation preparation summary for a patient.
    
    Main orchestrator that:
    1. Loads documents
    2. Computes lab context (latest/prev, abnormals)
    3. Computes top flags
    4. Computes trends
    5. Renders final output
    """
    docs = _load_patient_docs(patient_id, processed_dir)
    
    lab_docs = [d for d in docs if d.get("document_type") == "lab"]
    rad_docs = [d for d in docs if d.get("document_type") == "radiology"]
    other_docs = [d for d in docs if d.get("document_type") not in ("lab", "radiology")]
    
    # Compute components
    lab_ctx = compute_latest_lab_context(lab_docs)
    top_flags = compute_top_flags(lab_ctx["latest_date_labs"], top_k=3)
    trend_lines = compute_trends(lab_docs, lab_ctx["latest_lab"])
    
    # Render
    return render_consultation_prep(
        patient_id=patient_id,
        lab_ctx=lab_ctx,
        rad_docs=rad_docs,
        other_docs=other_docs,
        top_flags=top_flags,
        trend_lines=trend_lines,
    )


def generate_structured_prep(
    patient_id: str,
    processed_dir: str = "data/processed",
) -> Dict[str, Any]:
    """
    Generate structured canvas sections using AI.
    
    Returns dict with sections:
    - summary
    - red_flags
    - timeline
    - active_problems
    - meds
    - labs_highlights
    - imaging_highlights
    - questions
    """
    # Get raw prep text
    raw_prep = generate_consultation_prep(patient_id, processed_dir)
    
    # Load docs for source refs
    docs = _load_patient_docs(patient_id, processed_dir)
    lab_docs = [d for d in docs if d.get("document_type") == "lab"]
    rad_docs = [d for d in docs if d.get("document_type") == "radiology"]
    prescription_docs = [d for d in docs if d.get("document_type") == "prescription"]
    
    # Build medications text from prescriptions
    meds_text_lines = []
    if prescription_docs:
        # Sort by date, most recent first
        sorted_prescriptions = sorted(
            prescription_docs,
            key=lambda d: (d.get("metadata") or {}).get("date_of_service") or "0000-00-00",
            reverse=True
        )
        
        for rx in sorted_prescriptions:
            md = rx.get("metadata") or {}
            date_str = md.get("date_of_service") or "unknown date"
            prescriber = md.get("prescriber_full_name") or "Unknown prescriber"
            
            items = (rx.get("structured") or {}).get("items", [])
            if items:
                meds_text_lines.append(f"**Prescription from {date_str}** (by {prescriber}):")
                for item in items:
                    drug = item.get("drug_name") or "Unknown drug"
                    dose = item.get("dose") or ""
                    frequency = item.get("frequency") or ""
                    duration = item.get("duration") or ""
                    form = item.get("form") or ""
                    
                    med_line = f"- **{drug}**"
                    if form:
                        med_line += f" ({form})"
                    if dose:
                        med_line += f": {dose}"
                    if frequency:
                        med_line += f" {frequency}"
                    if duration:
                        med_line += f" {duration}"
                    
                    meds_text_lines.append(med_line)
                meds_text_lines.append("")  # Empty line between prescriptions
    
    meds_from_prescriptions = "\n".join(meds_text_lines) if meds_text_lines else ""
    
    # Use LLM to structure the prep
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.0)
    
    # Enhanced prompt with prescription data
    meds_prompt_part = ""
    if meds_from_prescriptions:
        meds_prompt_part = f"""

PRESCRIPTION MEDICATIONS FOUND:
{meds_from_prescriptions}

For the "meds" section, use the prescription data above as the primary source."""
    
    prompt = f"""You are helping structure a clinical consultation prep document.

Given this raw prep text:

{raw_prep}{meds_prompt_part}

Structure it into these sections (output as JSON). Each section should use clear markdown formatting with headers, bullet points, and visual hierarchy:

{{
  "summary": {{"text": "### Patient Overview\\n\\n• **Chief Concerns:** Brief summary\\n\\n• **Recent Activity:** Key recent events\\n\\n• **Status:** Current health status\\n\\n• **Priority Items:** Most important points\\n\\n• **Context:** Relevant background", "source_refs": []}},
  "red_flags": {{"text": "### Urgent Attention Required\\n\\n• **[URGENT]** Critical finding or concern\\n\\n• **[MONITOR]** Item requiring close monitoring\\n\\n• Use clear bullet points with severity indicators", "source_refs": []}},
  "timeline": {{"items": [{{"date": "2025-12-20", "event": "Lab panel showing...", "source_ref": null}}]}},
  "active_problems": {{"text": "### Current Health Issues\\n\\n• **Problem 1:** Description and current status\\n\\n• **Problem 2:** Description and current status\\n\\n  - Treatment: Current approach\\n  - Status: Improving/Stable/Worsening", "source_refs": []}},
  "meds": {{"text": "**Prescription from [date]** (by [prescriber]):\\n\\n- **Drug name** (form): dose frequency duration", "source_refs": []}},
  "labs_highlights": {{"text": "### Recent Laboratory Results\\n\\n**[Date] - Panel Name:**\\n\\n• **Test Name:** Value Unit (Flag) - Normal range\\n\\n  - Clinical significance if abnormal\\n\\n**Trends:**\\n\\n• Significant changes over time", "source_refs": []}},
  "imaging_highlights": {{"text": "### Recent Imaging Studies\\n\\n**[Date] - Study Type:**\\n\\n• **Findings:** Key observations\\n\\n• **Impression:** Radiologist conclusion\\n\\n• **Follow-up:** Recommendations if any", "source_refs": []}},
  "questions": {{"text": "### Key Questions for Consultation\\n\\n1. **Symptoms:** Specific question about current symptoms?\\n\\n2. **Treatment:** Question about medication adherence or effectiveness?\\n\\n3. **Lifestyle:** Question about relevant lifestyle factors?\\n\\n4. **Concerns:** Address any patient concerns or observations?\\n\\n5. **Follow-up:** Question about response to previous recommendations?", "source_refs": []}}
}}

Rules:
- Use markdown headers (###) for section titles
- Use bullet points (•) for lists
- Use **bold** for emphasis on key terms
- Include specific dates in [YYYY-MM-DD] format
- Include values and units for labs
- Add severity indicators like [URGENT], [MONITOR], [STABLE]
- For abnormal findings, explain clinical significance
- Keep concise but informative
- For medications: include drug name, form, dose, frequency, and duration from prescriptions
- Output ONLY valid JSON, no markdown code blocks
"""
    
    response = llm.invoke(prompt)
    
    # Parse JSON response
    try:
        sections = json.loads(response.content)
    except json.JSONDecodeError:
        # Fallback: try to extract JSON from markdown code block
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        sections = json.loads(content.strip())
    
    # Ensure all text fields are strings (fix any objects/arrays returned by LLM)
    for section_key in sections:
        if isinstance(sections[section_key], dict) and "text" in sections[section_key]:
            text_value = sections[section_key]["text"]
            if isinstance(text_value, list):
                # Format medications array into markdown with prescription header
                if section_key == "meds" and all(isinstance(item, dict) for item in text_value):
                    # Get prescription info from the first prescription doc
                    prescription_header = ""
                    if prescription_docs:
                        doc = prescription_docs[0]
                        # Handle both dict and object access patterns
                        if isinstance(doc, dict):
                            md = doc.get('metadata') or {}
                            date_val = md.get('date_of_service')
                            if date_val:
                                if isinstance(date_val, str):
                                    date = date_val
                                else:
                                    date = date_val.strftime("%Y-%m-%d")
                            else:
                                date = "Unknown date"
                            prescriber = md.get('prescriber_full_name') or md.get('prescriber_name') or "Unknown prescriber"
                        else:
                            date = doc.date_of_service.strftime("%Y-%m-%d") if doc.date_of_service else "Unknown date"
                            prescriber = doc.prescriber_name if hasattr(doc, 'prescriber_name') and doc.prescriber_name else "Unknown prescriber"
                        prescription_header = f"**Prescription from {date}** (by {prescriber}):\n"
                    
                    formatted_meds = []
                    for med in text_value:
                        drug = med.get("drug_name", "Unknown")
                        form = med.get("form", "")
                        dose = med.get("dose", "")
                        frequency = med.get("frequency", "")
                        duration = med.get("duration", "")
                        
                        med_line = f"- **{drug}**"
                        if form:
                            med_line += f" ({form})"
                        med_line += ":"
                        details = []
                        if dose:
                            details.append(dose)
                        if frequency:
                            details.append(frequency)
                        if duration:
                            details.append(f"pendant {duration}")
                        if details:
                            med_line += f" {' '.join(details)}"
                        formatted_meds.append(med_line)
                    
                    sections[section_key]["text"] = prescription_header + "\n".join(formatted_meds)
                else:
                    # Convert other arrays to JSON string
                    sections[section_key]["text"] = json.dumps(text_value, indent=2)
            elif isinstance(text_value, dict):
                # Convert to JSON string if it's not a string
                sections[section_key]["text"] = json.dumps(text_value, indent=2)
            elif not isinstance(text_value, str):
                sections[section_key]["text"] = str(text_value)
    
    # If LLM didn't populate meds but we have prescriptions, add them directly
    if prescription_docs and (not sections.get("meds") or not sections["meds"].get("text") or sections["meds"]["text"] == "Current medications if mentioned"):
        sections["meds"] = {
            "text": meds_from_prescriptions if meds_from_prescriptions else "No current medications documented",
            "source_refs": []
        }
    
    return sections
