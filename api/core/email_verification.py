import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .email_delivery import EmailDeliveryError, deliver_email
from .models import EmailVerification, User


class VerificationCooldown(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after
        super().__init__("Please wait before requesting another code.")


class VerificationDeliveryError(Exception):
    pass


def issue_email_verification(user, *, enforce_cooldown=False):
    now = timezone.now()
    existing = EmailVerification.objects.filter(user=user).first()
    cooldown_seconds = settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS

    if enforce_cooldown and existing and existing.sent_at:
        elapsed = (now - existing.sent_at).total_seconds()
        if elapsed < cooldown_seconds:
            raise VerificationCooldown(
                max(1, math.ceil(cooldown_seconds - elapsed))
            )

    code = f"{secrets.randbelow(1_000_000):06d}"
    verification, _ = EmailVerification.objects.update_or_create(
        user=user,
        defaults={
            "code_hash": make_password(code),
            "expires_at": now + timedelta(
                minutes=settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES
            ),
            "sent_at": None,
            "attempts_remaining": settings.EMAIL_VERIFICATION_MAX_ATTEMPTS,
            "consumed_at": None,
        },
    )

    try:
        deliver_email(
            subject="Your PhysioVision verification code",
            message=(
                f"Your PhysioVision verification code is {code}.\n\n"
                f"It expires in {settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES} "
                "minutes. If you did not create this account, you can ignore "
                "this email."
            ),
            recipient=user.email,
        )
    except EmailDeliveryError as exc:
        raise VerificationDeliveryError from exc

    verification.sent_at = timezone.now()
    verification.save(update_fields=["sent_at", "updated_at"])


@transaction.atomic
def verify_email_code(user: User, code: str):
    now = timezone.now()
    verification = (
        EmailVerification.objects.select_for_update()
        .filter(user=user)
        .first()
    )

    if not verification or verification.consumed_at:
        return False, "invalid"
    if verification.expires_at <= now:
        return False, "expired"
    if verification.attempts_remaining == 0:
        return False, "attempts_exhausted"
    if not check_password(code, verification.code_hash):
        verification.attempts_remaining -= 1
        verification.save(update_fields=["attempts_remaining", "updated_at"])
        reason = (
            "attempts_exhausted"
            if verification.attempts_remaining == 0
            else "invalid"
        )
        return False, reason

    verification.consumed_at = now
    verification.save(update_fields=["consumed_at", "updated_at"])
    user.email_verified_at = now
    user.is_active = True
    user.save(update_fields=["email_verified_at", "is_active", "updated_at"])
    return True, None
