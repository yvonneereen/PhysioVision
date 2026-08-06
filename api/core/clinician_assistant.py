"""Website-native command router for the authenticated clinician assistant.

The clinical operations remain in ``api.slack_bot.services`` while Slack is
phased out as a user interface. This router never accepts a clinician id from
the browser: its scope is always the authenticated clinician profile.
"""

import re


HELP_TEXT = """I can help with:

Your roster
• my patients — roster overview
• who needs review — open escalations
• resolve [name] — clear a patient's escalations
• today — consultations and new flags

Lookups
• show [name] progress — progress summary
• pain [name] · adherence [name] · sessions [name]

Drafting and scheduling
• draft note for [name] — clinical note from the latest session
• draft message for [name] — encouraging patient message
• book [name] [when] — request a consultation

Actions
• send message to [name] — email an encouragement
• confirm [name] — confirm a pending consultation
• assign [exercise] to [name] — prescribe one exercise

AI programme builder
• build a plan for [name] — draft a programme
• revise [name] [change] — refine the draft
• accept plan for [name] — create prescriptions from the draft
• summary — whole-roster overview"""


def _plain_blocks(blocks):
    text = "\n".join(
        block.get("text", {}).get("text", "")
        for block in blocks
        if block.get("text", {}).get("text")
    )
    replacements = {
        ":white_check_mark:": "✓",
        ":rotating_light:": "Review:",
        ":calendar:": "",
        ":clipboard:": "",
        ":microscope:": "Considered:",
        ":email:": "",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"[*_`]", "", text).strip()


def _name_after(text, phrase):
    match = re.search(
        rf"\b{phrase}\b\s+(?:for\s+|to\s+)?([a-z][a-z .'-]*)",
        text,
        re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def _patient_or_reply(services, clinician, name):
    if not name:
        names = services.roster_names(clinician)
        roster = "\n".join(f"• {item}" for item in names) or "No linked patients yet."
        return None, f"Which patient?\n{roster}"
    patient = services.find_patient_by_name(name, clinician=clinician)
    if not patient:
        return None, f"Could not find a patient matching “{name}” in your roster."
    return patient, None


def _general_name(text):
    match = re.search(
        r"(?:for|show|book|about)\s+([a-z .'-]+?)"
        r"(?:\s+(?:progress|note|summary|message|on|at|tomorrow|today|next|mon|tue|wed|thu|fri|sat|sun)|\s*$)",
        text,
        re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def _plan_payload(draft):
    from api.catalogue.models import Exercise

    plan = draft.plan
    dose = draft.preferences.get("dose", {})
    exercise_ids = []
    for day in plan.get("days", []):
        for exercise_id in day.get("exercise_ids", day.get("exerciseIds", [])):
            if exercise_id not in exercise_ids:
                exercise_ids.append(exercise_id)
    exercises = {
        exercise.id: exercise
        for exercise in Exercise.objects.filter(id__in=exercise_ids)
    }
    days_per_week = plan.get("constraints", {}).get(
        "days_per_week",
        draft.preferences.get("days_per_week", 3),
    )
    rows = []
    for exercise_id in exercise_ids:
        exercise = exercises.get(exercise_id)
        prescribed_dose = dose.get(exercise_id, {})
        rows.append({
            "id": exercise_id,
            "name": exercise.name if exercise else exercise_id,
            "sets": prescribed_dose.get("sets", getattr(exercise, "default_sets", None)),
            "reps": prescribed_dose.get("reps", getattr(exercise, "default_reps", None)),
            "days_per_week": days_per_week,
            "available": bool(exercise),
        })
    patient_name = (
        draft.patient.user.get_full_name().strip()
        or draft.patient.user.email
    )
    return {
        "patient_name": patient_name,
        "patient_first_name": draft.patient.user.first_name or patient_name,
        "clinical_context": draft.preferences.get("clinical_summary", ""),
        "summary": plan.get("summary", ""),
        "exercises": rows,
    }


def dispatch_clinician_command(user, message):
    """Return a command response dict, or ``None`` for conversational Gemini."""
    clinician = getattr(user, "clinician_profile", None)
    if clinician is None:
        return None

    from api.slack_bot import services

    text = re.sub(r"\s+", " ", message.strip()).lower()

    def response(reply, command, *, changed=False, data=None):
        result = {"reply": reply, "command": command, "changed": changed}
        if data is not None:
            result["data"] = data
        return result

    if text in {"help", "commands", "what can you do", "what can you do?"}:
        return response(HELP_TEXT, "help")

    if "my patients" in text or "my roster" in text:
        return response(_plain_blocks(services.build_roster_summary_blocks(clinician)), "roster")

    if "needs review" in text or "who needs" in text:
        return response(_plain_blocks(services.build_needs_review_blocks(clinician)), "needs_review")

    if text == "today" or "today's overview" in text:
        return response(_plain_blocks(services.build_today_blocks(clinician)), "today")

    if re.search(r"\bresolve\b", text):
        name = _name_after(text, "resolve")
        patient, count, error = services.resolve_patient_escalations(clinician, name or "")
        if error:
            return response(error, "resolve")
        reply = (
            f"Resolved {count} escalation(s) for {patient.user.first_name}; marked as action taken."
            if count else f"{patient.user.first_name} has no open escalations to resolve."
        )
        return response(reply, "resolve", changed=bool(count))

    for keyword, builder in (
        ("pain", services.build_pain_blocks),
        ("adherence", services.build_adherence_blocks),
        ("sessions", services.build_sessions_blocks),
    ):
        if re.search(rf"\b{keyword}\b", text):
            patient, error = _patient_or_reply(services, clinician, _name_after(text, keyword))
            if error:
                return response(error, keyword)
            return response(_plain_blocks(builder(patient)), keyword)

    if "send" in text and "message" in text:
        name = _name_after(text, r"send\s+message")
        patient, body, error = services.send_patient_message(clinician, name or "")
        if error:
            return response(error, "send_message")
        return response(
            f"Sent to {patient.user.first_name} ({patient.user.email}):\n\n{body}",
            "send_message",
            changed=True,
        )

    if re.search(r"\bconfirm\b", text):
        name = _name_after(text, "confirm")
        consultation, error = services.confirm_consultation(clinician, name or "")
        if error:
            return response(error, "confirm")
        return response(
            f"Confirmed consultation with {consultation.patient.user.first_name} on "
            f"{consultation.scheduled_at:%a %d %b, %H:%M}.",
            "confirm",
            changed=True,
        )

    if re.search(r"\bassign\b", text):
        match = re.search(r"assign\s+(.+?)\s+to\s+([a-z][a-z .'-]*)$", text)
        if not match:
            return response("Use: assign [exercise] to [patient]", "assign")
        patient, result, error = services.assign_exercise(
            clinician, match.group(1).strip(), match.group(2).strip()
        )
        if error:
            return response(error, "assign")
        exercise, prescription = result
        return response(
            f"Assigned {exercise.name} to {patient.user.first_name}: "
            f"{prescription.sets}×{prescription.reps}, {prescription.days_per_week}×/week.",
            "assign",
            changed=True,
        )

    if "accept" in text and "plan" in text:
        name = _name_after(text, r"accept\s+plan")
        patient, created, error = services.accept_plan_draft(clinician, name or "")
        if error:
            return response(error, "accept_plan")
        return response(
            f"Created {created} prescription(s) for {patient.user.first_name} from the draft.",
            "accept_plan",
            changed=bool(created),
        )

    if "build" in text and "plan" in text:
        name = _name_after(text, r"build(?:\s+a)?\s+plan")
        days_match = re.search(r"([234])\s*days?", text)
        equipment = (
            "chair_band" if "band" in text
            else "none" if "no equipment" in text or "no kit" in text
            else "chair"
        )
        patient, draft, error = services.build_plan_draft(
            clinician,
            name or "",
            days_per_week=int(days_match.group(1)) if days_match else 3,
            equipment=equipment,
        )
        if error:
            return response(error, "build_plan")
        return response(
            _plain_blocks(services.build_plan_draft_blocks(draft)),
            "build_plan",
            changed=True,
            data=_plan_payload(draft),
        )

    if re.search(r"\brevise\b", text):
        match = re.search(r"revise\s+([a-z][a-z'-]*)\s+(.+)", text)
        if not match:
            return response("Use: revise [patient] [what to change]", "revise_plan")
        patient, draft, error = services.revise_plan_draft(
            clinician, match.group(1).strip(), match.group(2).strip()
        )
        if error:
            return response(error, "revise_plan")
        return response(
            _plain_blocks(services.build_plan_draft_blocks(draft)),
            "revise_plan",
            changed=True,
            data=_plan_payload(draft),
        )

    if "draft note" in text or ("note" in text and "draft" in text):
        name = _general_name(text) or _name_after(text, r"draft\s+note")
        patient, error = _patient_or_reply(services, clinician, name)
        if error:
            return response(error, "draft_note")
        session = patient.sessions.order_by("-started_at").first()
        if not session:
            return response(f"No sessions found for {patient.user.first_name}.", "draft_note")
        return response(services.generate_clinical_note(session), "draft_note")

    if "draft message" in text:
        name = _general_name(text) or _name_after(text, r"draft\s+message")
        patient, error = _patient_or_reply(services, clinician, name)
        if error:
            return response(error, "draft_message")
        return response(services.generate_patient_message(patient), "draft_message")

    if re.search(r"\b(book|schedule)\b", text):
        name = _general_name(text)
        patient, error = _patient_or_reply(services, clinician, name)
        if error:
            return response(error, "book")
        when_text = text.split(name, 1)[-1].strip() if name and name in text else ""
        consultation, error = services.schedule_consultation(patient, when_text)
        if error:
            return response(error, "book")
        return response(
            f"Requested a consultation for {patient.user.first_name} on "
            f"{consultation.scheduled_at:%a %d %b, %H:%M}.",
            "book",
            changed=True,
        )

    if "progress" in text or text.startswith("show "):
        match = re.search(r"show\s+(.+?)\s+progress", text)
        name = match.group(1).strip() if match else _general_name(text)
        patient, error = _patient_or_reply(services, clinician, name)
        if error:
            return response(error, "progress")
        return response(_plain_blocks(services.build_patient_summary_blocks(patient)), "progress")

    if text in {"summary", "roster summary", "clinic summary"}:
        return response(_plain_blocks(services.build_roster_summary_blocks(clinician)), "summary")

    return None
