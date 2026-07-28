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
                    say("Please specify a patient name, e.g. `@workbuddy draft note for Sarah`")
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
                    say("Please specify a patient name, e.g. `@workbuddy draft message for Sarah`")
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
                    say("Please specify a patient and time, e.g. `@workbuddy book Sarah Thursday 3pm`")
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
                    say("Please specify a patient name, e.g. `@workbuddy show Sarah progress`")
                    return
                from .services import build_patient_summary_blocks, find_patient_by_name
                patient = find_patient_by_name(name_query)
                if not patient:
                    say(f"Could not find a patient matching '{name_query}'.")
                    return
                say(blocks=build_patient_summary_blocks(patient))

            else:
                say(
                    "Hi! I'm workbuddy. I can help with:\n"
                    "• `@workbuddy summary` — whole-roster overview\n"
                    "• `@workbuddy show [name] progress` — patient summary with trend sparklines\n"
                    "• `@workbuddy draft note for [name]` — clinical note from last session\n"
                    "• `@workbuddy draft message for [name]` — encouraging patient message\n"
                    "• `@workbuddy book [name] [when]` — request a consultation"
                )

        @csrf_exempt
        def slack_events(request):
            return handler.handle(request)
