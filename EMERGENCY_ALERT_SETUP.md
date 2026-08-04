# Emergency-contact fall alerts

PhysioVision can request an SMS and a voice call to a patient's verified
emergency contact after a possible fall. It never calls 995 or dispatches an
ambulance.

## What the code now does

1. The browser detects a possible fall and immediately creates a durable alert
   on the Django API.
2. A 30-second countdown asks the patient to choose **I'm okay** or **I need
   help**. Hands-free voice remains available where the browser supports it.
3. **I'm okay** cancels a pending server alert.
4. **I need help** requests contact notification immediately.
5. No response lets the backend worker request contact notification when the
   countdown expires, even if the browser-side timer stops after the alert was
   registered.
6. The provider is asked to send both an SMS and a voice call. The UI reports
   full, partial, failed, or not-configured status without claiming that the
   contact answered.
7. A separate **Call 995 now** link opens the device dialler. The user or a
   nearby person must confirm and place that emergency call.

## Required production setup

### 1. Apply the database migrations

In the configured backend environment:

```bash
python3 manage.py migrate
```

This creates the contact-verification and durable emergency-alert records.

### 2. Configure a Singapore-capable Twilio number

Create a Twilio account and obtain a number that supports both outbound voice
and SMS to the contact numbers you intend to support. Confirm Twilio's current
Singapore regulatory and caller-ID requirements before enabling production
traffic.

Do **not** configure 995, 999, 112, or 911 as the saved contact. The code blocks
those short emergency-service numbers, and Twilio's current Singapore guidance
does not allow emergency-service calls.

Add these secrets to the Django API service, not the frontend or Cloudflare
Pages:

```text
EMERGENCY_ALERT_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+65...
EMERGENCY_ALERT_DELAY_SECONDS=30
EMERGENCY_CONTACT_VERIFICATION_TTL_MINUTES=10
EMERGENCY_CONTACT_VERIFICATION_COOLDOWN_SECONDS=60
EMERGENCY_CONTACT_VERIFICATION_MAX_ATTEMPTS=5
```

Never expose the Twilio auth token in `runtime-config.js`, browser JavaScript,
GitHub, or a Pages environment variable that is bundled into frontend assets.

### 3. Run the durable alert worker

Create a continuously running background-worker service using the same code,
database, and environment variables as the Django API. Its start command is:

```bash
python3 manage.py process_emergency_alerts --watch --interval 2
```

For Render, create **New → Background Worker**, connect the same repository and
branch as the API, use `pip install -r requirements.txt` as the build command,
and use the command above as the start command. Copy the API service's
`DATABASE_URL`, `SECRET_KEY`, Twilio settings, and other required environment
variables into the worker. The worker and API must point at the same database.

The frontend also submits the response at the end of its countdown, but the
worker is required for the unconscious-user case because browser timers can
stop when a tab, browser, device, or network session stops.

Do not run multiple development auto-reload workers. In production, use one
managed worker initially and monitor its health before scaling it.

### 4. Verify a contact before enabling alerts

1. Sign in as the patient.
2. Open **My profile**.
3. Enter the contact's name, relationship, and complete international phone
   number.
4. Confirm that the person agreed to receive automated fall alerts.
5. Select **Send verification code**.
6. Ask the contact to share the received six-digit code.
7. Enter it and confirm that the profile says **Verified and ready for
   automatic alerts**.

Changing or removing the phone number invalidates verification.

### 5. Test without calling emergency services

Use phone numbers belonging to the development team and contact owners who
have agreed to the test. Never use 995 for a test.

Test all of these cases:

- **I'm okay** before expiry: no SMS or call is requested.
- **I need help**: SMS and voice call are requested immediately.
- No response: the worker requests both after the countdown.
- Invalid or missing provider credentials: the UI says no automatic alert was
  sent and continues showing the manual 995 action.
- SMS succeeds and voice fails, and vice versa: the UI reports partial delivery.
- Safari loses camera, microphone, network, or page visibility: the product
  continues to describe the feature as an additional safeguard, not guaranteed
  monitoring.

## Important limitations before real patient use

- A provider request ID means Twilio accepted the request. It does not prove
  that the SMS was delivered, that the phone rang, or that the contact answered.
  Add signed Twilio status-callback webhooks before claiming delivery.
- The alert currently contains no live location. If location is added, obtain
  explicit consent, record timestamp and accuracy, and clearly identify stale
  or unavailable positions. SCDF needs an accurate location from the person who
  calls 995.
- Emergency-contact details are sensitive personal data. Before production,
  complete a privacy/legal review, establish retention and deletion rules,
  restrict staff access, and use appropriate database encryption and audit
  logging.
- Add provider failover, worker-health monitoring, alert-age monitoring, and an
  operator escalation path before presenting the feature as dependable
  unattended monitoring.
- A normal website cannot guarantee fall detection when the tab is closed, the
  device is locked or unpowered, the internet is unavailable, camera permission
  ends, or the person falls outside the frame. A regulated telecare service or
  native phone/watch integration is required for stronger unattended coverage.
