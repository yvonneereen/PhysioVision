import base64
import json
import logging
import math
import secrets
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .models import (
    EmergencyAlert,
    EmergencyAlertResponse,
    EmergencyAlertStatus,
    EmergencyContactVerificationChallenge,
    PatientProfile,
)


logger = logging.getLogger(__name__)


class EmergencyNotificationError(Exception):
    """Raised when an SMS or voice notification cannot be requested."""


class EmergencyVerificationCooldown(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after
        super().__init__("Please wait before requesting another code.")


class EmergencyVerificationDeliveryError(Exception):
    pass


def emergency_provider_ready():
    return (
        settings.EMERGENCY_ALERT_PROVIDER == "twilio"
        and bool(settings.TWILIO_ACCOUNT_SID)
        and bool(settings.TWILIO_AUTH_TOKEN)
        and bool(settings.TWILIO_FROM_NUMBER)
    )


def emergency_contact_ready(profile):
    return bool(
        emergency_provider_ready()
        and profile.emergency_contact_consent
        and profile.emergency_contact_name
        and profile.emergency_contact_phone
        and profile.emergency_contact_verified_at
    )


def normalize_outbound_phone(phone):
    digits = "".join(character for character in phone if character.isdigit())
    return f"+{digits}"


def _twilio_post(resource, payload):
    if not emergency_provider_ready():
        raise EmergencyNotificationError(
            "Automatic contact alerts are not configured on this server."
        )
    account_sid = settings.TWILIO_ACCOUNT_SID
    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{account_sid}/{resource}.json"
    )
    token = base64.b64encode(
        f"{account_sid}:{settings.TWILIO_AUTH_TOKEN}".encode("utf-8")
    ).decode("ascii")
    request = Request(
        url,
        data=urlencode(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise EmergencyNotificationError(
            f"The notification provider rejected the request ({exc.code}). {detail}"
        ) from exc
    except (URLError, TimeoutError, ValueError) as exc:
        raise EmergencyNotificationError(
            "The notification provider could not be reached."
        ) from exc
    message_id = str(result.get("sid", "")).strip()
    if not message_id:
        raise EmergencyNotificationError(
            "The notification provider did not return a request ID."
        )
    return message_id


def send_emergency_sms(phone, message):
    return _twilio_post("Messages", {
        "To": normalize_outbound_phone(phone),
        "From": settings.TWILIO_FROM_NUMBER,
        "Body": message,
    })


def place_emergency_voice_call(phone, message):
    # Twilio calls the saved contact, never an emergency-service number.
    digits = "".join(character for character in phone if character.isdigit())
    if digits in {"995", "999", "112", "911"}:
        raise EmergencyNotificationError(
            "Emergency-service numbers cannot be used as saved contacts."
        )
    twiml = (
        "<Response><Say voice=\"alice\">"
        f"{escape(message)}"
        "</Say></Response>"
    )
    return _twilio_post("Calls", {
        "To": normalize_outbound_phone(phone),
        "From": settings.TWILIO_FROM_NUMBER,
        "Twiml": twiml,
    })


def issue_emergency_contact_verification(profile):
    if not emergency_provider_ready():
        raise EmergencyVerificationDeliveryError(
            "Automatic contact alerts are not configured on this server."
        )
    if not (
        profile.emergency_contact_consent
        and profile.emergency_contact_name
        and profile.emergency_contact_phone
    ):
        raise ValueError("Save complete, consented contact details first.")

    with transaction.atomic():
        profile = PatientProfile.objects.select_for_update().get(pk=profile.pk)
        now = timezone.now()
        existing = EmergencyContactVerificationChallenge.objects.filter(
            patient=profile,
        ).first()
        if existing and existing.sent_at:
            elapsed = (now - existing.sent_at).total_seconds()
            cooldown = settings.EMERGENCY_CONTACT_VERIFICATION_COOLDOWN_SECONDS
            if elapsed < cooldown:
                raise EmergencyVerificationCooldown(
                    max(1, math.ceil(cooldown - elapsed))
                )
        if existing:
            existing.delete()

        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge = EmergencyContactVerificationChallenge.objects.create(
            patient=profile,
            phone=profile.emergency_contact_phone,
            code_hash=make_password(code),
            expires_at=now + timedelta(
                minutes=settings.EMERGENCY_CONTACT_VERIFICATION_TTL_MINUTES
            ),
            attempts_remaining=(
                settings.EMERGENCY_CONTACT_VERIFICATION_MAX_ATTEMPTS
            ),
        )

    patient_name = profile.user.get_full_name().strip() or "A PhysioVision user"
    try:
        send_emergency_sms(
            profile.emergency_contact_phone,
            (
                f"{patient_name} asked to list this number as their "
                "PhysioVision emergency contact. Verification code: "
                f"{code}. Sharing this code confirms that automated fall "
                "alerts may call or text this number. PhysioVision does not "
                "call emergency services."
            ),
        )
    except EmergencyNotificationError as exc:
        challenge.delete()
        raise EmergencyVerificationDeliveryError(str(exc)) from exc

    challenge.sent_at = timezone.now()
    challenge.save(update_fields=["sent_at", "updated_at"])
    return challenge


@transaction.atomic
def verify_emergency_contact_code(profile, code):
    now = timezone.now()
    challenge = (
        EmergencyContactVerificationChallenge.objects.select_for_update()
        .filter(patient=profile)
        .first()
    )
    if not challenge or challenge.consumed_at:
        return False, "invalid"
    if challenge.expires_at <= now:
        return False, "expired"
    if challenge.phone != profile.emergency_contact_phone:
        return False, "contact_changed"
    if challenge.attempts_remaining == 0:
        return False, "attempts_exhausted"
    if not check_password(code, challenge.code_hash):
        challenge.attempts_remaining -= 1
        challenge.save(update_fields=["attempts_remaining", "updated_at"])
        reason = (
            "attempts_exhausted"
            if challenge.attempts_remaining == 0
            else "invalid"
        )
        return False, reason

    challenge.consumed_at = now
    challenge.save(update_fields=["consumed_at", "updated_at"])
    profile.emergency_contact_verified_at = now
    profile.save(update_fields=["emergency_contact_verified_at", "updated_at"])
    return True, None


def emergency_alert_message(alert):
    patient_name = (
        alert.patient.user.get_full_name().strip()
        or "A PhysioVision user"
    )
    detected = alert.created_at.strftime("%Y-%m-%d at %H:%M UTC")
    return (
        f"PhysioVision detected a possible fall involving {patient_name} "
        f"on {detected} and could not confirm that they are okay. Please "
        "contact them now. If they may be unconscious or need urgent help "
        "in Singapore, call 995. This automated alert does not mean an "
        "ambulance has been dispatched."
    )


def deliver_emergency_notification(alert):
    message = emergency_alert_message(alert)
    results = {"sms_message_id": "", "voice_call_id": ""}
    errors = []
    try:
        results["sms_message_id"] = send_emergency_sms(
            alert.contact_phone,
            message,
        )
    except EmergencyNotificationError as exc:
        errors.append(f"SMS: {exc}")
    try:
        results["voice_call_id"] = place_emergency_voice_call(
            alert.contact_phone,
            message,
        )
    except EmergencyNotificationError as exc:
        errors.append(f"Voice call: {exc}")
    results["errors"] = errors
    if not results["sms_message_id"] and not results["voice_call_id"]:
        raise EmergencyNotificationError(" ".join(errors))
    return results


def dispatch_emergency_alert(alert_id):
    with transaction.atomic():
        alert = (
            EmergencyAlert.objects.select_for_update()
            .select_related("patient__user")
            .get(pk=alert_id)
        )
        if alert.status != EmergencyAlertStatus.PENDING:
            return alert
        if alert.response == EmergencyAlertResponse.OKAY:
            alert.status = EmergencyAlertStatus.CANCELLED
            alert.save(update_fields=["status", "updated_at"])
            return alert
        if alert.notify_after > timezone.now():
            return alert
        if not alert.contact_phone or not emergency_provider_ready():
            alert.status = EmergencyAlertStatus.NOT_CONFIGURED
            alert.delivery_error = (
                "No verified contact or notification provider is configured."
            )
            alert.save(update_fields=[
                "status",
                "delivery_error",
                "updated_at",
            ])
            return alert
        alert.status = EmergencyAlertStatus.NOTIFYING
        alert.notification_attempted_at = timezone.now()
        alert.save(update_fields=[
            "status",
            "notification_attempted_at",
            "updated_at",
        ])

    try:
        result = deliver_emergency_notification(alert)
    except EmergencyNotificationError as exc:
        logger.exception("Emergency contact notification failed")
        alert.status = EmergencyAlertStatus.FAILED
        alert.delivery_error = str(exc)[:2000]
    else:
        alert.sms_message_id = result["sms_message_id"]
        alert.voice_call_id = result["voice_call_id"]
        alert.delivery_error = " ".join(result["errors"])[:2000]
        alert.status = (
            EmergencyAlertStatus.PARTIAL
            if result["errors"]
            else EmergencyAlertStatus.NOTIFIED
        )
    alert.save(update_fields=[
        "status",
        "sms_message_id",
        "voice_call_id",
        "delivery_error",
        "updated_at",
    ])
    return alert


def process_due_emergency_alerts(limit=50):
    due_ids = list(
        EmergencyAlert.objects.filter(
            status=EmergencyAlertStatus.PENDING,
            notify_after__lte=timezone.now(),
        ).values_list("id", flat=True)[:limit]
    )
    processed = []
    for alert_id in due_ids:
        with transaction.atomic():
            alert = EmergencyAlert.objects.select_for_update().get(pk=alert_id)
            if alert.status != EmergencyAlertStatus.PENDING:
                continue
            if not alert.response:
                alert.response = EmergencyAlertResponse.NO_RESPONSE
                alert.responded_at = timezone.now()
                alert.save(update_fields=[
                    "response",
                    "responded_at",
                    "updated_at",
                ])
        processed.append(dispatch_emergency_alert(alert_id))
    return processed
