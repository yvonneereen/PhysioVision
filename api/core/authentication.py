from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import TokenAuthentication


class ExpiringTokenAuthentication(TokenAuthentication):
    """Reject unverified users and automatically expire old API tokens."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)

        if not user.email_verified_at:
            token.delete()
            raise exceptions.AuthenticationFailed("Email verification required.")

        if token.created <= timezone.now() - timedelta(
            hours=settings.AUTH_TOKEN_TTL_HOURS
        ):
            token.delete()
            raise exceptions.AuthenticationFailed("Session expired. Sign in again.")

        return user, token
