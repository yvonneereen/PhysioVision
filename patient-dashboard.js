import {
  createConsultation,
  getConsultations,
  getEscalations,
  getMe,
  getPainCheckins,
  getPrescriptions,
  getSessions,
  isLoggedIn,
} from "./api.js?v=17";
import {
  analysePatientTrend,
  isCurrentPrescription,
} from "./patient-dashboard-state.js?v=1";
import { buildConservativeWellnessPlan } from "./wellness-screening.js";

const dashboard = document.getElementById("patientDashboard");
const publicMain = document.getElementById("main-content");
const skipLink = document.querySelector(".skip-link");
const patientName = document.getElementById("patientDashboardName");
const intro = document.getElementById("patientDashboardIntro");
const planStatus = document.getElementById("patientPlanStatus");
const planIntro = document.getElementById("patientPlanIntro");
const planList = document.getElementById("patientPlanList");
const planStart = document.getElementById("patientPlanStart");
const primaryStart = document.getElementById("patientStartPrimary");
const createPlan = document.getElementById("patientCreateWellnessPlan");
const trendStatus = document.getElementById("patientTrendStatus");
const trendMessage = document.getElementById("patientTrendMessage");
const trendChart = document.getElementById("patientTrendChart");
const sessionsMetric = document.getElementById("patientSessionsMetric");
const qualityMetric = document.getElementById("patientQualityMetric");
const painMetric = document.getElementById("patientPainMetric");
const trendAlert = document.getElementById("patientTrendAlert");
const trendAlertTitle = document.getElementById("patientTrendAlertTitle");
const trendAlertMessage = document.getElementById("patientTrendAlertMessage");
const upcomingConsultation = document.getElementById("patientUpcomingConsultation");
const backToDashboard = document.getElementById("patientBackToDashboard");
const bookingForm = document.getElementById("bookingForm");
const bookingDate = document.getElementById("bookingDate");
const bookingStatus = document.getElementById("bookingStatus");
const bookingClinicianName = document.getElementById("bookingClinicianName");
const bookingClinicianAvatar = document.getElementById("bookingClinicianAvatar");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

const GOAL_LABELS = Object.freeze({
  stronger_knees: "Stronger knees",
  better_balance: "Better balance",
  less_stiffness: "Move with less stiffness",
  stay_active: "Stay active",
});

const TREND_STATUS_LABELS = Object.freeze({
  building_baseline: "Building baseline",
  stable: "Steady",
  improving: "Improving",
  review_suggested: "Review suggested",
});

let currentUser = null;
let currentData = null;
let firstExerciseId = null;
let primaryAction = "plan";
let toastTimer = null;

function results(data) {
  return data?.results ?? data ?? [];
}

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "PV";
}

function formatDate(value, options = {}) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(parsed);
}

function setView(mode) {
  const isPatientDashboard = mode === "dashboard";
  dashboard.hidden = !isPatientDashboard;
  publicMain.hidden = isPatientDashboard;
  backToDashboard?.classList.toggle("hidden", isPatientDashboard);
  document.body.classList.toggle("patient-app-active", isPatientDashboard);
  document.body.classList.toggle("patient-practice-active", !isPatientDashboard);
  if (skipLink) {
    skipLink.href = isPatientDashboard ? "#patientDashboard" : "#practice";
  }
}

function showDashboard() {
  if (currentUser?.role !== "patient") return;
  setView("dashboard");
  window.scrollTo({ top: 0, behavior: "smooth" });
  dashboard.focus({ preventScroll: true });
}

function openPlanModal() {
  document.querySelector("[data-open='plan-modal']")?.click();
}

function openBookingModal() {
  document.querySelector("[data-open='booking-modal']")?.click();
}

function startExercise(exerciseId = firstExerciseId) {
  if (!exerciseId) {
    if (primaryAction === "booking") {
      openBookingModal();
    } else if (primaryAction === "reload") {
      loadDashboardData();
    } else {
      openPlanModal();
    }
    return;
  }

  setView("practice");
  const exerciseSelect = document.getElementById("exerciseSelect");
  if (exerciseSelect) {
    exerciseSelect.value = exerciseId;
    exerciseSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.getElementById("practice")?.scrollIntoView({ behavior: "smooth" });
}

function planRow({ label, title, detail, exerciseId = null, note = "" }) {
  const row = document.createElement("article");
  row.className = "patient-plan-row";

  const marker = document.createElement("span");
  marker.className = "patient-plan-marker";
  marker.textContent = label;

  const copy = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const description = document.createElement("span");
  description.textContent = detail;
  copy.append(heading, description);
  if (note) {
    const notes = document.createElement("small");
    notes.textContent = note;
    copy.appendChild(notes);
  }

  row.append(marker, copy);
  if (exerciseId) {
    const start = document.createElement("button");
    start.className = "text-link";
    start.type = "button";
    start.textContent = "Start";
    start.addEventListener("click", () => startExercise(exerciseId));
    row.appendChild(start);
  }
  return row;
}

function renderClinicianPlan(prescriptions) {
  const active = prescriptions.filter((item) => isCurrentPrescription(item));
  firstExerciseId = active[0]?.exercise ?? null;
  createPlan.hidden = true;

  if (!active.length) {
    primaryAction = "booking";
    planStatus.textContent = "Awaiting assignment";
    planStatus.className = "status-pill status-pill-review";
    planIntro.textContent =
      "You are on a physiotherapist-guided pathway, but no current exercise has been assigned yet.";
    planList.appendChild(planRow({
      label: "i",
      title: "Your specialist is preparing the detailed plan",
      detail:
        "Exercises stay locked until your physiotherapist assigns the movement, dose and restrictions.",
      note: "You can request a consultation at any time.",
    }));
    planStart.textContent = "Book consultation";
    primaryStart.textContent = "Book consultation";
    return;
  }

  primaryAction = "exercise";
  const clinicianName =
    active.find((item) => item.clinician_name)?.clinician_name ??
    "your physiotherapist";
  planStatus.textContent = "Specialist assigned";
  planStatus.className = "status-pill";
  planIntro.textContent =
    `Detailed plan assigned by ${clinicianName}. Follow these doses and notes exactly.`;
  active.forEach((prescription, index) => {
    const hold = prescription.hold_seconds
      ? ` · hold ${prescription.hold_seconds}s`
      : "";
    planList.appendChild(planRow({
      label: String(index + 1),
      title: prescription.exercise_name,
      detail:
        `${prescription.sets} sets × ${prescription.reps} reps${hold} · ${prescription.days_per_week} days/week`,
      exerciseId: prescription.exercise,
      note: prescription.notes || "No additional specialist note.",
    }));
  });
  planStart.innerHTML = 'Start assigned exercises <span aria-hidden="true">→</span>';
  primaryStart.innerHTML = 'Start today’s exercises <span aria-hidden="true">→</span>';
}

function renderWellnessPlan(profile) {
  const screeningStatus =
    profile?.wellness_screening_status ??
    profile?.wellnessScreening?.status;
  const eligible = screeningStatus === "eligible";
  createPlan.hidden = false;

  if (!eligible) {
    firstExerciseId = null;
    const needsReview =
      screeningStatus === "needs_review" ||
      (profile?.care_path ?? profile?.carePath) === "needs_review";
    primaryAction = needsReview ? "booking" : "plan";
    planStatus.textContent = needsReview ? "Review recommended" : "Safety screen needed";
    planStatus.className = needsReview
      ? "status-pill status-pill-review"
      : "status-pill";
    planIntro.textContent = needsReview
      ? "A self-guided plan was not created because professional guidance may be more appropriate."
      : "Complete the general-wellness safety screen before creating a self-guided plan.";
    planList.appendChild(planRow({
      label: needsReview ? "!" : "1",
      title: needsReview
        ? "Choose professional guidance"
        : "Answer the short wellness safety screen",
      detail: needsReview
        ? "This does not mean that a condition has been diagnosed."
        : "AI support will only use the conservative wellness pathway after the screen is eligible.",
    }));
    planStart.textContent = needsReview
      ? "Book consultation"
      : "Create my wellness plan";
    primaryStart.textContent = planStart.textContent;
    return;
  }

  primaryAction = "exercise";
  const goal = GOAL_LABELS[profile.goal] ?? profile.goal ?? "Stay active";
  const plan = buildConservativeWellnessPlan(goal);
  firstExerciseId = plan.days[0]?.exerciseIds?.[0] ?? null;
  planStatus.textContent = "Wellness plan ready";
  planStatus.className = "status-pill";
  planIntro.textContent =
    "Your conservative general-wellness plan is personalized from your goal and safety-screen answers.";
  plan.days.forEach((day) => {
    planList.appendChild(planRow({
      label: day.day,
      title: day.title,
      detail: `${day.exercises} · ${day.duration}`,
      exerciseId: day.exerciseIds[0],
      note: "Stop if you feel unwell or develop new or concerning symptoms.",
    }));
  });
  planStart.innerHTML = 'Start wellness exercises <span aria-hidden="true">→</span>';
  primaryStart.innerHTML = 'Start today’s exercises <span aria-hidden="true">→</span>';
}

function renderPlan(user, prescriptions) {
  planList.innerHTML = "";
  const profile = user.profile ?? {};
  const carePath = profile.care_path ?? profile.carePath;
  if (
    carePath === "clinician" ||
    profile.primary_clinician ||
    profile.primaryClinician
  ) {
    renderClinicianPlan(prescriptions);
  } else {
    renderWellnessPlan(profile);
  }
}

function renderTrendChart(series) {
  trendChart.innerHTML = "";
  if (!series.length) {
    const empty = document.createElement("p");
    empty.textContent = "No measured quality scores yet.";
    trendChart.appendChild(empty);
    trendChart.setAttribute(
      "aria-label",
      "No movement-quality trend is available yet",
    );
    return;
  }

  series.forEach((value, index) => {
    const bar = document.createElement("span");
    bar.style.height = `${Math.max(8, Math.min(100, value))}%`;
    bar.title = `Session ${index + 1}: ${Math.round(value)} out of 100`;
    trendChart.appendChild(bar);
  });
  trendChart.setAttribute(
    "aria-label",
    `Movement-quality scores from oldest to newest: ${series
      .map((value) => Math.round(value))
      .join(", ")}`,
  );
}

function renderTrend(data) {
  const trend = analysePatientTrend(data);
  trendStatus.textContent = TREND_STATUS_LABELS[trend.status];
  trendStatus.className =
    trend.status === "review_suggested"
      ? "status-pill status-pill-review"
      : "status-pill";
  trendMessage.textContent = `${trend.title}. ${trend.message}`;
  sessionsMetric.textContent = String(trend.sessionsThisWeek);
  qualityMetric.textContent =
    trend.averageQuality === null ? "—" : `${Math.round(trend.averageQuality)}/100`;
  painMetric.textContent =
    trend.latestPain === null ? "—" : `${Math.round(trend.latestPain)}/10`;
  renderTrendChart(trend.qualitySeries);

  const shouldShowAlert = trend.status === "review_suggested";
  trendAlert.classList.toggle("hidden", !shouldShowAlert);
  if (shouldShowAlert) {
    trendAlertTitle.textContent = trend.title;
    trendAlertMessage.textContent = trend.message;
  }
}

function renderUpcomingConsultation(consultations) {
  const now = new Date();
  const next = consultations
    .filter((item) => (
      ["requested", "confirmed"].includes(item.status) &&
      new Date(item.scheduled_at) >= now
    ))
    .sort(
      (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at),
    )[0];

  if (!next) {
    upcomingConsultation.textContent = "No consultation currently scheduled.";
    return;
  }
  const status = next.status === "confirmed" ? "Confirmed" : "Requested";
  upcomingConsultation.textContent =
    `${status}: ${formatDate(next.scheduled_at, {
      hour: "numeric",
      minute: "2-digit",
    })} with ${next.clinician_name || "the PhysioVision care team"}.`;
}

function setBookingClinician(prescriptions) {
  const clinicianName =
    prescriptions.find((item) => item.clinician_name)?.clinician_name;
  if (!clinicianName) return;
  bookingClinicianName.textContent = clinicianName;
  bookingClinicianAvatar.textContent = initials(clinicianName);
}

async function loadDashboardData() {
  if (!currentUser || currentUser.role !== "patient") return;
  planStatus.textContent = "Loading plan…";
  planIntro.textContent =
    "We are loading the exercises available for your care pathway.";
  planList.innerHTML = "";

  const requests = await Promise.allSettled([
    getPrescriptions(),
    getSessions(),
    getPainCheckins(),
    getEscalations(),
    getConsultations(),
  ]);
  const read = (index) =>
    requests[index].status === "fulfilled" ? results(requests[index].value) : [];

  currentData = {
    prescriptions: read(0),
    sessions: read(1),
    painCheckins: read(2),
    escalations: read(3),
    consultations: read(4),
  };

  window.dispatchEvent(new CustomEvent(
    "physiovision:prescriptions-updated",
    { detail: currentData.prescriptions },
  ));
  if (requests[0].status === "rejected") {
    firstExerciseId = null;
    primaryAction = "reload";
    planStatus.textContent = "Plan unavailable";
    planStatus.className = "status-pill status-pill-review";
    planIntro.textContent =
      "Your plan could not be loaded. No exercise access has been changed.";
    planList.appendChild(planRow({
      label: "!",
      title: "We could not reach your private plan",
      detail: "Check your connection and try again.",
    }));
    planStart.textContent = "Try loading again";
    primaryStart.textContent = "Try loading plan again";
    createPlan.hidden = true;
  } else {
    renderPlan(currentUser, currentData.prescriptions);
  }

  if (
    requests[1].status === "rejected" &&
    requests[2].status === "rejected"
  ) {
    trendStatus.textContent = "Unavailable";
    trendStatus.className = "status-pill status-pill-review";
    trendMessage.textContent =
      "Your private session and pain history could not be loaded.";
    sessionsMetric.textContent = "—";
    qualityMetric.textContent = "—";
    painMetric.textContent = "—";
    renderTrendChart([]);
    trendAlert.classList.add("hidden");
  } else {
    renderTrend(currentData);
  }
  renderUpcomingConsultation(currentData.consultations);
  setBookingClinician(currentData.prescriptions);
}

async function activatePatientDashboard(user) {
  if (user?.role !== "patient") return;
  currentUser = user;
  patientName.textContent = user.first_name || "there";
  intro.textContent =
    (user.profile?.care_path ?? user.profile?.carePath) === "clinician"
      ? "Review your specialist-assigned plan, start exercises and follow your progress."
      : "Create a safe wellness plan, start exercises and follow your progress.";
  setView("dashboard");
  await loadDashboardData();
}

function prepareBookingDate() {
  if (!bookingDate) return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);
  bookingDate.min = date;
  if (!bookingDate.value) bookingDate.value = date;
}

function showToast(message) {
  toastMessage.innerHTML = "";
  const heading = document.createElement("strong");
  heading.textContent = "Consultation requested";
  toastMessage.append(heading, document.createTextNode(message));
  window.clearTimeout(toastTimer);
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 4500);
}

bookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;
  bookingStatus.textContent = "Sending your request…";
  const submit = bookingForm.querySelector("[type='submit']");
  submit.disabled = true;

  const formData = new FormData(bookingForm);
  const scheduledAt = new Date(
    `${formData.get("date")}T${formData.get("time")}:00`,
  );
  try {
    const consultation = await createConsultation({
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: Number(formData.get("duration")),
      patient_notes: String(formData.get("notes") ?? "").trim(),
    });
    bookingStatus.textContent =
      "Request sent. The physiotherapist will confirm the appointment.";
    document
      .querySelector("#booking-modal [data-close-modal]")
      ?.click();
    showToast(
      `${formatDate(consultation.scheduled_at, {
        hour: "numeric",
        minute: "2-digit",
      })} with ${consultation.clinician_name || "the PhysioVision care team"}.`,
    );
    await loadDashboardData();
  } catch (error) {
    bookingStatus.textContent =
      error.message || "The consultation request could not be sent.";
  } finally {
    submit.disabled = false;
  }
});

document
  .querySelectorAll("[data-patient-dashboard]")
  .forEach((button) => button.addEventListener("click", showDashboard));
document
  .querySelectorAll("[data-patient-start]")
  .forEach((button) => button.addEventListener("click", () => startExercise()));

document.getElementById("patientAskAi")?.addEventListener("click", () => {
  document.getElementById("agentChatLauncher")?.click();
});

window.addEventListener("physiovision:auth-role", (event) => {
  const user = event.detail?.user;
  if (event.detail?.role === "patient") {
    activatePatientDashboard(user);
  } else {
    currentUser = null;
    dashboard.hidden = true;
    publicMain.hidden = false;
    document.body.classList.remove(
      "patient-app-active",
      "patient-practice-active",
    );
  }
});

window.addEventListener("physiovision:profile-updated", (event) => {
  if (currentUser?.role !== "patient") return;
  const browserProfile = event.detail ?? {};
  currentUser = {
    ...currentUser,
    profile: {
      ...(currentUser.profile ?? {}),
      ...browserProfile,
      care_path:
        browserProfile.carePath ?? currentUser.profile?.care_path,
      wellness_screening_status:
        browserProfile.wellnessScreening?.status ??
        currentUser.profile?.wellness_screening_status,
    },
  };
  renderPlan(currentUser, currentData?.prescriptions ?? []);
});

window.pvShowPatientDashboard = showDashboard;
window.pvStartPatientExercise = startExercise;

prepareBookingDate();

if (isLoggedIn()) {
  getMe()
    .then((user) => {
      if (user.role === "patient" && !currentUser) {
        activatePatientDashboard(user);
      }
    })
    .catch(() => {});
}
