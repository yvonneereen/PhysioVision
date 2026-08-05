import {
  acceptCareInvitation,
  acceptConsultation,
  cancelConsultation,
  createConsultation,
  getCareMessages,
  getConsultations,
  getEscalations,
  getMe,
  getPainCheckins,
  getPrescriptions,
  getSessions,
  isLoggedIn,
  selectPatientPathway,
  sendCareMessage,
  updateConsultation,
} from "./api.js?v=26";
import {
  analysePatientTrend,
  findUpcomingConsultation,
  isClinicianGuidedProfile,
  isCurrentPrescription,
  shouldShowPhysiotherapistRequest,
} from "./patient-dashboard-state.js?v=3";
import { saveProfile } from "./personalization.js?v=9";
import { getLocale, translateText } from "./i18n.js?v=7";
import { EXERCISE_MAP } from "./exercises/registry.js";

const dashboard = document.getElementById("patientDashboard");
const publicMain = document.getElementById("main-content");
const skipLink = document.querySelector(".skip-link");
const patientName = document.getElementById("patientDashboardName");
const intro = document.getElementById("patientDashboardIntro");
const dashboardFeatures = document.getElementById("patientDashboardFeatures");
const primaryActions = document.getElementById(
  "patientDashboardPrimaryActions",
);
const planStatus = document.getElementById("patientPlanStatus");
const planIntro = document.getElementById("patientPlanIntro");
const planList = document.getElementById("patientPlanList");
const planStart = document.getElementById("patientPlanStart");
const planChange = document.getElementById("patientPlanChange");
const primaryStart = document.getElementById("patientStartPrimary");
const demoNotice = document.getElementById("patientDemoNotice");
const dashboardSide = document.getElementById("patientDashboardSide");
const pathwayModal = document.getElementById("patientPathwayModal");
const pathwayStatus = document.getElementById("patientPathwayStatus");
const pathwayInviteForm = document.getElementById(
  "patientPathwayInviteForm",
);
const pathwayInviteCode = document.getElementById(
  "patientPathwayInviteCode",
);
const pathwayInviteSubmit = document.getElementById(
  "patientPathwayInviteSubmit",
);
const pathwayInviteStatus = document.getElementById(
  "patientPathwayInviteStatus",
);
const pathwaySelfRefer = document.getElementById(
  "patientPathwaySelfRefer",
);
const referPhysio = document.getElementById("patientReferPhysio");
const referPhysioButton = document.getElementById("patientReferPhysioButton");
const referPhysioStatus = document.getElementById("patientReferPhysioStatus");
const messagesLauncher = document.getElementById("patientMessagesLauncher");
const messagesPanel = document.getElementById("patientMessagesPanel");
const messagesClose = document.getElementById("patientMessagesClose");
const messagesClinician = document.getElementById("patientMessagesClinician");
const messagesThread = document.getElementById("patientMessagesThread");
const messagesForm = document.getElementById("patientMessagesForm");
const messagesInput = document.getElementById("patientMessagesInput");
const trendStatus = document.getElementById("patientTrendStatus");
const trendMessage = document.getElementById("patientTrendMessage");
const trendChart = document.getElementById("patientTrendChart");
const sessionsMetric = document.getElementById("patientSessionsMetric");
const qualityMetric = document.getElementById("patientQualityMetric");
const painMetric = document.getElementById("patientPainMetric");
const trendAlert = document.getElementById("patientTrendAlert");
const trendAlertTitle = document.getElementById("patientTrendAlertTitle");
const trendAlertMessage = document.getElementById("patientTrendAlertMessage");
const trendAlertGuidance = document.getElementById("patientTrendAlertGuidance");
const trendRequestButton = document.getElementById(
  "patientTrendRequestPhysiotherapist",
);
const trendRequestStatus = document.getElementById(
  "patientTrendRequestStatus",
);
const consultationCard = document.getElementById("patientConsultationCard");
const upcomingConsultation = document.getElementById("patientUpcomingConsultation");
const pendingConsultsEl = document.getElementById("patientPendingConsults");
const backToDashboard = document.getElementById("patientBackToDashboard");
const bookingForm = document.getElementById("bookingForm");
const bookingDate = document.getElementById("bookingDate");
const bookingStatus = document.getElementById("bookingStatus");
const bookingClinicianName = document.getElementById("bookingClinicianName");
const bookingClinicianAvatar = document.getElementById("bookingClinicianAvatar");
const bookingNotes = document.getElementById("bookingNotes");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

const TREND_STATUS_LABELS = Object.freeze({
  building_baseline: "Building baseline",
  stable: "Steady",
  improving: "Improving",
  review_suggested: "Review suggested",
});

const GOAL_BROWSER_LABELS = Object.freeze({
  stronger_knees: "Stronger knees",
  better_balance: "Better balance",
  less_stiffness: "Move with less stiffness",
  stay_active: "Stay active",
  stronger_hips: "Stronger hips",
  ankle_mobility: "Better ankle movement",
  walking_confidence: "Walk with confidence",
  other: "Other",
});

const ACTIVITY_BROWSER_LABELS = Object.freeze({
  lightly_active: "Lightly active",
  mostly_seated: "Mostly seated",
  active_most_days: "Active most days",
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
  return new Intl.DateTimeFormat(getLocale(), {
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

function openAiCompanion() {
  document.getElementById("agentChatLauncher")?.click();
}

function unavailableWellnessExercises(plan) {
  const exerciseIds = (plan?.days ?? []).flatMap(
    (day) => day.exercise_ids ?? day.exerciseIds ?? [],
  );
  return [...new Set(exerciseIds)].filter((exerciseId) => {
    const exercise = EXERCISE_MAP[exerciseId];
    return (
      !exercise
      || exercise.comingSoon
      || exercise.requiresClinicianPlan
    );
  });
}

function startExercise(exerciseId = firstExerciseId) {
  if (!exerciseId) {
    if (primaryAction === "ai") {
      openAiCompanion();
    } else if (primaryAction === "reload") {
      loadDashboardData();
    } else {
      openPlanModal();
    }
    return;
  }

  const authState = window.physioVisionAuthState ?? null;
  const authProfile =
    authState?.role === "patient" ? authState?.user?.profile ?? null : null;
  const patientProfile = {
    ...(authProfile ?? {}),
    ...(currentUser?.profile ?? {}),
  };
  const practiceRequest = {
    role: "patient",
    profile: Object.keys(patientProfile).length ? patientProfile : null,
    exerciseId,
  };

  window.physioVisionPendingPracticeRequest = practiceRequest;

  if (typeof window.physioVisionOpenPractice === "function") {
    window.physioVisionOpenPractice(practiceRequest);
  } else {
    window.dispatchEvent(
      new CustomEvent("physiovision:practice-requested", {
        detail: practiceRequest,
      }),
    );
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

function setPhysiotherapistRequestVisibility(visible) {
  if (!referPhysio) return;
  referPhysio.hidden = !visible;
  referPhysio.classList.toggle("is-hidden", !visible);
  referPhysio.setAttribute("aria-hidden", String(!visible));
  referPhysio.style.display = visible ? "" : "none";
}

function renderClinicianPlan(prescriptions) {
  const active = prescriptions.filter((item) => isCurrentPrescription(item));
  firstExerciseId = active[0]?.exercise ?? null;
  dashboard.classList.remove("wellness-dashboard");
  primaryActions.hidden = false;
  dashboardSide.hidden = false;
  consultationCard.hidden = false;
  // Entering this renderer already proves that this is a clinician-guided
  // patient. They can use the consultation card for their existing care team
  // and must never see the self-referral action.
  setPhysiotherapistRequestVisibility(false);
  setupPatientMessaging(currentUser?.profile);
  const isDemo = active.some((item) => item.is_demo);
  demoNotice.hidden = !isDemo;

  if (!active.length) {
    primaryAction = "reload";
    planStatus.textContent = "Awaiting assignment";
    planStatus.className = "status-pill status-pill-review";
    planIntro.textContent =
      "You are on a physiotherapist-guided pathway, but no current exercise has been assigned yet.";
    planList.appendChild(planRow({
      label: "i",
      title: "Your specialist is preparing the detailed plan",
      detail:
        "Exercises stay locked until your physiotherapist assigns the movement, dose and restrictions.",
      note: "Use the single Consultation card if you need to contact a physiotherapist.",
    }));
    planStart.textContent = "Check for my assigned plan";
    primaryStart.textContent = "Check for assigned exercises";
    return;
  }

  primaryAction = "exercise";
  const clinicianName = isDemo
    ? "the prototype display"
    : (
      active.find((item) => item.clinician_name)?.clinician_name ??
      "your physiotherapist"
    );
  planStatus.textContent = isDemo ? "Prototype sample" : "Specialist assigned";
  planStatus.className = "status-pill";
  planIntro.textContent =
    isDemo
      ? (
        "Example: early rehabilitation after total knee replacement. These "
        + "sample doses are interface data, not instructions for a real patient."
      )
      : `Detailed plan assigned by ${clinicianName}. Follow these doses and notes exactly.`;
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
  dashboard.classList.add("wellness-dashboard");
  primaryActions.hidden = true;
  dashboardSide.hidden = true;
  consultationCard.hidden = true;
  demoNotice.hidden = true;
  setPhysiotherapistRequestVisibility(
    shouldShowPhysiotherapistRequest(profile),
  );
  if (messagesLauncher) messagesLauncher.hidden = true;
  closeMessagesPanel();

  if (!eligible) {
    firstExerciseId = null;
    const needsReview =
      screeningStatus === "needs_review" ||
      (profile?.care_path ?? profile?.carePath) === "needs_review";
    primaryAction = "plan";
    planStatus.textContent = needsReview ? "Review needed" : "No plan yet";
    planStatus.className = needsReview
      ? "status-pill status-pill-review"
      : "status-pill";
    planIntro.textContent = needsReview
      ? (
        "No self-guided plan has been created. Review your safety-screen "
        + "answers before using general-wellness exercises."
      )
      : (
        "No plan has been created yet. Ask the AI movement companion to help "
        + "you begin a personalized general-wellness plan."
      );
    planList.appendChild(planRow({
      label: needsReview ? "!" : "1",
      title: needsReview
        ? "Review the wellness safety screen"
        : "Start with your AI movement companion",
      detail: needsReview
        ? (
          "This is not a diagnosis. Self-guided exercises remain locked while "
          + "an answer indicates that professional guidance may be safer."
        )
        : (
          "The AI can help clarify your goal. Exercise access is created only "
          + "after the short general-wellness safety screen is eligible."
        ),
    }));
    planStart.textContent = needsReview
      ? "Review my safety screen"
      : "Ask AI to create my plan";
    return;
  }

  const plan = profile.wellness_plan ?? profile.wellnessPlan;
  if (!plan?.days?.length) {
    firstExerciseId = null;
    primaryAction = "plan";
    planStatus.textContent = "Ready for an AI draft";
    planStatus.className = "status-pill";
    planIntro.textContent =
      "Your safety screen is eligible, but no AI plan has been accepted yet.";
    planList.appendChild(planRow({
      label: "✦",
      title: "Create and review your AI plan",
      detail:
        "Answer the short planning interview, review why each session was chosen, and accept the draft before exercises unlock.",
      note:
        "Passing the safety screen alone never assigns exercises.",
    }));
    planStart.textContent = "Create my plan with AI";
    return;
  }

  const unavailableExercises = unavailableWellnessExercises(plan);
  if (unavailableExercises.length) {
    firstExerciseId = null;
    primaryAction = "plan";
    planStatus.textContent = "Plan refresh needed";
    planStatus.className = "status-pill status-pill-review";
    planIntro.textContent =
      "Your saved AI plan contains an exercise that now requires physiotherapist approval.";
    planList.appendChild(planRow({
      label: "!",
      title: "Create a new AI wellness plan",
      detail:
        "The camera remains locked for clinician-only movements. A new draft will use only exercises available to your general-wellness pathway.",
      note:
        "Your safety-screen result is unchanged; only the incompatible saved plan needs replacing.",
    }));
    planStart.textContent = "Create a new AI plan";
    return;
  }

  primaryAction = "exercise";
  firstExerciseId =
    plan.days[0]?.exercise_ids?.[0]
    ?? plan.days[0]?.exerciseIds?.[0]
    ?? null;
  planStatus.textContent = "AI plan accepted";
  planStatus.className = "status-pill";
  planIntro.textContent =
    plan.summary
    ?? "Your accepted AI wellness plan uses reviewed, camera-trackable exercises.";
  plan.days.forEach((day) => {
    const exerciseIds = day.exercise_ids ?? day.exerciseIds ?? [];
    planList.appendChild(planRow({
      label: day.day,
      title: day.title,
      detail: `${day.exercises} · ${day.duration}`,
      exerciseId: exerciseIds[0],
      note:
        "AI draft accepted by you. Stop if you feel unwell or develop new or concerning symptoms.",
    }));
  });
  planStart.innerHTML = 'Start wellness exercises <span aria-hidden="true">→</span>';
  if (planChange) planChange.hidden = false;
  primaryStart.innerHTML = 'Start today’s exercises <span aria-hidden="true">→</span>';
}

function renderPlan(user, prescriptions) {
  planList.innerHTML = "";
  if (planChange) planChange.hidden = true;
  const profile = user.profile ?? {};
  if (isClinicianGuidedProfile(profile)) {
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
  const profile = currentUser?.profile ?? {};
  const isPhysiotherapistPath = isClinicianGuidedProfile(profile);
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
    trendAlertTitle.textContent = isPhysiotherapistPath
      ? trend.title
      : "Pause your wellness plan and seek professional advice";
    trendAlertMessage.textContent = trend.message;
    trendAlertGuidance.textContent = isPhysiotherapistPath
      ? (
        "This is a trend prompt, not a diagnosis. Send a consultation "
        + "request if you want your physiotherapist to review this pattern."
      )
      : (
        "This is a trend prompt, not a diagnosis. You can request an "
        + "available PhysioVision physiotherapist; the request is not "
        + "confirmed until it is accepted."
      );
    renderTrendConsultationAction(
      data.consultations,
      isPhysiotherapistPath,
    );
  }
}

function describeConsultation(consultation) {
  const status = consultation.status === "confirmed"
    ? "Confirmed"
    : "Requested";
  return `${status}: ${formatDate(consultation.scheduled_at, {
    hour: "numeric",
    minute: "2-digit",
  })} with ${consultation.clinician_name || "the PhysioVision care team"}.`;
}

function renderTrendConsultationAction(
  consultations,
  isPhysiotherapistPath = false,
) {
  if (!trendRequestButton || !trendRequestStatus) return;
  const next = findUpcomingConsultation(consultations);

  if (next) {
    trendRequestButton.disabled = true;
    trendRequestButton.textContent = next.status === "confirmed"
      ? "Physiotherapist confirmed"
      : "Review already requested";
    trendRequestStatus.textContent = describeConsultation(next);
    return;
  }

  trendRequestButton.disabled = false;
  trendRequestButton.innerHTML = isPhysiotherapistPath
    ? 'Ask my physiotherapist to review <span aria-hidden="true">→</span>'
    : 'Request a physiotherapist <span aria-hidden="true">→</span>';
  trendRequestStatus.textContent = isPhysiotherapistPath
    ? "Choose a preferred time for your existing physiotherapist to review this pattern."
    : "Choose a preferred time. The request must be accepted before it is confirmed.";
}

function renderUpcomingConsultation(consultations) {
  const next = findUpcomingConsultation(consultations);

  if (!next) {
    upcomingConsultation.textContent = "No consultation currently scheduled.";
    return;
  }
  upcomingConsultation.textContent = describeConsultation(next);
}

// Consultations the clinician suggested, awaiting this patient's response.
function renderPendingConsults(consultations) {
  if (!pendingConsultsEl) return;
  const now = new Date();
  const pending = consultations.filter((c) =>
    c.status === "requested" &&
    c.initiated_by === "clinician" &&
    new Date(c.scheduled_at) >= now
  );

  if (!pending.length) {
    pendingConsultsEl.innerHTML = "";
    return;
  }

  pendingConsultsEl.innerHTML = pending.map((c) => {
    const when = formatDate(c.scheduled_at, { hour: "numeric", minute: "2-digit" });
    return `
      <div class="pending-consult" data-consult-id="${c.id}" data-consult-when="${c.scheduled_at}">
        <p class="pending-consult-title">Your physiotherapist suggested a consultation</p>
        <p class="pending-consult-time">${when} with ${c.clinician_name || "your care team"}</p>
        <div class="pending-consult-actions">
          <button class="button button-coral button-small" data-consult-accept="${c.id}">Accept</button>
          <button class="button button-light button-small" data-consult-propose="${c.id}">Propose new time</button>
          <button class="button button-light button-small" data-consult-decline="${c.id}">Decline</button>
        </div>
        <p class="pending-consult-status" id="pendingStatus-${c.id}"></p>
      </div>`;
  }).join("");
}

async function handlePendingConsultClick(event) {
  const acceptId  = event.target.getAttribute("data-consult-accept");
  const proposeId = event.target.getAttribute("data-consult-propose");
  const declineId = event.target.getAttribute("data-consult-decline");
  const id = acceptId || proposeId || declineId;
  if (!id) return;

  const statusEl = document.getElementById(`pendingStatus-${id}`);
  try {
    if (acceptId) {
      await acceptConsultation(acceptId);
    } else if (declineId) {
      await cancelConsultation(declineId);
    } else if (proposeId) {
      const current = event.target.closest(".pending-consult")?.dataset.consultWhen;
      const input = window.prompt(
        translateText("Propose a new date & time (e.g. 2026-08-05 15:30):"),
        current ? current.slice(0, 16).replace("T", " ") : ""
      );
      if (!input) return;
      const parsed = new Date(input.replace(" ", "T"));
      if (isNaN(parsed.getTime())) {
        if (statusEl) statusEl.textContent = "Could not read that date/time.";
        return;
      }
      await updateConsultation(proposeId, { scheduled_at: parsed.toISOString() });
    }
    await loadDashboardData();
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message || "Something went wrong.";
  }
}

pendingConsultsEl?.addEventListener("click", handlePendingConsultClick);

function setBookingClinician(prescriptions) {
  const clinicianName =
    prescriptions.find(
      (item) => item.clinician_name && !item.is_demo
    )?.clinician_name;
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
  window.sessionStorage.setItem(
    "physiovision.prescriptions.v1",
    JSON.stringify(currentData.prescriptions),
  );
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
  renderPendingConsults(currentData.consultations);
  setBookingClinician(currentData.prescriptions);
}

async function activatePatientDashboard(user) {
  if (user?.role !== "patient") return;
  currentUser = user;
  saveProfile({
    ...browserProfileFromApi(user.profile ?? {}),
    name: user.first_name ?? "",
  }, {
    syncBackend: false,
    syncScreening: false,
  });
  patientName.textContent = user.first_name || "there";
  setView("dashboard");
  const choice =
    user.profile?.pathway_choice ??
    user.profile?.pathwayChoice ??
    "unselected";
  if (choice === "unselected") {
    intro.textContent =
      "Choose your exercise pathway to open the correct patient functions.";
    showPathwayChoice();
    return;
  }
  hidePathwayChoice();
  updateDashboardIntro(choice);
  await loadDashboardData();
}

function updateDashboardIntro(choice) {
  const usesPhysiotherapist = choice === "physiotherapist";
  intro.textContent = usesPhysiotherapist
    ? (
      "Review your physiotherapist-assigned plan, start approved exercises "
      + "and follow your progress."
    )
    : (
      "For older adults without a diagnosed condition or clinician "
      + "restrictions. Use AI support to create a conservative wellness plan, "
      + "complete camera-guided exercises, record pain check-ins and follow "
      + "your movement progress over time."
    );

  const features = usesPhysiotherapist
    ? [
      "Specialist-assigned programme",
      "Approved movement guidance",
      "Progress and pain trends",
    ]
    : [
      "AI-assisted wellness plan",
      "Camera-guided exercises",
      "Pain check-ins",
      "Movement progress trends",
    ];
  dashboardFeatures.replaceChildren(
    ...features.map((label) => {
      const item = document.createElement("li");
      item.textContent = label;
      return item;
    }),
  );
}

function showPathwayChoice() {
  pathwayModal.classList.add("is-open");
  pathwayModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => {
    pathwayModal.querySelector("[data-pathway-choice]")?.focus();
  }, 50);
}

function hidePathwayChoice() {
  pathwayModal.classList.remove("is-open");
  pathwayModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function setPathwayButtonsDisabled(disabled) {
  pathwayModal
    ?.querySelectorAll("[data-pathway-choice]")
    .forEach((button) => { button.disabled = disabled; });
}

function showPathwayInviteEntry() {
  pathwayInviteForm.hidden = false;
  pathwayStatus.textContent = "";
  pathwayModal
    ?.querySelectorAll("[data-pathway-choice]")
    .forEach((button) => {
      const selected =
        button.dataset.pathwayChoice === "physiotherapist";
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  window.setTimeout(() => pathwayInviteCode?.focus(), 50);
}

async function finishPathwaySetup(profile, user = currentUser) {
  currentUser = { ...user, profile };
  const browserProfile = browserProfileFromApi(profile);
  window.dispatchEvent(new CustomEvent(
    "physiovision:profile-updated",
    { detail: browserProfile },
  ));
  hidePathwayChoice();
  updateDashboardIntro(profile.pathway_choice);
  pathwayStatus.textContent = "";
  await loadDashboardData();
}

// ── Messaging with the assigned physiotherapist ──────────────

function setupPatientMessaging(profile) {
  if (!messagesLauncher) return;
  const hasClinician = Boolean(profile?.primary_clinician);
  messagesLauncher.hidden = !hasClinician;
  if (!hasClinician) {
    closeMessagesPanel();
    return;
  }
  if (messagesClinician) {
    messagesClinician.textContent =
      profile.primary_clinician_name || "your physiotherapist";
  }
}

function openMessagesPanel() {
  if (!messagesPanel) return;
  messagesPanel.hidden = false;
  messagesLauncher?.setAttribute("aria-expanded", "true");
  loadCareMessages();
  messagesInput?.focus();
}

function closeMessagesPanel() {
  if (!messagesPanel) return;
  messagesPanel.hidden = true;
  messagesLauncher?.setAttribute("aria-expanded", "false");
}

messagesLauncher?.addEventListener("click", () => {
  if (messagesPanel?.hidden) openMessagesPanel();
  else closeMessagesPanel();
});
messagesClose?.addEventListener("click", closeMessagesPanel);

async function loadCareMessages() {
  if (!messagesThread) return;
  try {
    const data = await getCareMessages();
    renderCareMessages(results(data));
  } catch (_) {
    messagesThread.innerHTML =
      '<p class="patient-messages-empty">Could not load messages.</p>';
  }
}

function renderCareMessages(messages) {
  messagesThread.innerHTML = "";
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "patient-messages-empty";
    empty.textContent = "No messages yet. Say hello or ask a question.";
    messagesThread.appendChild(empty);
    return;
  }
  for (const message of messages) {
    const mine = message.sender === "patient";
    const bubble = document.createElement("div");
    bubble.className = `care-message ${mine ? "care-message-mine" : "care-message-theirs"}`;
    const body = document.createElement("p");
    body.className = "care-message-body";
    body.textContent = message.body;
    const meta = document.createElement("span");
    meta.className = "care-message-meta";
    const who = mine ? "You" : (message.sender_name || "Physiotherapist");
    meta.textContent =
      `${who} · ${formatDate(message.created_at, { hour: "numeric", minute: "2-digit" })}`;
    bubble.append(body, meta);
    messagesThread.appendChild(bubble);
  }
  messagesThread.scrollTop = messagesThread.scrollHeight;
}

messagesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = messagesInput.value.trim();
  if (!body) return;
  const sendButton = document.getElementById("patientMessagesSend");
  if (sendButton) sendButton.disabled = true;
  try {
    await sendCareMessage(body);
    messagesInput.value = "";
    await loadCareMessages();
  } catch (error) {
    showToast(error.message || "Your message could not be sent.");
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
});

function browserProfileFromApi(profile) {
  const wellnessPlan = profile.wellness_plan ?? null;
  const planConstraints = wellnessPlan?.constraints ?? {};
  return {
    ...(currentUser?.profile ?? {}),
    carePath: profile.care_path,
    pathwayChoice: profile.pathway_choice,
    goal: GOAL_BROWSER_LABELS[profile.goal] ?? profile.goal,
    customGoal: profile.custom_goal ?? "",
    activity:
      ACTIVITY_BROWSER_LABELS[profile.activity_level]
      ?? profile.activity_level,
    focusSide: profile.focus_side,
    cueStyle: profile.cue_style,
    emergencyContactName: profile.emergency_contact_name ?? "",
    emergencyContactRelationship:
      profile.emergency_contact_relationship ?? "",
    emergencyContactPhone: profile.emergency_contact_phone ?? "",
    emergencyContactConsent:
      profile.emergency_contact_consent === true,
    emergencyContactVerifiedAt:
      profile.emergency_contact_verified_at ?? null,
    emergencyContactAlertsReady:
      profile.emergency_contact_alerts_ready === true,
    wellnessScreening: {
      ...(currentUser?.profile?.wellnessScreening ?? {}),
      status: profile.wellness_screening_status,
    },
    wellnessPlan,
    wellnessPlanAcceptedAt: profile.wellness_plan_accepted_at ?? null,
    daysPerWeek:
      planConstraints.days_per_week
      ?? planConstraints.daysPerWeek,
    minutesPerSession:
      planConstraints.requested_minutes_per_session
      ?? planConstraints.requestedMinutesPerSession
      ?? planConstraints.minutes_per_session
      ?? planConstraints.minutesPerSession,
    equipment: planConstraints.equipment,
    hasRelevantHistory: Boolean(profile.medical_history),
    medicalHistory: profile.medical_history ?? "",
  };
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

trendRequestButton?.addEventListener("click", () => {
  if (bookingNotes && !bookingNotes.value.trim()) {
    bookingNotes.value =
      "I would like a physiotherapist to review my recent pain or recovery trend shown by PhysioVision.";
  }
  if (bookingStatus) {
    bookingStatus.textContent =
      "Choose a preferred time, then send the request for review.";
  }
  prepareBookingDate();
});

document
  .querySelectorAll("[data-patient-dashboard]")
  .forEach((button) => button.addEventListener("click", showDashboard));
document
  .querySelectorAll("[data-patient-start]")
  .forEach((button) => button.addEventListener("click", () => startExercise()));

pathwayModal
  ?.querySelectorAll("[data-pathway-choice]")
  .forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.pathwayChoice === "physiotherapist") {
        showPathwayInviteEntry();
        return;
      }

      pathwayInviteForm.hidden = true;
      setPathwayButtonsDisabled(true);
      pathwayStatus.textContent = "Saving your pathway…";
      try {
        const profile = await selectPatientPathway(
          button.dataset.pathwayChoice
        );
        await finishPathwaySetup(profile);
      } catch (error) {
        pathwayStatus.textContent =
          error.message || "Your pathway could not be saved. Please try again.";
        setPathwayButtonsDisabled(false);
      }
    });
  });

pathwayInviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = pathwayInviteCode.value.trim().toUpperCase();
  pathwayInviteCode.value = code;

  if (!/^[A-Z2-9]{8}$/.test(code)) {
    pathwayInviteStatus.textContent =
      "Enter the complete 8-character invitation code.";
    pathwayInviteCode.focus();
    return;
  }

  setPathwayButtonsDisabled(true);
  pathwayInviteCode.disabled = true;
  pathwayInviteSubmit.disabled = true;
  pathwayInviteStatus.textContent = "Checking invitation…";

  try {
    const result = await acceptCareInvitation(code);
    let refreshedUser;
    try {
      refreshedUser = await getMe();
    } catch (_) {
      refreshedUser = {
        ...currentUser,
        profile: {
          ...(currentUser?.profile ?? {}),
          care_path: result.care_path,
          pathway_choice: "physiotherapist",
        },
      };
    }
    pathwayInviteStatus.textContent =
      `Connected to ${result.clinician}. Loading your patient home…`;
    await finishPathwaySetup(refreshedUser.profile, refreshedUser);
    pathwayInviteCode.value = "";
  } catch (error) {
    pathwayInviteStatus.textContent =
      error.message || "The invitation could not be accepted.";
    setPathwayButtonsDisabled(false);
    pathwayInviteCode.disabled = false;
    pathwayInviteSubmit.disabled = false;
    pathwayInviteCode.focus();
  }
});

// Self-referral: patient wants a physiotherapist but has no invite code. Select
// the physiotherapist pathway with no clinician — the backend posts them to the
// triage queue for the care team to claim.
pathwaySelfRefer?.addEventListener("click", async () => {
  setPathwayButtonsDisabled(true);
  pathwayInviteCode.disabled = true;
  pathwayInviteSubmit.disabled = true;
  pathwaySelfRefer.disabled = true;
  pathwayInviteStatus.textContent = "Adding you to the triage queue…";
  try {
    const profile = await selectPatientPathway("physiotherapist");
    pathwayInviteStatus.textContent =
      "Request received. A physiotherapist will pick up your case soon.";
    await finishPathwaySetup(profile);
  } catch (error) {
    pathwayInviteStatus.textContent =
      error.message || "Your request could not be sent. Please try again.";
    setPathwayButtonsDisabled(false);
    pathwayInviteCode.disabled = false;
    pathwayInviteSubmit.disabled = false;
    pathwaySelfRefer.disabled = false;
  }
});

// Wellness patient asks to be seen by a physiotherapist. Switch to the
// physiotherapist pathway (no clinician yet) — the backend posts their log to
// the triage queue for the care team to claim.
referPhysioButton?.addEventListener("click", async () => {
  if (!shouldShowPhysiotherapistRequest(currentUser?.profile)) {
    setPhysiotherapistRequestVisibility(false);
    return;
  }
  const confirmed = window.confirm(translateText(
    "Request a physiotherapist? This pauses your self-guided wellness plan "
    + "and shares your recent history with the care team.",
  ));
  if (!confirmed) return;
  referPhysioButton.disabled = true;
  referPhysioStatus.textContent = "Sending your request…";
  try {
    const profile = await selectPatientPathway("physiotherapist");
    referPhysioStatus.textContent =
      "Request sent. A physiotherapist will pick up your case soon.";
    await finishPathwaySetup(profile);
  } catch (error) {
    referPhysioStatus.textContent =
      error.message || "Your request could not be sent. Please try again.";
    referPhysioButton.disabled = false;
  }
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
      pathway_choice:
        browserProfile.pathwayChoice ??
        browserProfile.pathway_choice ??
        currentUser.profile?.pathway_choice,
      wellness_plan:
        browserProfile.wellnessPlan ??
        browserProfile.wellness_plan ??
        currentUser.profile?.wellness_plan,
      wellness_plan_accepted_at:
        browserProfile.wellnessPlanAcceptedAt ??
        browserProfile.wellness_plan_accepted_at ??
        currentUser.profile?.wellness_plan_accepted_at,
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
