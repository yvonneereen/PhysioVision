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
- Searchable library of 23 additional exercises with tracking and safety labels
- Primary-motion camera prototypes for ankle pumps, heel slides, and hip bridges
- Synchronized Pose + Hand prototypes for wrist extension/flexion and an ordered tendon-glide hand-shape sequence
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

Most of the additional exercise library remains educational draft content.
Ankle pumps, heel slides, and hip bridges have restricted primary-motion
tracking. Wrist extension/flexion and tendon glides have engineering sequence
prototypes using the hand tracker. Their warnings list important factors the
camera cannot assess, and none of these additions should be described as
clinically validated. All other additions remain outside the live
movement-scoring registry.
Draft landmark, phase and measurement plans are documented in
[`TRACKING_RULES.md`](TRACKING_RULES.md).

## Safety

This hackathon prototype is not a medical device. It is intended to demonstrate
low-risk exercise guidance and does not diagnose conditions or replace a
qualified health professional.
