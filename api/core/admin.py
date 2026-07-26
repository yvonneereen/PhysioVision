from django.contrib import admin

from .models import EmailVerification


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
