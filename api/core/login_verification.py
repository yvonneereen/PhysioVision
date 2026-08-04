import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac

from .email_delivery import EmailDeliveryError, deliver_email
from .models import LoginVerificationChallenge, User


class LoginVerificationCooldown(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after
        super().__init__("Please wait before requesting another sign-in code.")


class LoginVerificationDeliveryError(Exception):
    pass


LOGIN_CODE_HASH_PREFIX = "hmac_sha256$"


def _encode_login_code(challenge, code):
    """Key a short OTP with the server secret without a slow password hash."""
    digest = salted_hmac(
        key_salt=f"physiovision.login-code.{challenge.pk}",
        value=code,
        secret=settings.SECRET_KEY,
        algorithm="sha256",
    ).hexdigest()
    return f"{LOGIN_CODE_HASH_PREFIX}{digest}"


def _login_code_matches(challenge, code):
    encoded = challenge.code_hash or ""
    if encoded.startswith(LOGIN_CODE_HASH_PREFIX):
        expected = _encode_login_code(challenge, code)
        return constant_time_compare(encoded, expected)
    # Keep challenges created immediately before deployment usable.
    return check_password(code, encoded)


def _replace_code_and_deliver(challenge, user, now):
    """Store and email one new code for the supplied challenge."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = _encode_login_code(challenge, code)
    challenge.expires_at = now + timedelta(
        minutes=settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES
    )
    challenge.sent_at = None
    challenge.attempts_remaining = (
        settings.EMAIL_VERIFICATION_MAX_ATTEMPTS
    )
    challenge.consumed_at = None
    challenge.save(update_fields=[
        "code_hash",
        "expires_at",
        "sent_at",
        "attempts_remaining",
        "consumed_at",
        "updated_at",
    ])

    try:
        deliver_email(
            subject="Your PhysioVision sign-in code",
            message=(
                f"Your PhysioVision sign-in code is {code}.\n\n"
                f"It expires in {settings.EMAIL_VERIFICATION_CODE_TTL_MINUTES} "
                "minutes and can only be used once. If you did not try to "
                "sign in, change your PhysioVision password."
            ),
            recipient=user.email,
        )
    except EmailDeliveryError as exc:
        raise LoginVerificationDeliveryError from exc

    challenge.sent_at = timezone.now()
    challenge.save(update_fields=["sent_at", "updated_at"])
    return challenge


def issue_login_verification(
    user,
    *,
    challenge=None,
    enforce_cooldown=False,
    reuse_recent=False,
):
    """Create, replace or safely reuse a password-authenticated login code."""

    if challenge is not None:
        now = timezone.now()
        challenge = LoginVerificationChallenge.objects.filter(
            pk=challenge.pk,
            user=user,
            consumed_at__isnull=True,
        ).first()
        if not challenge or challenge.expires_at <= now:
            return None, False

        cooldown_seconds = (
            settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS
        )
        if enforce_cooldown and challenge.sent_at:
            elapsed = (now - challenge.sent_at).total_seconds()
            if elapsed < cooldown_seconds:
                raise LoginVerificationCooldown(
                    max(1, math.ceil(cooldown_seconds - elapsed))
                )
        return _replace_code_and_deliver(challenge, user, now), True

    # Hold a per-user database lock until delivery is recorded. If two valid
    # login requests arrive together, the second waits, sees the newly sent
    # challenge and reuses it instead of emailing a different code.
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)
        now = timezone.now()
        existing = LoginVerificationChallenge.objects.filter(
            user=locked_user,
        ).first()
        cooldown_seconds = (
            settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS
        )
        if (
            reuse_recent
            and existing
            and existing.consumed_at is None
            and existing.expires_at > now
            and existing.sent_at
        ):
            elapsed = (now - existing.sent_at).total_seconds()
            if elapsed < cooldown_seconds:
                return existing, False

        if existing:
            existing.delete()
        challenge = LoginVerificationChallenge.objects.create(
            user=locked_user,
            code_hash="",
            expires_at=now,
        )
        challenge = _replace_code_and_deliver(
            challenge,
            locked_user,
            now,
        )
        return challenge, True


@transaction.atomic
def verify_login_code(challenge_id, code):
    now = timezone.now()
    challenge = (
        LoginVerificationChallenge.objects.select_for_update()
        .select_related("user")
        .filter(pk=challenge_id)
        .first()
    )

    if not challenge or challenge.consumed_at:
        return None, "invalid"
    if challenge.expires_at <= now:
        return None, "expired"
    if challenge.attempts_remaining == 0:
        return None, "attempts_exhausted"
    if not _login_code_matches(challenge, code):
        challenge.attempts_remaining -= 1
        challenge.save(update_fields=[
            "attempts_remaining",
            "updated_at",
        ])
        reason = (
            "attempts_exhausted"
            if challenge.attempts_remaining == 0
            else "invalid"
        )
        return None, reason

    user = challenge.user
    if not user.is_active or not user.email_verified_at:
        return None, "invalid"

    challenge.consumed_at = now
    challenge.save(update_fields=["consumed_at", "updated_at"])
    return user, None
