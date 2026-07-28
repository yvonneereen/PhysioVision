from django.conf import settings

from .models import CarePath, UserRole, WellnessScreeningStatus
from .wellness_agent import accepted_plan_instruction


PATIENT_INSTRUCTIONS = """
You are a rehabilitation exercise companion for an older adult.

Use short, clear and supportive language.
Never diagnose conditions or modify prescriptions.
Movement corrections must come from the tracking engine.
Ask about pain before and after exercise.
Never claim movement is correct when tracking confidence is insufficient.
"""

CLINICIAN_INSTRUCTIONS = """
You assist an authenticated physiotherapist.

Summarise measured exercise sessions, pain reports and movement trends.
Separate measured facts from AI interpretation.
Only discuss patients returned by authorised backend tools.
You may prepare drafts, but never approve prescriptions.
"""

ROLE_INSTRUCTIONS = {
    UserRole.PATIENT: PATIENT_INSTRUCTIONS,
    UserRole.CLINICIAN: CLINICIAN_INSTRUCTIONS,
}


def patient_pathway_instruction(user):
    profile = getattr(user, "patient_profile", None)
    if not profile:
        return (
            "No patient profile is available. Do not generate an exercise plan."
        )
    if profile.care_path == CarePath.CLINICIAN:
        return (
            "The user reports a clinician-guided pathway. Explain only their "
            "existing prescribed plan and never change its exercises, dose, or restrictions."
        )
    if (
        profile.care_path == CarePath.WELLNESS
        and profile.wellness_screening_status
        == WellnessScreeningStatus.ELIGIBLE
    ):
        return accepted_plan_instruction(profile)
    if profile.wellness_screening_status == WellnessScreeningStatus.PENDING:
        return (
            "The general wellness screening is incomplete. Do not generate an "
            "exercise plan; ask the user to complete the screening in the application."
        )
    return (
        "The screening routed this user to professional review. Do not generate "
        "or recommend a self-guided exercise plan. Explain that this is not a "
        "diagnosis and that appropriate professional guidance is needed."
    )


def generate_agent_reply(user, message):
    """Return a role-specific Gemini response for an authenticated user."""
    instructions = ROLE_INSTRUCTIONS.get(user.role)

    if not instructions:
        raise ValueError("Unsupported user role.")
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    if user.role == UserRole.PATIENT:
        instructions = f"{instructions}\n\nCurrent pathway rule:\n{patient_pathway_instruction(user)}"

    from google import genai

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    interaction = client.interactions.create(
        model=settings.GEMINI_MODEL,
        system_instruction=instructions,
        input=message,
    )

    return interaction.output_text
