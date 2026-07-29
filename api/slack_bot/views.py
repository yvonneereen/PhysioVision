import re

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt


def slack_events(request):
    """Keep the rest of the API available when Slack is not configured."""
    return JsonResponse(
        {"detail": "Slack integration is not configured."},
        status=503,
    )


def _arg_after(text, keyword):
    """Pull the patient name that follows a command keyword, ignoring the bot
    mention token and an optional 'for'/'to' filler. e.g. 'pain for sarah' → 'sarah'."""
    cleaned = re.sub(r'<@[^>]+>', '', text)
    m = re.search(keyword + r"\s+(?:for\s+|to\s+)?([a-z][a-z .'-]*)", cleaned)
    return m.group(1).strip() if m else None


if settings.SLACK_BOT_TOKEN and settings.SLACK_SIGNING_SECRET:
    try:
        from slack_bolt import App
        from slack_bolt.adapter.django import SlackRequestHandler
    except ImportError:
        pass
    else:
        slack_app = App(
            token=settings.SLACK_BOT_TOKEN,
            signing_secret=settings.SLACK_SIGNING_SECRET,
            token_verification_enabled=False,
        )
        handler = SlackRequestHandler(slack_app)

        @slack_app.event("app_mention")
        def handle_mention(event, say):
            text = event.get("text", "").lower()

            # Account linking: `@Physio Assistant link 483920`. Handled first so the code
            # is never mistaken for a patient name by the command parser below.
            link_match = re.search(r'\blink\s+(\d{4,8})\b', text)
            if link_match:
                from .services import link_slack_user
                clinician, error = link_slack_user(link_match.group(1), event.get("user", ""))
                if error:
                    say(error)
                else:
                    name = clinician.user.get_full_name() or clinician.user.email
                    say(
                        f":white_check_mark: Linked to *{name}*'s account. "
                        "I'll scope your commands to your patients."
                    )
                return

            # Who is speaking? Resolved from the link flow; None until they link.
            from .services import find_clinician_by_slack_user
            clinician = find_clinician_by_slack_user(event.get("user", ""))

            def _need_link():
                say(
                    "Link your account first: send `@Physio Assistant link <code>` — "
                    "grab a code from *Connect Slack* on your dashboard."
                )

            # ── Tier 1: triage scoped to the linked clinician ──
            if "my patients" in text or "my roster" in text:
                if not clinician:
                    _need_link(); return
                from .services import build_roster_summary_blocks
                say(blocks=build_roster_summary_blocks(clinician))
                return

            if "needs review" in text or "who needs" in text:
                if not clinician:
                    _need_link(); return
                from .services import build_needs_review_blocks
                say(blocks=build_needs_review_blocks(clinician))
                return

            if "resolve" in text:
                if not clinician:
                    _need_link(); return
                from .services import resolve_patient_escalations
                name = _arg_after(text, "resolve")
                if not name:
                    say("Which patient? e.g. `@Physio Assistant resolve Sarah`"); return
                patient, count, error = resolve_patient_escalations(clinician, name)
                if error:
                    say(error)
                elif count:
                    say(
                        f":white_check_mark: Resolved {count} escalation(s) for "
                        f"*{patient.user.first_name}* — marked as action taken."
                    )
                else:
                    say(f"{patient.user.first_name} has no open escalations to resolve.")
                return

            if "today" in text:
                if not clinician:
                    _need_link(); return
                from .services import build_today_blocks
                say(blocks=build_today_blocks(clinician))
                return

            # ── Tier 2: per-patient lookups ──
            for keyword, builder_name in (
                ("pain", "build_pain_blocks"),
                ("adherence", "build_adherence_blocks"),
                ("sessions", "build_sessions_blocks"),
            ):
                if keyword in text:
                    name = _arg_after(text, keyword)
                    if not name:
                        say(f"Which patient? e.g. `@Physio Assistant {keyword} Sarah`"); return
                    from . import services
                    patient = services.find_patient_by_name(name, clinician=clinician)
                    if not patient:
                        scope = " in your roster" if clinician else ""
                        say(f"Could not find a patient matching '{name}'{scope}."); return
                    say(blocks=getattr(services, builder_name)(patient))
                    return

            name_match = re.search(
                r'(?:for|show|book|about)\s+([a-z ]+?)'
                r'(?:\s+(?:progress|note|summary|message|on|at|tomorrow|today|next|mon|tue|wed|thu|fri|sat|sun)|\s*$)',
                text,
            )
            name_query = name_match.group(1).strip() if name_match else None

            # Roster-wide summary — no name means "summarise everyone".
            if "summary" in text and not name_query:
                from .services import build_roster_summary_blocks
                say(blocks=build_roster_summary_blocks())
                return

            if "note" in text:
                if not name_query:
                    say("Please specify a patient name, e.g. `@Physio Assistant draft note for Sarah`")
                    return
                from .services import find_patient_by_name, generate_clinical_note
                from api.sessions.models import Session
                patient = find_patient_by_name(name_query)
                if not patient:
                    say(f"Could not find a patient matching '{name_query}'.")
                    return
                session = Session.objects.filter(patient=patient).order_by('-started_at').first()
                if not session:
                    say(f"No sessions found for {patient.user.first_name}.")
                    return
                say(f"Drafting note for {patient.user.first_name}'s last session…")
                note = generate_clinical_note(session)
                say(f"*Draft clinical note:*\n```{note}```")

            elif "message" in text or "draft" in text:
                if not name_query:
                    say("Please specify a patient name, e.g. `@Physio Assistant draft message for Sarah`")
                    return
                from .services import find_patient_by_name, generate_patient_message
                patient = find_patient_by_name(name_query)
                if not patient:
                    say(f"Could not find a patient matching '{name_query}'.")
                    return
                draft = generate_patient_message(patient)
                say(
                    f"*Draft message for {patient.user.first_name}:*\n{draft}\n\n"
                    "_Draft only — in a future version this will auto-email the patient._"
                )

            elif "book" in text or "schedule" in text:
                if not name_query:
                    say("Please specify a patient and time, e.g. `@Physio Assistant book Sarah Thursday 3pm`")
                    return
                from .services import find_patient_by_name, schedule_consultation
                patient = find_patient_by_name(name_query)
                if not patient:
                    say(f"Could not find a patient matching '{name_query}'.")
                    return
                # Everything after the patient name is treated as the time phrase.
                when_text = text.split(name_query, 1)[-1].strip() if name_query in text else text
                consultation, error = schedule_consultation(patient, when_text)
                if error:
                    say(error)
                    return
                say(
                    f":calendar: Requested a consultation for {patient.user.first_name} "
                    f"on *{consultation.scheduled_at:%a %d %b, %H:%M}* "
                    f"with {consultation.clinician.user.get_full_name() or 'their clinician'}."
                )

            elif "progress" in text or "show" in text or "summary" in text:
                if not name_query:
                    say("Please specify a patient name, e.g. `@Physio Assistant show Sarah progress`")
                    return
                from .services import build_patient_summary_blocks, find_patient_by_name
                patient = find_patient_by_name(name_query)
                if not patient:
                    say(f"Could not find a patient matching '{name_query}'.")
                    return
                say(blocks=build_patient_summary_blocks(patient))

            else:
                say(
                    "Hi! I'm Physio Assistant. I can help with:\n"
                    "*Your roster* (link your account first with `link [code]`):\n"
                    "• `@Physio Assistant my patients` — your roster overview\n"
                    "• `@Physio Assistant who needs review` — your open escalations\n"
                    "• `@Physio Assistant resolve [name]` — clear a patient's escalations\n"
                    "• `@Physio Assistant today` — your consultations + new flags\n"
                    "*Lookups:*\n"
                    "• `@Physio Assistant show [name] progress` — summary with trend sparklines\n"
                    "• `@Physio Assistant pain [name]` · `adherence [name]` · `sessions [name]`\n"
                    "*Drafting & scheduling:*\n"
                    "• `@Physio Assistant draft note for [name]` — clinical note from last session\n"
                    "• `@Physio Assistant draft message for [name]` — encouraging patient message\n"
                    "• `@Physio Assistant book [name] [when]` — request a consultation\n"
                    "• `@Physio Assistant summary` — whole-clinic overview"
                )

        @csrf_exempt
        def slack_events(request):
            return handler.handle(request)
