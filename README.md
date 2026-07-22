# PhysioVision

PhysioVision is an AI-guided home rehabilitation prototype for the Tencent Age
Well Hackathon. It helps older adults complete low-risk physiotherapy exercises
with real-time camera-based movement feedback while keeping physiotherapists
connected to progress trends.

## Prototype flows

- Editorial landing page and product story
- Three-step AI plan intake based on goals and profile information
- On-device personal profile for goals, focus side, mobility, and coaching style
- Guided half-squat calibration using natural standing and three comfortable depths
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

Profile and calibration data are stored in browser `localStorage` for this
prototype. Half-squat calibration personalizes comfortable knee and hip ranges;
it does not loosen torso, knee-position, or maximum-depth safety limits.

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
