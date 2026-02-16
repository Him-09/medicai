"""
Generate consultation summary for future reference.
Produces a structured JSON summary capturing all significant clinical data.
"""
import json
from typing import Dict, List
from medicai.storage.consultation_summary_store import upsert_summary


def generate_consultation_summary(
    patient_id: str,
    consultation_id: str,
    workspace_data: Dict
) -> Dict:
    """
    Generate a comprehensive consultation summary from workspace data.
    Stores a structured JSON for rich frontend rendering.
    """

    # --- Visit focus ---
    visit_focus = (workspace_data.get("visit_focus") or "").strip()

    # --- Agenda ---
    raw_agenda = workspace_data.get("agenda") or []
    agenda_items: List[str] = []
    for item in raw_agenda:
        if isinstance(item, dict):
            text = (item.get("text") or "").strip()
            if text:
                agenda_items.append(text)
        elif isinstance(item, str) and item.strip():
            agenda_items.append(item.strip())

    # --- HPI ---
    hpi_raw = workspace_data.get("hpi") or {}
    hpi: Dict = {}
    if isinstance(hpi_raw, dict):
        one_liner = (hpi_raw.get("one_liner") or "").strip()
        if one_liner:
            hpi["one_liner"] = one_liner

        # Symptoms
        symptoms_raw = hpi_raw.get("symptoms") or []
        symptoms: List[Dict] = []
        for s in symptoms_raw:
            if isinstance(s, dict):
                name = (s.get("name") or "").strip()
                if name:
                    entry: Dict = {"name": name}
                    details = (s.get("details") or "").strip()
                    if details:
                        entry["details"] = details
                    symptoms.append(entry)
        if symptoms:
            hpi["symptoms"] = symptoms

        # Red flags
        red_flags_raw = hpi_raw.get("red_flags") or []
        red_flags: List[Dict] = []
        for rf in red_flags_raw:
            if isinstance(rf, dict):
                label = (rf.get("label") or "").strip()
                if label:
                    red_flags.append({
                        "label": label,
                        "checked": rf.get("checked"),
                    })
        if red_flags:
            hpi["red_flags"] = red_flags

        # Since last visit
        slv = hpi_raw.get("since_last_visit")
        if isinstance(slv, str) and slv.strip():
            hpi["since_last_visit"] = slv.strip()
        elif isinstance(slv, list) and slv:
            items = []
            for entry in slv:
                if isinstance(entry, dict):
                    label = (entry.get("label") or "").strip()
                    if label:
                        items.append(label)
                elif isinstance(entry, str) and entry.strip():
                    items.append(entry.strip())
            if items:
                hpi["since_last_visit"] = items

        # Objective highlights
        obj_raw = hpi_raw.get("objective_highlights") or []
        obj_highlights: List[str] = []
        for o in obj_raw:
            if isinstance(o, dict):
                text = (o.get("text") or "").strip()
                if text:
                    obj_highlights.append(text)
            elif isinstance(o, str) and o.strip():
                obj_highlights.append(o.strip())
        if obj_highlights:
            hpi["objective_highlights"] = obj_highlights

        # Patient goal
        patient_goal = (hpi_raw.get("patient_goal") or "").strip()
        if patient_goal:
            hpi["patient_goal"] = patient_goal

    # --- Problems ---
    problems_raw = workspace_data.get("problems") or []
    problems: List[Dict] = []
    for p in problems_raw:
        if not isinstance(p, dict):
            continue
        title = (p.get("title") or "").strip()
        if not title:
            continue

        prob: Dict = {"title": title}

        urgency = (p.get("urgency") or "").strip()
        if urgency:
            prob["urgency"] = urgency

        assessment = (p.get("assessment") or "").strip()
        if assessment:
            prob["assessment"] = assessment

        # Evidence
        evidence_raw = p.get("evidence") or []
        evidence: List[str] = []
        for e in evidence_raw:
            if isinstance(e, dict):
                label = (e.get("label") or "").strip()
                if label:
                    evidence.append(label)
            elif isinstance(e, str) and e.strip():
                evidence.append(e.strip())
        if evidence:
            prob["evidence"] = evidence

        # Plan buckets
        plan_raw = p.get("plan") or {}
        plan_summary: Dict = {}
        if isinstance(plan_raw, dict):
            for bucket in ["today", "orders", "treatment", "follow_up", "safety_net"]:
                items_raw = plan_raw.get(bucket) or []
                items: List[str] = []
                for item in items_raw:
                    if isinstance(item, dict):
                        text = (item.get("text") or "").strip()
                        if text:
                            items.append(text)
                    elif isinstance(item, str) and item.strip():
                        items.append(item.strip())
                if items:
                    plan_summary[bucket] = items
        elif isinstance(plan_raw, list):
            flat: List[str] = []
            for item in plan_raw:
                if isinstance(item, dict):
                    text = (item.get("text") or "").strip()
                    if text:
                        flat.append(text)
                elif isinstance(item, str) and item.strip():
                    flat.append(item.strip())
            if flat:
                plan_summary["today"] = flat

        if plan_summary:
            prob["plan"] = plan_summary

        problems.append(prob)

    # --- Orders ---
    orders_raw = workspace_data.get("workspaceOrders") or {}
    orders: Dict = {}
    if isinstance(orders_raw, dict):
        for key in ["rx_intents", "referral_intents", "followup_intents", "lab_imaging_intents"]:
            intents = orders_raw.get(key) or []
            items: List[str] = []
            for intent in intents:
                if isinstance(intent, dict):
                    text = (intent.get("text") or intent.get("medication") or intent.get("description") or "").strip()
                    if text:
                        items.append(text)
                elif isinstance(intent, str) and intent.strip():
                    items.append(intent.strip())
            if items:
                orders[key] = items

    # --- Quick notes ---
    notes_raw = workspace_data.get("quick_notes") or []
    quick_notes: List[str] = []
    for n in notes_raw:
        if isinstance(n, dict):
            text = (n.get("text") or "").strip()
            if text:
                quick_notes.append(text)
        elif isinstance(n, str) and n.strip():
            quick_notes.append(n.strip())

    # --- Generated documents ---
    documents: List[Dict] = []
    if isinstance(orders_raw, dict):
        docs_raw = orders_raw.get("documents") or []
        for doc in docs_raw:
            if isinstance(doc, dict):
                artifact_type = (doc.get("artifact_type") or "").strip()
                doc_status = (doc.get("status") or "").strip()
                channel = (doc.get("channel") or "").strip()
                if artifact_type:
                    entry: Dict = {"type": artifact_type, "status": doc_status}
                    if channel:
                        entry["channel"] = channel
                    documents.append(entry)

    # --- Build structured summary ---
    structured: Dict = {}
    if visit_focus:
        structured["visit_focus"] = visit_focus
    if agenda_items:
        structured["agenda"] = agenda_items
    if hpi:
        structured["hpi"] = hpi
    if problems:
        structured["problems"] = problems
    if orders:
        structured["orders"] = orders
    if documents:
        structured["documents"] = documents
    if quick_notes:
        structured["quick_notes"] = quick_notes

    summary_json = json.dumps(structured, ensure_ascii=False)

    # Store in database
    upsert_summary(
        consultation_id=consultation_id,
        patient_id=patient_id,
        summary=summary_json,
        source="workspace",
        version=2
    )

    return {
        "consultation_id": consultation_id,
        "patient_id": patient_id,
        "summary": summary_json,
        "source": "workspace"
    }
