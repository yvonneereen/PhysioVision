import base64
from email.message import EmailMessage
from email.utils import formataddr
from threading import Lock

from django.conf import settings
from django.core.mail import send_mail


GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'


class EmailDeliveryError(Exception):
    """Raised when the selected email provider cannot deliver a message."""


_gmail_service = None
_gmail_service_signature = None
_gmail_service_lock = Lock()


def _configured_gmail_service():
    """Reuse Gmail discovery and OAuth state within each web worker."""
    global _gmail_service, _gmail_service_signature

    signature = (
        settings.GMAIL_CLIENT_ID,
        settings.GMAIL_CLIENT_SECRET,
        settings.GMAIL_REFRESH_TOKEN,
        settings.GMAIL_SENDER_EMAIL,
    )
    if _gmail_service is not None and signature == _gmail_service_signature:
        return _gmail_service

    # Lazy imports let local console/locmem email work without initializing
    # Google's client library.
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    credentials = Credentials(
        token=None,
        refresh_token=settings.GMAIL_REFRESH_TOKEN,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=settings.GMAIL_CLIENT_ID,
        client_secret=settings.GMAIL_CLIENT_SECRET,
        scopes=[GMAIL_SEND_SCOPE],
    )
    _gmail_service = build(
        'gmail',
        'v1',
        credentials=credentials,
        cache_discovery=False,
    )
    _gmail_service_signature = signature
    return _gmail_service


def _send_with_gmail_api(*, subject, message, recipient):
    required = {
        'GMAIL_CLIENT_ID': settings.GMAIL_CLIENT_ID,
        'GMAIL_CLIENT_SECRET': settings.GMAIL_CLIENT_SECRET,
        'GMAIL_REFRESH_TOKEN': settings.GMAIL_REFRESH_TOKEN,
        'GMAIL_SENDER_EMAIL': settings.GMAIL_SENDER_EMAIL,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise EmailDeliveryError(
            f"Missing Gmail API settings: {', '.join(missing)}"
        )

    email = EmailMessage()
    email['To'] = recipient
    email['From'] = formataddr((
        settings.GMAIL_SENDER_NAME,
        settings.GMAIL_SENDER_EMAIL,
    ))
    email['Subject'] = subject
    email.set_content(message)
    raw_message = base64.urlsafe_b64encode(email.as_bytes()).decode('ascii')

    # googleapiclient's underlying HTTP object is not thread-safe. Serializing
    # these short sends lets us safely reuse its access token and connection.
    with _gmail_service_lock:
        service = _configured_gmail_service()
        result = (
            service.users()
            .messages()
            .send(userId='me', body={'raw': raw_message})
            .execute()
        )
    if not result.get('id'):
        raise EmailDeliveryError('Gmail API did not return a message ID.')


def deliver_email(*, subject, message, recipient):
    """Deliver one transactional email using the configured provider."""
    try:
        if settings.EMAIL_PROVIDER == 'gmail_api':
            _send_with_gmail_api(
                subject=subject,
                message=message,
                recipient=recipient,
            )
            return

        if settings.EMAIL_PROVIDER != 'django':
            raise EmailDeliveryError(
                f"Unsupported EMAIL_PROVIDER: {settings.EMAIL_PROVIDER}"
            )

        delivered = send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
        if delivered != 1:
            raise EmailDeliveryError('Django email backend did not send.')
    except EmailDeliveryError:
        raise
    except Exception as exc:
        raise EmailDeliveryError from exc
