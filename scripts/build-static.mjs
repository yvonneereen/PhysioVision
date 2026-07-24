import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const outputDirectory = path.join(projectRoot, "dist");

const frontendEntries = [
  "index.html",
  "style.css",
  "agent-chat.js",
  "api.js",
  "auth.js",
  "care-workflow.js",
  "exercise-library.js",
  "exercise-tracking.js",
  "geometry.js",
  "hand-geometry.js",
  "main.js",
  "movement-measurements.js",
  "personalization.js",
  "poses.js",
  "practice-access.js",
  "therapist.js",
  "ui.js",
  "voice-guidance.js",
  "wellness-screening.js",
  "exercises",
  "feedback",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of frontendEntries) {
  await cp(
    path.join(projectRoot, entry),
    path.join(outputDirectory, entry),
    { recursive: true }
  );
}

console.log(`Built ${frontendEntries.length} frontend entries in dist/`);
