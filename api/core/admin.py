from django.contrib import admin

from .models import (
    EmailVerification,
    EmergencyAlert,
    EmergencyContactVerificationChallenge,
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


@admin.register(EmergencyContactVerificationChallenge)
class EmergencyContactVerificationChallengeAdmin(admin.ModelAdmin):
    list_display = (
        'patient',
        'phone',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'consumed_at',
    )
    readonly_fields = (
        'patient',
        'phone',
        'code_hash',
        'sent_at',
        'expires_at',
        'attempts_remaining',
        'consumed_at',
        'created_at',
        'updated_at',
    )


@admin.register(EmergencyAlert)
class EmergencyAlertAdmin(admin.ModelAdmin):
    list_display = (
        'patient',
        'status',
        'response',
        'notify_after',
        'notification_attempted_at',
    )
    list_filter = ('status', 'response', 'source')
    search_fields = (
        'patient__user__email',
        'contact_name',
        'contact_phone',
    )
    readonly_fields = (
        'client_event_id',
        'patient',
        'source',
        'status',
        'response',
        'exercise_id',
        'monitoring_mode',
        'signals',
        'notify_after',
        'responded_at',
        'notification_attempted_at',
        'contact_name',
        'contact_phone',
        'sms_message_id',
        'voice_call_id',
        'delivery_error',
        'created_at',
        'updated_at',
    )
