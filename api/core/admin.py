from django.contrib import admin

from .models import (
    CareDischarge,
    ClinicianAiMessage,
    ClinicianAiSession,
    EmailVerification,
    EmergencyAlert,
    EmergencyContactVerificationChallenge,
    LoginVerificationChallenge,
    PasswordResetChallenge,
)


class ClinicianAiMessageInline(admin.TabularInline):
    model = ClinicianAiMessage
    extra = 0
    can_delete = False
    readonly_fields = (
        'role', 'body', 'command', 'data', 'created_at', 'updated_at',
    )


@admin.register(ClinicianAiSession)
class ClinicianAiSessionAdmin(admin.ModelAdmin):
    list_display = ('title', 'clinician', 'created_at', 'updated_at')
    search_fields = (
        'title',
        'clinician__user__email',
        'clinician__user__first_name',
        'clinician__user__last_name',
    )
    readonly_fields = ('clinician', 'title', 'created_at', 'updated_at')
    inlines = [ClinicianAiMessageInline]


@admin.register(CareDischarge)
class CareDischargeAdmin(admin.ModelAdmin):
    list_display = (
        'patient',
        'clinician',
        'created_at',
        'prescriptions_ended',
        'consultations_cancelled',
    )
    search_fields = (
        'patient__user__email',
        'patient__user__first_name',
        'patient__user__last_name',
        'clinician__user__email',
    )
    readonly_fields = (
        'patient',
        'clinician',
        'note',
        'prescriptions_ended',
        'consultations_cancelled',
        'created_at',
        'updated_at',
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
