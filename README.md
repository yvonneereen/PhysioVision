# PhysioVision

PhysioVision is an AI-guided home rehabilitation prototype for the Tencent Age
Well Hackathon. It helps older adults complete low-risk physiotherapy exercises
with real-time camera-based movement feedback while keeping physiotherapists
connected to progress trends.

## Prototype flows

- Editorial landing page and product story
- Three-step AI plan intake based on goals and profile information
- On-device personal profile for goals, focus side, mobility, and coaching style
- Guided per-exercise calibration using a starting position and one comfortable movement capture
- MediaPipe-powered pose tracking with live form cues and repetition counting
- Searchable library of 23 supplied exercises, all connected to selectable recognition prototypes
- Pose phase tracking for lower-limb, balance, gait, spine and shoulder exercises
- Synchronized Pose + Hand tracking for wrist/forearm exercises and ordered hand-shape sequences
- Patient progress and clinical escalation preview
- Online physiotherapist booking prototype
- Physiotherapist monitoring dashboard

## Run locally

Camera access requires a local web server rather than opening `index.html`
directly:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The pose model and web fonts load from external CDNs, so an internet connection
is required for the full exercise-guidance experience.

## Deploy online accounts

The production architecture uses Cloudflare Pages for the static frontend, a
Render web service for Django, and a persistent PostgreSQL database. The
repository includes `render.yaml`, `build.sh`, a database-aware health check at
`/api/health/`, and build-time frontend API configuration.

After creating the backend, set this non-secret Cloudflare Pages build variable:

```text
PHYSIOVISION_API_BASE=https://your-api.onrender.com/api
```

The Render Blueprint sends account-verification, two-step sign-in, and
password-reset messages through the Gmail API. Registration verifies ownership
of the address once; every later password login sends a fresh six-digit,
single-use code and does not create an API session until that code is verified.
Set these private Render environment variables:

```text
EMAIL_PROVIDER=gmail_api
GMAIL_CLIENT_ID=your OAuth client ID
GMAIL_CLIENT_SECRET=your OAuth client secret
GMAIL_REFRESH_TOKEN=your long-lived OAuth refresh token
GMAIL_SENDER_EMAIL=the Gmail account authorized by that refresh token
GMAIL_SENDER_NAME=PhysioVision
```

The sender name is the label recipients see next to the sender address. It
should normally match the public website name, `PhysioVision`; it does not have
to match the Google Cloud OAuth app name. Do not store the client secret,
refresh token, or downloaded Google credential files in Git. The old SMTP
variables are not used when `EMAIL_PROVIDER=gmail_api`, so they can be removed
from Render after the Gmail API variables are working.

Use the exact Cloudflare production origin, without a trailing slash, for the
frontend URL variables. Never put database, email, Django, Gmail, or Gemini
secrets in frontend code.

Account data is stored per authenticated user in the Django database. The
frontend keeps only a short-lived, per-tab cache and clears it at sign-out or
when the session expires. Every exercise has a calibration contract. Numeric movement
endpoints can be narrowed around the user's comfortable samples without
loosening the exercise's outer limits; form, visibility, categorical hand
shapes and safety gates remain fixed. Hand-shape-only exercises record a
personal tracking baseline rather than changing their anatomical definitions.

All 23 supplied exercises now have executable engineering prototypes. The
quality varies by what one RGB camera can observe: some track a complete phase
sequence, while ball, band, balance, gait, step, support and mobility-aid
exercises provide explicitly labelled partial-motion or proxy recognition.
Their warnings list factors the camera cannot assess, and none of these
additions should be described as clinically validated.
Draft landmark, phase and measurement plans are documented in
[`TRACKING_RULES.md`](TRACKING_RULES.md).

## Safety

This hackathon prototype is not a medical device. It is intended to demonstrate
low-risk exercise guidance and does not diagnose conditions or replace a
qualified health professional.
