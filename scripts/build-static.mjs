import { cp, mkdir, rm, writeFile } from "node:fs/promises";
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
  "img",
  "main.js",
  "movement-measurements.js",
  "personalization.js",
  "poses.js",
  "practice-access.js",
  "runtime-config.js",
  "role-ui.js",
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

const configuredApiBase = process.env.PHYSIOVISION_API_BASE?.trim();

if (configuredApiBase) {
  const apiUrl = new URL(configuredApiBase);
  const isLocalApi = ["localhost", "127.0.0.1"].includes(apiUrl.hostname);

  if (apiUrl.protocol !== "https:" && !isLocalApi) {
    throw new Error(
      "PHYSIOVISION_API_BASE must use HTTPS for a deployed website."
    );
  }

  const normalizedApiBase = configuredApiBase.replace(/\/+$/, "");
  await writeFile(
    path.join(outputDirectory, "runtime-config.js"),
    `window.PHYSIOVISION_API_BASE = ${JSON.stringify(normalizedApiBase)};\n`
  );
  console.log(`Configured production API: ${normalizedApiBase}`);
} else {
  console.warn(
    "PHYSIOVISION_API_BASE is not set; the build will use same-origin /api."
  );
}

console.log(`Built ${frontendEntries.length} frontend entries in dist/`);
