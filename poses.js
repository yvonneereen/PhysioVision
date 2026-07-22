/**
 * SVG stick-figure illustrations for each exercise position.
 * Portrait poses (standing/seated): viewBox 0 0 120 150
 * Landscape poses (lying):          viewBox 0 0 160 110
 *
 * Person always faces RIGHT in side-profile view.
 * Foreground limb = full colour (#4ade80), background limb = dimmed.
 */

const FG  = '#4ade80';
const DIM = '#4ade8050';
const BG  = '#0f1420';

const line = (x1, y1, x2, y2, dim = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${dim ? DIM : FG}" stroke-width="${dim ? 2 : 2.5}" stroke-linecap="round"/>`;

const path = (pts, dim = false) => {
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${dim ? DIM : FG}" stroke-width="${dim ? 2 : 2.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const head = (cx, cy, r = 11) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${FG}22" stroke="${FG}" stroke-width="2.5"/>`;

const ghost = (color = DIM) =>
  `stroke="${color}" stroke-width="2" stroke-linecap="round"`;

function portrait(body) {
  return `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="150" fill="${BG}" rx="8"/>${body}</svg>`;
}

function landscape(body) {
  return `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="110" fill="${BG}" rx="8"/>${body}</svg>`;
}

// ── Portrait poses ────────────────────────────────────────────────────────────

const standing = portrait(
  head(55, 18) +
  line(55, 29, 55, 88) +                         // torso
  line(55, 50, 75, 74) +                         // near arm
  line(55, 50, 36, 72, true) +                   // far arm
  path([[55,88],[55,128],[55,148],[78,150]]) +    // near leg + foot
  line(55, 148, 40, 150) +                       // near heel
  path([[55,88],[58,128],[58,148],[81,150]], true) // far leg
);

const squat = portrait(
  head(60, 30) +
  line(60, 41, 54, 86) +                         // torso (forward lean)
  line(57, 60, 78, 76) +                         // near arm (forward for balance)
  line(57, 60, 36, 74, true) +                   // far arm
  path([[54,86],[78,110],[52,140]]) +             // near leg (thigh fwd, shin back)
  line(52, 140, 74, 143) +                       // near toe
  line(52, 140, 38, 143) +                       // near heel
  path([[54,86],[81,114],[55,144]], true) +       // far leg
  line(55, 144, 77, 147, true)                   // far toe
);

const calfRaised = portrait(
  head(55, 18) +
  line(55, 29, 55, 88) +
  line(55, 50, 75, 74) +
  line(55, 50, 36, 72, true) +
  line(55, 88, 55, 128) +                        // near thigh
  line(55, 128, 55, 140) +                       // near shin
  line(55, 140, 74, 150) +                       // toe (plantarflexed, points fwd-down)
  path([[55,88],[58,128],[58,140],[77,150]], true) // far leg
);

const kneeCurled = portrait(
  head(55, 18) +
  line(55, 29, 55, 88) +
  line(55, 50, 75, 72) +                         // arm out for balance
  line(55, 50, 36, 72, true) +
  // Support leg (far, dim — stays straight on ground)
  path([[55,88],[58,128],[58,148],[80,150]], true) +
  // Curling leg (near, foreground)
  line(55, 88, 55, 126) +                        // thigh straight down
  line(55, 126, 28, 104) +                       // shin curls BACKWARD
  line(28, 104, 22, 95)                          // foot at top of curl
);

const calfStretch = portrait(
  // Wall on right
  `<line x1="105" y1="25" x2="105" y2="148" stroke="${DIM}" stroke-width="2"/>` +
  head(60, 22) +
  line(60, 33, 56, 84) +                         // torso (slight lean)
  line(57, 52, 92, 44) +                         // near arm pushing wall
  line(57, 52, 38, 68, true) +                   // far arm
  // Front leg (bent)
  line(56, 84, 68, 112) +
  line(68, 112, 64, 140) +
  line(64, 140, 88, 143) +
  // Back leg (straight, heel flat — the stretch)
  line(56, 84, 50, 128, true) +
  line(50, 128, 50, 148, true) +
  line(50, 148, 26, 150, true)
);

const quadStretch = portrait(
  head(58, 18) +
  line(58, 29, 58, 88) +
  line(58, 50, 80, 70) +                         // support arm (right, for balance)
  // Support leg (straight)
  line(58, 88, 58, 128) +
  line(58, 128, 58, 148) +
  line(58, 148, 80, 150) +
  line(58, 148, 44, 150) +
  // Curled leg (behind — knee bent, heel to buttock)
  line(58, 88, 55, 124, true) +                  // far thigh (dim)
  line(55, 124, 34, 104, true) +                 // far shin curled back
  // Arm grabbing ankle
  line(58, 50, 38, 80) +                         // arm reaches behind
  line(38, 80, 32, 100)                          // to foot
);

const seated = portrait(
  // Chair
  `<line x1="20" y1="95" x2="100" y2="95" stroke="${DIM}" stroke-width="2"/>` +
  `<line x1="20" y1="95" x2="20" y2="145" stroke="${DIM}" stroke-width="2"/>` +
  `<line x1="100" y1="95" x2="100" y2="145" stroke="${DIM}" stroke-width="2"/>` +
  head(60, 20) +
  line(60, 31, 60, 92) +
  line(60, 50, 80, 72) +
  line(60, 50, 40, 72, true) +
  line(60, 92, 86, 95) +                         // near thigh (on chair)
  line(86, 95, 86, 140) +                        // near shin (down)
  line(86, 140, 98, 143) +                       // near foot
  line(60, 92, 37, 95, true) +                   // far thigh
  line(37, 95, 37, 140, true) +
  line(37, 140, 25, 143, true)
);

const seatedLegExtended = portrait(
  `<line x1="20" y1="95" x2="100" y2="95" stroke="${DIM}" stroke-width="2"/>` +
  `<line x1="20" y1="95" x2="20" y2="145" stroke="${DIM}" stroke-width="2"/>` +
  `<line x1="100" y1="95" x2="100" y2="145" stroke="${DIM}" stroke-width="2"/>` +
  head(60, 20) +
  line(60, 31, 60, 92) +
  line(60, 50, 80, 72) +
  line(60, 50, 40, 72, true) +
  // Near leg (extended forward)
  line(60, 92, 86, 95) +                         // thigh on chair
  line(86, 95, 114, 90) +                        // shin extended out
  line(114, 90, 120, 82) +                       // foot
  // Far leg (down, dim)
  line(60, 92, 37, 95, true) +
  line(37, 95, 37, 140, true) +
  line(37, 140, 25, 143, true)
);

// ── Landscape poses ───────────────────────────────────────────────────────────

const lyingFlat = landscape(
  head(18, 55) +
  line(29, 55, 90, 55) +                         // torso
  line(52, 55, 50, 38) +                         // near arm (above body)
  line(52, 55, 50, 72, true) +                   // far arm (below, dim)
  path([[90,55],[120,52],[148,51]]) +             // near leg
  line(148, 51, 155, 44) +                       // near foot
  path([[90,55],[120,58],[148,59]], true) +       // far leg
  line(148, 59, 155, 66, true)                   // far foot
);

const lyingLegRaised = landscape(
  head(18, 62) +
  line(29, 62, 90, 62) +
  line(52, 62, 50, 45) +
  line(52, 62, 50, 79, true) +
  // Support leg (stays down)
  path([[90,62],[120,66],[148,68]], true) +
  line(148, 68, 155, 75, true) +
  // Raised leg (angled up ~30°)
  line(90, 62, 126, 42) +
  line(126, 42, 152, 36) +
  line(152, 36, 157, 28)
);

const proneFace = landscape(
  // Face-down — same silhouette as lying-flat but feet point downward
  head(18, 55) +
  line(29, 55, 90, 55) +
  line(52, 55, 50, 40) +
  line(52, 55, 50, 70, true) +
  path([[90,55],[120,52],[148,51]]) +
  line(148, 51, 153, 60) +                       // foot hangs down (prone)
  path([[90,55],[120,58],[148,59]], true) +
  line(148, 59, 153, 68, true)
);

const proneLegRaised = landscape(
  head(18, 64) +
  line(29, 64, 90, 64) +
  line(52, 64, 50, 48) +
  line(52, 64, 50, 80, true) +
  // Support leg (near, down)
  path([[90,64],[120,66],[148,68]]) +
  line(148, 68, 153, 76) +
  // Raised leg (hip extension — goes UP)
  line(90, 64, 122, 46) +
  line(122, 46, 150, 42) +
  line(150, 42, 155, 34)
);

const sideLying = landscape(
  // Legs stacked (rest position)
  head(18, 55) +
  line(29, 55, 90, 55) +
  line(52, 55, 50, 40) +
  line(52, 55, 50, 70, true) +
  path([[90,55],[120,55],[148,56]]) +             // near leg (top)
  line(148, 56, 154, 50) +
  path([[90,55],[120,58],[148,59]], true) +       // far leg (bottom, slightly below)
  line(148, 59, 154, 54, true)
);

const sideLyingAbducted = landscape(
  head(18, 60) +
  line(29, 60, 90, 60) +
  line(52, 60, 50, 45) +
  line(52, 60, 50, 75, true) +
  // Bottom leg (support, stays down)
  path([[90,60],[120,64],[148,66]]) +
  line(148, 66, 154, 62) +
  // Top leg (RAISED = abducted)
  line(90, 60, 126, 36) +
  line(126, 36, 152, 28) +
  line(152, 28, 157, 20)
);

const lyingKneesBent = landscape(
  head(18, 62) +
  line(29, 62, 86, 62) +
  line(52, 62, 50, 46) +
  line(52, 62, 50, 78, true) +
  // Near leg: thigh angles toward ceiling, shin comes back down (knee bent ~90°)
  line(86, 62, 112, 40) +                        // near thigh up
  line(112, 40, 132, 62) +                       // near shin back down
  line(132, 62, 140, 70) +                       // near foot
  // Far leg (dim)
  line(86, 62, 114, 44, true) +
  line(114, 44, 134, 66, true) +
  line(134, 66, 142, 74, true)
);

const lyingLegsExtended = landscape(
  head(18, 62) +
  line(29, 62, 86, 62) +
  line(52, 62, 50, 46) +
  line(52, 62, 50, 78, true) +
  path([[86,62],[118,58],[148,56]]) +             // near leg extended
  line(148, 56, 154, 48) +
  path([[86,62],[118,66],[148,68]], true) +       // far leg (dim)
  line(148, 68, 154, 76, true)
);

const ankleToesUp = landscape(
  `<line x1="15" y1="78" x2="150" y2="78" stroke="${DIM}" stroke-width="2"/>` +
  `<circle cx="28" cy="58" r="5" fill="${FG}22" stroke="${FG}" stroke-width="2"/>` +
  line(28, 58, 112, 58) +                       // supported lower leg
  line(112, 58, 104, 33) +                      // toes move toward shin
  `<circle cx="112" cy="58" r="3" fill="${FG}"/>`
);

const ankleToesDown = landscape(
  `<line x1="15" y1="78" x2="150" y2="78" stroke="${DIM}" stroke-width="2"/>` +
  `<circle cx="28" cy="58" r="5" fill="${FG}22" stroke="${FG}" stroke-width="2"/>` +
  line(28, 58, 112, 58) +                       // supported lower leg
  line(112, 58, 150, 68) +                      // toes point away
  `<circle cx="112" cy="58" r="3" fill="${FG}"/>`
);

const bridgeDown = landscape(
  head(18, 66) +
  line(29, 66, 86, 66) +                        // shoulders and pelvis down
  line(52, 66, 50, 48) +
  line(86, 66, 112, 42) +                       // thigh
  line(112, 42, 132, 68) +                      // shin
  line(132, 68, 148, 68) +                      // foot
  `<line x1="8" y1="72" x2="154" y2="72" stroke="${DIM}" stroke-width="2"/>`
);

const bridgeUp = landscape(
  head(18, 70) +
  line(29, 70, 52, 66) +                        // upper back remains supported
  line(52, 66, 88, 42) +                        // shoulder to raised pelvis
  line(88, 42, 112, 42) +                       // pelvis to knee alignment
  line(112, 42, 132, 68) +
  line(132, 68, 148, 68) +
  `<line x1="8" y1="72" x2="154" y2="72" stroke="${DIM}" stroke-width="2"/>`
);

// ── Exports ───────────────────────────────────────────────────────────────────

export const POSES = {
  standing,
  squat,
  'calf-raised':           calfRaised,
  'knee-curled':           kneeCurled,
  'calf-stretch':          calfStretch,
  'quad-stretch':          quadStretch,
  seated,
  'seated-leg-extended':   seatedLegExtended,
  'lying-flat':            lyingFlat,
  'lying-leg-raised':      lyingLegRaised,
  'prone-flat':            proneFace,
  'prone-leg-raised':      proneLegRaised,
  'side-lying':            sideLying,
  'side-lying-abducted':   sideLyingAbducted,
  'lying-knees-bent':      lyingKneesBent,
  'lying-legs-extended':   lyingLegsExtended,
  'ankle-toes-up':         ankleToesUp,
  'ankle-toes-down':       ankleToesDown,
  'heel-slide-bent':       lyingKneesBent,
  'heel-slide-extended':   lyingLegsExtended,
  'bridge-down':           bridgeDown,
  'bridge-up':             bridgeUp,
};
