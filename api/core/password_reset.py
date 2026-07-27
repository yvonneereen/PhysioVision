import hashlib
import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .email_delivery import deliver_email
from .models import PasswordResetChallenge, User


class PasswordResetCooldown(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after
        super().__init__("Please wait before requesting another reset code.")


def _token_digest(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def issue_password_reset(user, *, enforce_cooldown=True):
    now = timezone.now()
    existing = PasswordResetChallenge.objects.filter(user=user).first()
    cooldown_seconds = settings.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS

    if enforce_cooldown and existing and existing.sent_at:
        elapsed = (now - existing.sent_at).total_seconds()
        if elapsed < cooldown_seconds:
            raise PasswordResetCooldown(
                max(1, math.ceil(cooldown_seconds - elapsed))
            )

    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge, _ = PasswordResetChallenge.objects.update_or_create(
        user=user,
        defaults={
            'code_hash': make_password(code),
            'expires_at': now + timedelta(
                minutes=settings.PASSWORD_RESET_CODE_TTL_MINUTES
            ),
            'sent_at': None,
            'attempts_remaining': settings.PASSWORD_RESET_MAX_ATTEMPTS,
            'verified_at': None,
            'reset_token_hash': '',
            'reset_token_expires_at': None,
            'consumed_at': None,
        },
    )

    deliver_email(
        subject='Reset your PhysioVision password',
        message=(
            f"Your PhysioVision password reset code is {code}.\n\n"
            f"It expires in {settings.PASSWORD_RESET_CODE_TTL_MINUTES} "
            "minutes. If you did not request this, you can ignore this email."
        ),
        recipient=user.email,
    )
    challenge.sent_at = timezone.now()
    challenge.save(update_fields=['sent_at', 'updated_at'])


@transaction.atomic
def verify_password_reset_code(user, code):
    now = timezone.now()
    challenge = (
        PasswordResetChallenge.objects.select_for_update()
        .filter(user=user)
        .first()
    )

    if not challenge or challenge.consumed_at:
        return None, 'invalid'
    if challenge.expires_at <= now:
        return None, 'expired'
    if challenge.attempts_remaining == 0:
        return None, 'attempts_exhausted'
    if not check_password(code, challenge.code_hash):
        challenge.attempts_remaining -= 1
        challenge.save(update_fields=['attempts_remaining', 'updated_at'])
        reason = (
            'attempts_exhausted'
            if challenge.attempts_remaining == 0
            else 'invalid'
        )
        return None, reason

    reset_token = secrets.token_urlsafe(32)
    challenge.verified_at = now
    challenge.reset_token_hash = _token_digest(reset_token)
    challenge.reset_token_expires_at = now + timedelta(
        minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES
    )
    challenge.save(update_fields=[
        'verified_at',
        'reset_token_hash',
        'reset_token_expires_at',
        'updated_at',
    ])
    return reset_token, None


@transaction.atomic
def reset_password(user, reset_token, new_password):
    now = timezone.now()
    challenge = (
        PasswordResetChallenge.objects.select_for_update()
        .filter(user=user)
        .first()
    )

    supplied_digest = _token_digest(reset_token)
    valid = (
        challenge
        and not challenge.consumed_at
        and challenge.verified_at
        and challenge.reset_token_expires_at
        and challenge.reset_token_expires_at > now
        and challenge.reset_token_hash
        and secrets.compare_digest(
            challenge.reset_token_hash,
            supplied_digest,
        )
    )
    if not valid:
        return False, 'invalid'

    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        return False, exc.messages

    user.set_password(new_password)
    user.save(update_fields=['password', 'updated_at'])
    Token.objects.filter(user=user).delete()

    challenge.consumed_at = now
    challenge.reset_token_hash = ''
    challenge.reset_token_expires_at = None
    challenge.save(update_fields=[
        'consumed_at',
        'reset_token_hash',
        'reset_token_expires_at',
        'updated_at',
    ])
    return True, None
