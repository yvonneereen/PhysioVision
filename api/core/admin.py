from django.contrib import admin

from .models import (
    EmailVerification,
    LoginVerificationChallenge,
    PasswordResetChallenge,
)


@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'consumed_at',
    )
    readonly_fields = (
        'user',
        'code_hash',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'consumed_at',
        'created_at',
        'updated_at',
    )


@admin.register(LoginVerificationChallenge)
class LoginVerificationChallengeAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'consumed_at',
    )
    readonly_fields = (
        'user',
        'code_hash',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'consumed_at',
        'created_at',
        'updated_at',
    )


@admin.register(PasswordResetChallenge)
class PasswordResetChallengeAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'verified_at',
        'consumed_at',
    )
    readonly_fields = (
        'user',
        'code_hash',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'verified_at',
        'reset_token_hash',
        'reset_token_expires_at',
        'consumed_at',
        'created_at',
        'updated_at',
    )
