import { DRAFT_EXERCISES, requiresClinicianPlan } from "./exercises/catalog.js";

const TRACKING_LABELS = {
  hand_landmarks: "Hand tracking required",
  pose_limited: "Camera tracking limited",
  pose_rules_not_validated: "Live rules pending",
};

const humanizeTag = (tag) =>
  tag
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const searchableText = (exercise) =>
  [
    exercise.name,
    exercise.region,
    exercise.category,
    exercise.instruction,
    ...exercise.typicalUse,
    ...exercise.tags,
  ]
    .join(" ")
    .toLowerCase();

function createExerciseCard(exercise) {
  const card = document.createElement("article");
  card.className = "exercise-library-card";

  const metadata = document.createElement("p");
  metadata.className = "exercise-card-metadata";
  metadata.textContent = `${exercise.region} · ${exercise.category}`;

  const title = document.createElement("h4");
  title.textContent = exercise.name;

  const status = document.createElement("p");
  status.className = "exercise-card-status";
  status.textContent = `Draft · ${TRACKING_LABELS[exercise.trackingRequirement]}`;

  const tags = document.createElement("div");
  tags.className = "exercise-card-tags";
  exercise.tags.forEach((tag) => {
    const badge = document.createElement("span");
    badge.textContent = humanizeTag(tag);
    tags.append(badge);
  });

  const usesTitle = document.createElement("p");
  usesTitle.className = "exercise-card-label";
  usesTitle.textContent = "Typical use";

  const uses = document.createElement("p");
  uses.className = "exercise-card-uses";
  uses.textContent = exercise.typicalUse.join(" · ");

  const details = document.createElement("details");
  details.className = "exercise-card-details";
  const summary = document.createElement("summary");
  summary.textContent = "Read instructions";
  const instruction = document.createElement("p");
  instruction.textContent = exercise.instruction;
  details.append(summary, instruction);

  const safety = document.createElement("p");
  safety.className = "exercise-card-safety";
  safety.textContent = requiresClinicianPlan(exercise)
    ? "Use only when included in a clinician-approved plan."
    : "Review suitability and support needs before starting.";

  card.append(metadata, title, status, tags, usesTitle, uses, details, safety);
  return card;
}

function initialiseExerciseLibrary() {
  const grid = document.getElementById("exerciseLibraryGrid");
  const search = document.getElementById("exerciseLibrarySearch");
  const region = document.getElementById("exerciseLibraryRegion");
  const count = document.getElementById("exerciseLibraryCount");

  if (!grid || !search || !region || !count) return;

  [...new Set(DRAFT_EXERCISES.map((exercise) => exercise.region))]
    .sort()
    .forEach((regionName) => {
      const option = document.createElement("option");
      option.value = regionName;
      option.textContent = regionName;
      region.append(option);
    });

  const render = () => {
    const query = search.value.trim().toLowerCase();
    const selectedRegion = region.value;
    const matches = DRAFT_EXERCISES.filter(
      (exercise) =>
        (selectedRegion === "all" || exercise.region === selectedRegion) &&
        (!query || searchableText(exercise).includes(query))
    );

    grid.replaceChildren(...matches.map(createExerciseCard));
    count.textContent = `${matches.length} of ${DRAFT_EXERCISES.length} draft exercises shown`;

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "exercise-library-empty";
      empty.textContent = "No exercises match that search.";
      grid.append(empty);
    }
  };

  search.addEventListener("input", render);
  region.addEventListener("change", render);
  render();
}

initialiseExerciseLibrary();
