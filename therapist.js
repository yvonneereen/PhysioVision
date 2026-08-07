import {
  getMe, getPatients, isLoggedIn,
  getExercises, getPrescriptions, createPrescription,
  getConsultations, updateConsultation, confirmConsultation, cancelConsultation, completeConsultation,
  getPatientSessions, getPatientPainCheckins,
  getCareMessages, sendCareMessage, getCareMessageThreads,
  sendAgentMessage,
  getTriageQueue, claimTriagePatient, declineTriagePatient,
} from "./api.js?v=31";
import { excludeRosterPatientsFromTriage } from "./therapist-triage-state.js?v=1";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];

const TAB_TITLES = {
  overview: "Patient overview",
  patients: "All patients",
  programmes: "Programmes",
  consultations: "Consultations",
  messaging: "Messaging",
  triage: "Triage queue",
};

// In-memory caches populated on load; tabs render from these.
const state = { patients: [], consultations: [], exercises: [], prescriptions: [], triage: [] };

function formatDate(d) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function relativeTime(isoString) {
  if (!isoString) return "Never";
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function trendIcon(trend) {
  if (trend === "improving") return { icon: "↗", cls: "trend-rising" };
  if (trend === "declining") return { icon: "⌁", cls: "trend-falling" };
  return { icon: "—", cls: "trend-flat" };
}

function painBadge(level) {
  if (level === null || level === undefined) return `<span class="pain-badge pain-none">—</span>`;
  const cls = level >= 7 ? "pain-high" : level >= 4 ? "pain-mid" : "pain-low";
  return `<span class="pain-badge ${cls}">${level}/10</span>`;
}

function painSafetyReview(checkin) {
  const safety = checkin?.safety_follow_up ?? {};
  if (!checkin?.requires_review && !safety.outcome) return "";
  const outcomeLabels = {
    urgent: "Urgent stop",
    professional: "Professional review",
    monitor: "Monitor",
  };
  const restLabels = {
    better: "improving after rest",
    same: "unchanged after rest",
    worse: "worse after rest",
    unsure: "change after rest unclear",
  };
  const movementLabels = {
    safe: "can move safely",
    nearby: "needs someone nearby",
    help: "needs help to move safely",
  };
  const painArea = [safety.pain_side, safety.pain_location]
    .filter(Boolean)
    .join(" ");
  const languageNotes = Array.isArray(safety.language_interpretations)
    ? safety.language_interpretations
      .map((item) => String(item?.summary || "").trim())
      .filter(Boolean)
      .slice(0, 2)
      .join("; ")
    : "";
  const details = [
    safety.exercise_name,
    painArea,
    restLabels[safety.rest_trend],
    movementLabels[safety.safe_movement],
    languageNotes ? `AI language interpretation: ${languageNotes}` : "",
  ].filter(Boolean);
  return `
    <span class="pain-review-summary">
      <strong>${escapeHtml(outcomeLabels[safety.outcome] || "Review requested")}</strong>
      <small>${escapeHtml(details.join(" · ") || "Safety follow-up recorded")}</small>
    </span>`;
}

function statusText(patient) {
  if (patient.open_escalations_count > 0) return { label: "Review now", cls: "status-pill-review" };
  if (patient.trend === "declining") return { label: "Monitor", cls: "status-pill-watch" };
  return { label: "On track", cls: "status-pill-good" };
}

function statusPill(patient) {
  const { label, cls } = statusText(patient);
  return `<button class="status-pill ${cls}" type="button">${label}</button>`;
}

function goalLabel(goal) {
  const labels = {
    stronger_knees: "Knee strength",
    better_balance: "Balance",
    less_stiffness: "Stiffness",
    stay_active: "Stay active",
    stronger_hips: "Hip strength",
    shoulder_mobility: "Shoulder mobility",
    ankle_mobility: "Ankle mobility",
    walking_confidence: "Walking confidence",
  };
  return labels[goal] || goal || "General";
}

const SPARK_TICKS = "▁▂▃▄▅▆▇█";
function sparkline(values, lo, hi) {
  const nums = values.filter(v => v !== null && v !== undefined && v !== "").map(Number);
  if (!nums.length) return "—";
  const span = (hi - lo) || 1;
  return nums.map(n => {
    const idx = Math.round((Math.max(lo, Math.min(hi, n)) - lo) / span * (SPARK_TICKS.length - 1));
    return SPARK_TICKS[idx];
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── Patients ────────────────────────────────────────────────

function renderPatientRow(patient) {
  const name       = patient.full_name || "Unknown";
  const age        = patient.age ? `${patient.age} · ` : "";
  const goal       = goalLabel(patient.goal);
  const ini        = initials(name);
  const programme  = patient.active_prescription
    ? `${patient.active_prescription.exercise_name} · ${patient.active_prescription.days_per_week}×/wk`
    : "No programme";
  const lastSess   = relativeTime(patient.last_session_at);
  const { icon, cls } = trendIcon(patient.trend);

  return `
    <div class="patient-row is-clickable" data-patient-id="${patient.id}">
      <span class="patient-name">
        <i class="avatar">${ini}</i>
        <span><strong>${escapeHtml(name)}</strong><small>${age}${goal}</small></span>
      </span>
      <span>${escapeHtml(programme)}</span>
      <span>${lastSess}</span>
      <span class="mini-trend ${cls}">${icon}</span>
      <span>${painBadge(patient.latest_pain_level)}</span>
      <span>${statusPill(patient)}</span>
    </div>`;
}

function renderStats(patients) {
  const total      = patients.length;
  const needReview = patients.filter(p => p.open_escalations_count > 0).length;
  const adherences = patients.map(p => p.adherence_pct).filter(v => v !== null);
  const avgAdh     = adherences.length
    ? Math.round(adherences.reduce((a, b) => a + b, 0) / adherences.length)
    : null;

  document.getElementById("stat-active-patients").textContent = total;
  document.getElementById("stat-active-sub").textContent      = `${total} under your care`;
  document.getElementById("stat-need-review").textContent     = needReview;
  document.getElementById("stat-review-sub").textContent      = needReview > 0
    ? `${needReview} open escalation${needReview > 1 ? "s" : ""}`
    : "All clear";
  document.getElementById("stat-adherence").textContent       = avgAdh !== null ? `${avgAdh}%` : "—";
  document.getElementById("stat-adherence-sub").textContent   = avgAdh !== null
    ? (avgAdh >= 80 ? "↑ On track" : "↓ Below target")
    : "No prescriptions yet";
}

function sortByPriority(patients) {
  return [...patients].sort((a, b) => {
    const score = p => (p.open_escalations_count > 0 ? 2 : 0) + (p.trend === "declining" ? 1 : 0);
    return score(b) - score(a);
  });
}

function renderPatientTable(patients) {
  const body = document.getElementById("patient-table-body");
  if (!body) return;
  const query = (document.getElementById("patient-search")?.value || "").toLowerCase();
  const filtered = patients.filter(p => (p.full_name || "").toLowerCase().includes(query));

  if (filtered.length === 0) {
    body.innerHTML = `<p class="empty-state">No patients ${query ? "match that search" : "assigned to your account yet"}.</p>`;
    return;
  }
  body.innerHTML = sortByPriority(filtered).map(renderPatientRow).join("");
}

async function showPatientDetail(patientId) {
  const patient = state.patients.find(p => String(p.id) === String(patientId));
  const panel = document.getElementById("patient-detail");
  if (!patient || !panel) return;

  panel.classList.remove("hidden");
  panel.innerHTML = `<p class="empty-state">Loading ${escapeHtml(patient.full_name)}…</p>`;

  try {
    const [sessRaw, painRaw, msgRaw] = await Promise.all([
      getPatientSessions(patientId),
      getPatientPainCheckins(patientId),
      getCareMessages(patientId).catch(() => []),
    ]);
    const sessions = (Array.isArray(sessRaw) ? sessRaw : sessRaw.results ?? []);
    const pains    = (Array.isArray(painRaw) ? painRaw : painRaw.results ?? []);
    const messages = (Array.isArray(msgRaw) ? msgRaw : msgRaw.results ?? []);

    const recent = [...sessions].reverse();       // oldest → newest
    const qSpark = sparkline(recent.map(s => s.quality_score), 0, 100);
    const pSpark = sparkline(recent.map(s => s.pain_level), 0, 10);
    const { label, cls } = statusText(patient);

    const sessionRows = sessions.slice(0, 8).map(s => `
      <div class="detail-row">
        <span>${escapeHtml(s.exercise_name || s.exercise || "Exercise")}</span>
        <span>${new Date(s.started_at).toLocaleDateString()}</span>
        <span>${s.reps_completed}/${s.reps_target} reps</span>
        <span>Q ${s.quality_score ?? "—"}</span>
        <span>${painBadge(s.pain_level)}</span>
      </div>`).join("") || `<p class="empty-state">No sessions logged.</p>`;

    const painRows = pains.slice(0, 5).map(p => `
      <div class="detail-row">
        <span>${new Date(p.checked_at).toLocaleDateString()}</span>
        <span>${painBadge(p.pain_level)}</span>
        <span>${escapeHtml(p.timing || "")}</span>
        <span>${escapeHtml(p.location_notes || "")}</span>
        ${painSafetyReview(p)}
      </div>`).join("") || `<p class="empty-state">No pain check-ins.</p>`;

    const rx = patient.active_prescription
      ? `${escapeHtml(patient.active_prescription.exercise_name)} — ${patient.active_prescription.sets}×${patient.active_prescription.reps}, ${escapeHtml(patient.active_prescription.days_per_week)}×/wk`
      : "No active programme";

    panel.innerHTML = `
      <div class="detail-head">
        <div>
          <h3>${escapeHtml(patient.full_name)}</h3>
          <p>${patient.age ? patient.age + " · " : ""}${goalLabel(patient.goal)} · ${escapeHtml(patient.care_path || "")}</p>
        </div>
        <div class="detail-head-right">
          <span class="status-pill ${cls}">${label}</span>
          <button class="button button-dark button-small" type="button" id="detail-close">Close</button>
        </div>
      </div>
      <div class="detail-metrics">
        <div><span>Quality trend</span><code>${qSpark}</code></div>
        <div><span>Pain trend</span><code>${pSpark}</code></div>
        <div><span>Adherence</span><strong>${patient.adherence_pct ?? "—"}%</strong></div>
        <div><span>Programme</span><small>${rx}</small></div>
      </div>
      <div class="detail-section"><strong>Recent sessions</strong>${sessionRows}</div>
      <div class="detail-section"><strong>Pain diary</strong>${painRows}</div>
      <div class="detail-section detail-messages">
        <strong>Messages</strong>
        <div class="detail-messages-thread" id="detail-messages-thread">${careMessageRows(messages)}</div>
        <form class="detail-messages-form" id="detail-messages-form">
          <textarea id="detail-messages-input" rows="2" maxlength="1000"
            placeholder="Reply to ${escapeHtml(patient.full_name)}…"></textarea>
          <button class="button button-coral button-small" type="submit">Send</button>
        </form>
      </div>`;

    panel.querySelector("#detail-close")?.addEventListener("click", () => panel.classList.add("hidden"));
    wireDetailMessaging(panel, patientId);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">Could not load patient detail.</p>`;
    console.error("Patient detail failed:", err);
  }
}

function careMessageRows(messages) {
  if (!messages.length) {
    return `<p class="empty-state">No messages yet.</p>`;
  }
  return messages.map(m => {
    const mine = m.sender === "clinician";
    const when = new Date(m.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    const who = mine ? "You" : escapeHtml(m.sender_name || "Patient");
    return `
      <div class="care-message ${mine ? "care-message-mine" : "care-message-theirs"}">
        <p class="care-message-body">${escapeHtml(m.body)}</p>
        <span class="care-message-meta">${who} · ${when}</span>
      </div>`;
  }).join("");
}

function wireDetailMessaging(panel, patientId) {
  const form = panel.querySelector("#detail-messages-form");
  const input = panel.querySelector("#detail-messages-input");
  const thread = panel.querySelector("#detail-messages-thread");
  if (!form || !input || !thread) return;
  thread.scrollTop = thread.scrollHeight;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    form.querySelector("button").disabled = true;
    try {
      await sendCareMessage(body, patientId);
      input.value = "";
      const data = await getCareMessages(patientId);
      thread.innerHTML = careMessageRows(Array.isArray(data) ? data : data.results ?? []);
      thread.scrollTop = thread.scrollHeight;
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      form.querySelector("button").disabled = false;
    }
  });
}

function consultationHasFutureSchedule(consultation, now = Date.now()) {
  if (!consultation?.scheduled_at) return false;
  const scheduledAt = new Date(consultation.scheduled_at).getTime();
  return Number.isFinite(scheduledAt) && scheduledAt >= now;
}

function isActiveConsultation(consultation, now = Date.now()) {
  if (!["requested", "confirmed"].includes(consultation?.status)) return false;
  if (consultation.status === "requested" && !consultation.scheduled_at) return true;
  return consultationHasFutureSchedule(consultation, now);
}

function consultationSort(a, b) {
  const aIsUnscheduled = !a.scheduled_at;
  const bIsUnscheduled = !b.scheduled_at;
  if (aIsUnscheduled !== bIsUnscheduled) return aIsUnscheduled ? -1 : 1;
  if (aIsUnscheduled) {
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  }
  return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
}

function consultationWhen(consultation) {
  if (!consultation.scheduled_at) return "Not scheduled yet";
  return new Date(consultation.scheduled_at).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function localDateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// ── Overview ────────────────────────────────────────────────

function renderOverview(patients, consultations) {
  const attention = document.getElementById("overview-attention");
  if (attention) {
    const flagged = sortByPriority(
      patients.filter(p => p.open_escalations_count > 0 || p.trend === "declining")
    ).slice(0, 5);
    attention.innerHTML = flagged.length
      ? flagged.map(p => {
          const reason = p.open_escalations_count > 0
            ? `${p.open_escalations_count} open escalation${p.open_escalations_count > 1 ? "s" : ""}`
            : "Declining trend";
          return `
            <div class="patient-row is-clickable" data-patient-id="${p.id}">
              <span class="patient-name"><i class="avatar">${initials(p.full_name || "?")}</i>
                <span><strong>${escapeHtml(p.full_name)}</strong><small>${reason}</small></span></span>
              <span>${painBadge(p.latest_pain_level)}</span>
              <span>${statusPill(p)}</span>
            </div>`;
        }).join("")
      : `<p class="empty-state">🎉 Everyone is on track.</p>`;
  }

  const upcoming = document.getElementById("overview-consultations");
  if (upcoming) {
    const now = Date.now();
    const next = consultations
      .filter(c => isActiveConsultation(c, now))
      .sort(consultationSort)
      .slice(0, 3);
    upcoming.innerHTML = next.length
      ? next.map(c => `
          <div class="detail-row">
            <span><strong>${escapeHtml(c.patient_name || "Patient")}</strong></span>
            <span>${consultationWhen(c)}</span>
            <span class="consult-status consult-${c.status}">${c.status}</span>
          </div>`).join("")
      : `<p class="empty-state">No upcoming consultations.</p>`;
  }
}

// ── Programmes ──────────────────────────────────────────────

function renderProgrammes() {
  const patientSel  = document.getElementById("rx-patient");
  const exerciseSel = document.getElementById("rx-exercise");
  const filterPatientSel = document.getElementById("rx-filter-patient");
  const filterStatusSel = document.getElementById("rx-filter-status");
  const filterCompletionSel = document.getElementById("rx-filter-completion");
  const list        = document.getElementById("rx-list");

  if (patientSel) {
    patientSel.innerHTML = state.patients.length
      ? state.patients.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("")
      : `<option value="">No linked patients yet</option>`;
  }
  if (exerciseSel) {
    const active = state.exercises.filter(e => e.is_active);
    exerciseSel.disabled = active.length === 0;
    exerciseSel.innerHTML = active.length
      ? active.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("")
      : `<option value="">Exercise catalogue is not ready</option>`;
  }
  if (filterPatientSel) {
    const selectedPatient = filterPatientSel.value || "all";
    filterPatientSel.innerHTML = `
      <option value="all">All patients</option>
      ${state.patients.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("")}`;
    filterPatientSel.value = [...filterPatientSel.options].some(option => option.value === selectedPatient)
      ? selectedPatient
      : "all";
  }
  if (list) {
    const today = new Date().toISOString().slice(0, 10);
    const patientFilter = filterPatientSel?.value || "all";
    const statusFilter = filterStatusSel?.value || "all";
    const completionFilter = filterCompletionSel?.value || "all";
    const withStatus = state.prescriptions.map(p => ({
      ...p,
      programmeStatus: p.is_active && (!p.valid_until || p.valid_until >= today)
        ? "active"
        : "ended",
      completionStatus: p.exercise_completed ? "completed" : "not-completed",
    }));
    const filtered = withStatus.filter(p =>
      (patientFilter === "all" || String(p.patient) === patientFilter)
      && (statusFilter === "all" || p.programmeStatus === statusFilter)
      && (completionFilter === "all" || p.completionStatus === completionFilter));
    list.innerHTML = filtered.length
      ? filtered.map(p => `
          <div class="detail-row programme-row">
            <span><strong>${escapeHtml(p.patient_name)}</strong></span>
            <span>${escapeHtml(p.exercise_name)}</span>
            <span>${p.sets}×${p.reps}</span>
            <span>${escapeHtml(p.days_per_week)}×/wk</span>
            <span class="programme-status programme-status-${p.programmeStatus}">${p.programmeStatus}</span>
            <span class="programme-status programme-status-${p.completionStatus}">${p.exercise_completed ? "Completed" : "Not completed"}</span>
          </div>`).join("")
      : `<p class="empty-state">No programmes match these filters.</p>`;
  }
}

async function submitPrescription(e) {
  e.preventDefault();
  const status = document.getElementById("rx-status");
  const patient  = document.getElementById("rx-patient").value;
  const exercise = document.getElementById("rx-exercise").value;
  if (!patient || !exercise) { if (status) status.textContent = "Select a patient and exercise."; return; }

  if (status) status.textContent = "Assigning…";
  try {
    await createPrescription({
      patient,
      exercise,
      sets: Number(document.getElementById("rx-sets").value),
      reps: Number(document.getElementById("rx-reps").value),
      days_per_week: document.getElementById("rx-days").value.trim(),
      valid_from: new Date().toISOString().slice(0, 10),
    });
    if (status) status.textContent = "Programme assigned ✓";
    // Refresh prescriptions + patients (adherence/programme change).
    [state.prescriptions, state.patients] = await Promise.all([
      getPrescriptions().then(unwrap),
      getPatients().then(unwrap),
    ]);
    renderProgrammes();
    renderPatientTable(state.patients);
  } catch (err) {
    if (status) status.textContent = err.message || "Could not assign programme.";
  }
}

// ── Consultations ───────────────────────────────────────────

function consultRow(c, withActions) {
  let waiting = "";
  if (c.status === "requested") {
    if (!c.scheduled_at) {
      waiting = `<span class="consult-waiting">Patient requested a consultation</span>`;
    } else {
      waiting = c.initiated_by === "patient"
        ? `<span class="consult-waiting">Patient proposed a time</span>`
        : `<span class="consult-waiting">Awaiting patient</span>`;
    }
  }
  const canSchedule = withActions && c.status === "requested" && !c.scheduled_at;
  const canConfirmLegacy = c.status === "requested"
    && c.initiated_by === "patient"
    && Boolean(c.scheduled_at);
  const canResolve = c.status === "confirmed";
  const actions = withActions ? `
    <span class="consult-actions">
      ${canConfirmLegacy ? `<button class="button button-coral button-small" data-confirm="${c.id}">Confirm</button>` : ""}
      ${canResolve ? `<button class="button button-small button-resolve" data-complete="${c.id}">Resolve</button>` : ""}
      ${["requested", "confirmed"].includes(c.status) ? `<button class="button button-light button-small" data-cancel="${c.id}">Cancel</button>` : ""}
    </span>` : `<span class="consult-status consult-${c.status}">${c.status}</span>`;
  const scheduler = canSchedule ? `
    <form class="consultation-schedule-form" data-schedule-form="${c.id}">
      <label>
        <span>Date</span>
        <input name="date" type="date" min="${localDateInputValue()}" required />
      </label>
      <label>
        <span>Time</span>
        <input name="time" type="time" required />
      </label>
      <label>
        <span>Duration</span>
        <select name="duration">
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">60 minutes</option>
        </select>
      </label>
      <button class="button button-coral button-small" type="button" data-schedule="${c.id}">
        Send proposed time
      </button>
      <p class="consultation-schedule-status" data-schedule-status="${c.id}" role="status"></p>
    </form>` : "";
  return `
    <div class="consultation-entry">
      <div class="detail-row">
        <span><strong>${escapeHtml(c.patient_name || "Patient")}</strong>${waiting}</span>
        <span>${consultationWhen(c)}</span>
        <span>${c.scheduled_at ? `${c.duration_minutes} min` : "Set when scheduling"}</span>
        ${actions}
      </div>
      ${scheduler}
    </div>`;
}

function renderConsultations() {
  const now = Date.now();
  const upcoming = state.consultations
    .filter(c => isActiveConsultation(c, now))
    .sort(consultationSort);
  const past = state.consultations.filter(c => !upcoming.includes(c));

  const up = document.getElementById("consult-upcoming");
  const pa = document.getElementById("consult-past");
  if (up) up.innerHTML = upcoming.length ? upcoming.map(c => consultRow(c, true)).join("") : `<p class="empty-state">No upcoming consultations.</p>`;
  if (pa) pa.innerHTML = past.length ? past.map(c => consultRow(c, false)).join("") : `<p class="empty-state">No past consultations.</p>`;
}

async function handleConsultAction(e) {
  const scheduleButton = e.target.closest("[data-schedule]");
  const confirmButton = e.target.closest("[data-confirm]");
  const cancelButton = e.target.closest("[data-cancel]");
  const completeButton = e.target.closest("[data-complete]");
  const actionButton = scheduleButton || confirmButton || cancelButton || completeButton;
  if (!actionButton) return;

  const scheduleId = scheduleButton?.getAttribute("data-schedule");
  const confirmId = confirmButton?.getAttribute("data-confirm");
  const cancelId = cancelButton?.getAttribute("data-cancel");
  const completeId = completeButton?.getAttribute("data-complete");
  actionButton.disabled = true;
  try {
    if (scheduleId) {
      const form = document.querySelector(`[data-schedule-form="${CSS.escape(scheduleId)}"]`);
      const status = form?.querySelector(`[data-schedule-status="${CSS.escape(scheduleId)}"]`);
      if (!form?.reportValidity()) {
        actionButton.disabled = false;
        return;
      }
      const data = new FormData(form);
      const scheduledAt = new Date(`${data.get("date")}T${data.get("time")}`);
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
        if (status) status.textContent = "Choose a future date and time.";
        actionButton.disabled = false;
        return;
      }
      if (status) status.textContent = "Sending proposed time…";
      await updateConsultation(scheduleId, {
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: Number(data.get("duration")),
      });
    }
    if (confirmId)  await confirmConsultation(confirmId);
    if (cancelId)   await cancelConsultation(cancelId);
    if (completeId) await completeConsultation(completeId);
    state.consultations = await getConsultations().then(unwrap);
    renderConsultations();
    renderOverview(state.patients, state.consultations);
  } catch (err) {
    console.error("Consultation action failed:", err);
    if (scheduleId) {
      const status = document.querySelector(`[data-schedule-status="${CSS.escape(scheduleId)}"]`);
      if (status) status.textContent = err.message || "Could not send the proposed time.";
    }
    actionButton.disabled = false;
  }
}

// ── Tabs & load ─────────────────────────────────────────────

function unwrap(data) {
  return Array.isArray(data) ? data : (data.results ?? []);
}

function switchTab(tab) {
  document.querySelectorAll("[data-tab]").forEach(b =>
    b.classList.toggle("active", b.getAttribute("data-tab") === tab));
  document.querySelectorAll("[data-panel]").forEach(p =>
    p.classList.toggle("hidden", p.getAttribute("data-panel") !== tab));
  const title = document.getElementById("therapist-title");
  if (title) title.textContent = TAB_TITLES[tab] || "Dashboard";

  if (tab === "programmes") loadProgrammes();
  if (tab === "consultations") renderConsultations();
  if (tab === "messaging") loadMessaging();
  if (tab === "triage") loadTriage();
}

function renderTriage() {
  const list = document.getElementById("triage-list");
  const badge = document.getElementById("triage-badge");
  if (badge) {
    badge.textContent = state.triage.length;
    badge.hidden = state.triage.length === 0;
  }
  if (!list) return;
  if (!state.triage.length) {
    list.innerHTML = `<div class="triage-empty"><span aria-hidden="true">✓</span><strong>Queue clear</strong><p>No patients are waiting to be linked.</p></div>`;
    return;
  }
  list.innerHTML = state.triage.map(patient => {
    const profileLabel = value => String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, letter => letter.toUpperCase());
    const goal = patient.custom_goal || goalLabel(patient.goal) || "Not provided";
    const requested = patient.requested_at
      ? new Date(patient.requested_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : "Recently";
    return `
      <article class="triage-card">
        <div class="triage-card-main">
          <div class="triage-avatar" aria-hidden="true">${escapeHtml(initials(patient.name))}</div>
          <div>
            <div class="triage-card-title"><strong>${escapeHtml(patient.name)}</strong><span>Awaiting clinician</span></div>
            <p>Goal: ${escapeHtml(goal)}</p>
            <div class="triage-meta">
              ${patient.mobility_status ? `<span>Mobility: ${escapeHtml(profileLabel(patient.mobility_status))}</span>` : ""}
              ${patient.activity_level ? `<span>Activity: ${escapeHtml(profileLabel(patient.activity_level))}</span>` : ""}
              ${patient.focus_side ? `<span>Focus: ${escapeHtml(profileLabel(patient.focus_side))}</span>` : ""}
            </div>
            <small>Requested ${requested}</small>
          </div>
        </div>
        <div class="triage-card-actions">
          <div class="triage-action-buttons">
            <button class="button button-light button-small" type="button" data-triage-decline="${patient.id}">Decline request</button>
            <button class="button button-coral button-small" type="button" data-triage-claim="${patient.id}">Claim patient</button>
          </div>
          <p class="triage-card-error" data-triage-error hidden></p>
        </div>
      </article>`;
  }).join("");
}

async function loadTriage() {
  const list = document.getElementById("triage-list");
  if (list) list.innerHTML = `<p class="empty-state">Loading triage queue…</p>`;
  try {
    const [triageData, patientsData] = await Promise.all([
      getTriageQueue(),
      getPatients().catch(() => state.patients),
    ]);
    state.patients = unwrap(patientsData);
    state.triage = excludeRosterPatientsFromTriage(
      unwrap(triageData),
      state.patients,
    );
    renderTriage();
  } catch (error) {
    console.error("Triage load failed:", error);
    if (list) list.innerHTML = `<p class="empty-state">Could not load the triage queue.</p>`;
  }
}

async function claimTriageRequest(button) {
  const patientId = button.getAttribute("data-triage-claim");
  const errorMessage = button.closest(".triage-card")?.querySelector("[data-triage-error]");
  if (errorMessage) {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
  }
  button.disabled = true;
  button.textContent = "Claiming…";
  try {
    await claimTriagePatient(patientId);
    state.triage = state.triage.filter(patient => String(patient.id) !== String(patientId));
    state.patients = await getPatients().then(unwrap);
    renderTriage();
    renderPatientTable(state.patients);
    renderStats(state.patients);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Claim patient";
    if (errorMessage) {
      errorMessage.textContent = error.message || "Could not claim this patient.";
      errorMessage.hidden = false;
    }
  }
}

async function declineTriageRequest(button) {
  const patientId = button.getAttribute("data-triage-decline");
  const card = button.closest(".triage-card");
  const patient = state.triage.find(item => String(item.id) === String(patientId));
  const patientName = patient?.name || "this patient";
  const nextStep = patient?.request_kind === "wellness_self_referral"
    ? "Their existing wellness plan will remain available, and they may request support again later."
    : "They will return to pathway selection and may request support again later.";
  const confirmed = window.confirm(
    `Decline the physiotherapist request from ${patientName}?\n\n` +
    `They will not be added to your roster. ${nextStep}`
  );
  if (!confirmed) return;

  const errorMessage = card?.querySelector("[data-triage-error]");
  const actionButtons = [...(card?.querySelectorAll("[data-triage-claim], [data-triage-decline]") || [])];
  if (errorMessage) {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
  }
  actionButtons.forEach(action => { action.disabled = true; });
  button.textContent = "Declining…";

  try {
    await declineTriagePatient(patientId);
    state.triage = state.triage.filter(item => String(item.id) !== String(patientId));
    renderTriage();
  } catch (error) {
    actionButtons.forEach(action => { action.disabled = false; });
    button.textContent = "Decline request";
    if (errorMessage) {
      errorMessage.textContent = error.message || "Could not decline this request.";
      errorMessage.hidden = false;
    }
  }
}

// ── Messaging inbox ─────────────────────────────────────────

let activeConversation = null;
const AI_CONVERSATION_ID = "physiovision-ai";
const aiConversationMessages = [{
  sender: "assistant",
  body: "Hello. I’m your PhysioVision AI workspace. I can review your roster, look up patient progress, prepare drafts and run clinician-approved actions. Type “help” for every command; clinical decisions remain yours.",
}];

async function loadMessaging() {
  const list = document.getElementById("messaging-list");
  renderMessagingList([]);
  try {
    const threads = await getCareMessageThreads();
    const rows = Array.isArray(threads) ? threads : threads.results ?? [];
    renderMessagingList(rows);
    updateMessagingBadge(rows);
  } catch (err) {
    console.error("Messaging load failed:", err);
    if (list) list.insertAdjacentHTML(
      "beforeend",
      `<p class="messaging-list-empty">Could not load patient conversations.</p>`,
    );
  }
}

function updateMessagingBadge(threads) {
  const total = threads.reduce((sum, t) => sum + (t.unread || 0), 0);
  const badge = document.getElementById("messaging-badge");
  if (!badge) return;
  badge.textContent = total;
  badge.hidden = total === 0;
}

function renderMessagingList(threads) {
  const list = document.getElementById("messaging-list");
  if (!list) return;
  const aiActive = activeConversation === AI_CONVERSATION_ID ? " is-active" : "";
  const assistant = `
    <button type="button" class="conversation-item conversation-item-ai${aiActive}" data-ai-conversation>
      <span class="conversation-top">
        <span class="conversation-ai-title"><span class="conversation-ai-mark" aria-hidden="true">✦</span><strong>PhysioVision AI</strong></span>
        <span class="conversation-pinned">Pinned</span>
      </span>
      <span class="conversation-preview">Clinical thinking and drafting workspace</span>
    </button>`;
  const patientThreads = threads.map(t => {
    const preview = t.last_sender === "clinician" ? `You: ${t.last_body}` : t.last_body;
    const when = new Date(t.last_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    const unread = t.unread ? `<span class="conversation-unread">${t.unread}</span>` : "";
    const active = activeConversation === t.patient ? " is-active" : "";
    return `
      <button type="button" class="conversation-item${active}" data-conversation="${t.patient}">
        <span class="conversation-top">
          <strong>${escapeHtml(t.patient_name)}</strong>${unread}
        </span>
        <span class="conversation-preview">${escapeHtml(preview)}</span>
        <span class="conversation-when">${when}</span>
      </button>`;
  }).join("");
  const empty = threads.length
    ? ""
    : `<p class="messaging-list-empty">No patient messages yet.</p>`;
  list.innerHTML = assistant + empty + patientThreads;
}

function aiMessageRows() {
  const helpContent = `
    <div class="clinical-ai-help">
      <section><h4>Your roster</h4>
        <button type="button" data-ai-prompt="my patients"><code>my patients</code><span>Roster overview</span></button>
        <button type="button" data-ai-prompt="who needs review"><code>who needs review</code><span>Open escalations</span></button>
        <button type="button" data-ai-prompt="resolve Sarah"><code>resolve [name]</code><span>Clear a patient’s escalations</span></button>
        <button type="button" data-ai-prompt="today"><code>today</code><span>Consultations and new flags</span></button>
      </section>
      <section><h4>Patient lookups</h4>
        <button type="button" data-ai-prompt="show Sarah progress"><code>show [name] progress</code><span>Progress summary</span></button>
        <button type="button" data-ai-prompt="pain Sarah"><code>pain [name]</code><span>Recent pain history</span></button>
        <button type="button" data-ai-prompt="adherence Sarah"><code>adherence [name]</code><span>Programme adherence</span></button>
        <button type="button" data-ai-prompt="sessions Sarah"><code>sessions [name]</code><span>Recent exercise sessions</span></button>
      </section>
      <section><h4>Drafting and scheduling</h4>
        <button type="button" data-ai-prompt="draft note for Sarah"><code>draft note for [name]</code><span>Clinical note from latest session</span></button>
        <button type="button" data-ai-prompt="draft message for Sarah"><code>draft message for [name]</code><span>Encouraging patient message</span></button>
        <button type="button" data-ai-prompt="book Sarah Thursday 3pm"><code>book [name] [when]</code><span>Request a consultation</span></button>
      </section>
      <section><h4>Actions</h4>
        <button type="button" data-ai-prompt="send message to Sarah"><code>send message to [name]</code><span>Email an encouragement</span></button>
        <button type="button" data-ai-prompt="confirm Sarah"><code>confirm [name]</code><span>Confirm a consultation</span></button>
        <button type="button" data-ai-prompt="assign Half Squats to Sarah"><code>assign [exercise] to [name]</code><span>Prescribe one exercise</span></button>
      </section>
      <section><h4>AI programme builder</h4>
        <button type="button" data-ai-prompt="build a plan for Sarah"><code>build a plan for [name]</code><span>Draft a programme</span></button>
        <button type="button" data-ai-prompt="revise Sarah reduce the intensity"><code>revise [name] [change]</code><span>Refine the draft</span></button>
        <button type="button" data-ai-prompt="accept plan for Sarah"><code>accept plan for [name]</code><span>Create prescriptions</span></button>
        <button type="button" data-ai-prompt="summary"><code>summary</code><span>Whole-roster overview</span></button>
      </section>
    </div>`;
  const planContent = (plan) => {
    const exercises = Array.isArray(plan?.exercises) ? plan.exercises : [];
    return `
      <article class="clinical-plan-card">
        <header>
          <div><span>AI programme draft</span><h4>${escapeHtml(plan.patient_name || "Patient")}</h4></div>
          <span class="clinical-plan-draft-badge">Draft</span>
        </header>
        ${plan.clinical_context ? `
          <div class="clinical-plan-context">
            <strong>Clinical context considered</strong>
            <p>${escapeHtml(plan.clinical_context)}</p>
          </div>` : ""}
        ${plan.summary ? `<p class="clinical-plan-summary">${escapeHtml(plan.summary)}</p>` : ""}
        <div class="clinical-plan-exercises">
          <div class="clinical-plan-row clinical-plan-row-head"><span>Exercise</span><span>Dose</span><span>Frequency</span></div>
          ${exercises.map(exercise => `
            <div class="clinical-plan-row${exercise.available ? "" : " is-unavailable"}">
              <strong>${escapeHtml(exercise.name)}</strong>
              <span>${escapeHtml(exercise.sets ?? "—")} × ${escapeHtml(exercise.reps ?? "—")}</span>
              <span>${escapeHtml(exercise.days_per_week ?? "—")}×/week</span>
            </div>`).join("")}
        </div>
        <footer>
          <button type="button" class="button button-light button-small" data-ai-fill="revise ${escapeHtml(plan.patient_first_name || "patient")} ">Revise draft</button>
          <button type="button" class="button button-coral button-small" data-ai-fill="accept plan for ${escapeHtml(plan.patient_first_name || "patient")}">Review and accept</button>
        </footer>
      </article>`;
  };
  return aiConversationMessages.map(message => `
    <div class="clinical-ai-message clinical-ai-message-${message.sender}">
      <span>${message.sender === "assistant" ? "PhysioVision AI" : "You"}</span>
      ${message.command === "help"
        ? helpContent
        : ["build_plan", "revise_plan"].includes(message.command) && message.data
          ? planContent(message.data)
          : `<p>${escapeHtml(message.body)}</p>`}
    </div>`).join("");
}

function showClinicalAssistant() {
  activeConversation = AI_CONVERSATION_ID;
  document.querySelectorAll(".conversation-item").forEach(el =>
    el.classList.toggle("is-active", el.hasAttribute("data-ai-conversation")));
  const panel = document.getElementById("messaging-conversation");
  if (!panel) return;
  panel.innerHTML = `
    <div class="conversation-head clinical-ai-head">
      <div><strong>PhysioVision AI</strong><span>Private assistant workspace · not visible to patients</span></div>
      <span class="clinical-ai-label">AI assistant</span>
    </div>
    <div class="clinical-ai-notice">
      AI can make mistakes. Verify its output against patient records and use your clinical judgement.
    </div>
    <div class="clinical-ai-prompts" aria-label="Suggested assistant commands">
      <button type="button" data-ai-prompt="my patients">My patients</button>
      <button type="button" data-ai-prompt="who needs review">Needs review</button>
      <button type="button" data-ai-prompt="today">Today</button>
      <button type="button" data-ai-prompt="help">All commands</button>
    </div>
    <div class="clinical-ai-thread" id="clinical-ai-thread" role="log" aria-live="polite">${aiMessageRows()}</div>
    <p class="clinical-ai-status" id="clinical-ai-status" role="status"></p>
    <form class="detail-messages-form clinical-ai-form" id="clinical-ai-form">
      <textarea id="clinical-ai-input" rows="2" maxlength="2000" placeholder="Ask the assistant…" required></textarea>
      <button class="button button-coral button-small" type="submit">Send</button>
    </form>`;
  const thread = panel.querySelector("#clinical-ai-thread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  panel.querySelector("#clinical-ai-form")?.addEventListener("submit", handleClinicalAssistantMessage);
}

async function handleClinicalAssistantMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector("#clinical-ai-input");
  const button = form.querySelector("button");
  const status = document.getElementById("clinical-ai-status");
  const message = input.value.trim();
  if (!message) return;
  aiConversationMessages.push({ sender: "user", body: message });
  input.value = "";
  button.disabled = true;
  if (status) status.textContent = "PhysioVision AI is thinking…";
  const thread = document.getElementById("clinical-ai-thread");
  if (thread) {
    thread.innerHTML = aiMessageRows();
    thread.scrollTop = thread.scrollHeight;
  }
  try {
    const result = await sendAgentMessage(message);
    aiConversationMessages.push({
      sender: "assistant",
      body: result.reply,
      command: result.command || null,
      data: result.data || null,
    });
  } catch (error) {
    aiConversationMessages.push({ sender: "error", body: error.message || "The assistant is unavailable." });
  } finally {
    if (activeConversation === AI_CONVERSATION_ID) showClinicalAssistant();
  }
}

async function openConversation(patientId) {
  activeConversation = patientId;
  document.querySelectorAll(".conversation-item").forEach(el =>
    el.classList.toggle("is-active", el.getAttribute("data-conversation") === String(patientId)));
  const panel = document.getElementById("messaging-conversation");
  if (!panel) return;
  panel.innerHTML = `<p class="empty-state">Loading…</p>`;
  try {
    const data = await getCareMessages(patientId);
    const messages = Array.isArray(data) ? data : data.results ?? [];
    const rosterName = state.patients.find(p => String(p.id) === String(patientId))?.full_name;
    const name = rosterName
      || (messages[0]?.sender === "patient" ? messages[0].sender_name : "Patient");
    const emptyThread = `<p class="empty-state">No messages yet — say hello.</p>`;
    panel.innerHTML = `
      <div class="conversation-head"><strong>${escapeHtml(name)}</strong></div>
      <div class="detail-messages-thread" id="conversation-thread">${messages.length ? careMessageRows(messages) : emptyThread}</div>
      <form class="detail-messages-form" id="conversation-form">
        <textarea id="conversation-input" rows="2" maxlength="1000" placeholder="Write a reply…"></textarea>
        <button class="button button-coral button-small" type="submit">Send</button>
      </form>`;
    const thread = panel.querySelector("#conversation-thread");
    if (thread) thread.scrollTop = thread.scrollHeight;
    panel.querySelector("#conversation-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = panel.querySelector("#conversation-input");
      const body = input.value.trim();
      if (!body) return;
      e.target.querySelector("button").disabled = true;
      try {
        await sendCareMessage(body, patientId);
        input.value = "";
        await openConversation(patientId);
        loadMessaging();
      } catch (err) {
        console.error("Reply failed:", err);
        e.target.querySelector("button").disabled = false;
      }
    });
    loadMessaging();  // refresh unread counts now this thread is read
  } catch (err) {
    console.error("Conversation load failed:", err);
    panel.innerHTML = `<p class="empty-state">Could not load this conversation.</p>`;
  }
}

// Physio-initiated conversation: pick any roster patient to start a thread.
function showNewConversationPicker() {
  activeConversation = null;
  document.querySelectorAll(".conversation-item.is-active")
    .forEach(el => el.classList.remove("is-active"));
  const panel = document.getElementById("messaging-conversation");
  if (!panel) return;
  if (!state.patients.length) {
    panel.innerHTML = `<p class="empty-state">No patients in your roster yet.</p>`;
    return;
  }
  panel.innerHTML = `
    <div class="conversation-head"><strong>New message</strong><span>Choose a patient to message</span></div>
    <div class="new-conversation-list">
      ${state.patients.map(p => `
        <button type="button" class="conversation-item" data-new-conversation="${p.id}">
          <span class="conversation-top"><strong>${escapeHtml(p.full_name || "Patient")}</strong></span>
          <span class="conversation-preview">${escapeHtml(goalLabel(p.goal))}</span>
        </button>`).join("")}
    </div>`;
}

async function loadProgrammes() {
  const exerciseSelect = document.getElementById("rx-exercise");
  try {
    if (!state.exercises.length) state.exercises = await getExercises().then(unwrap);
    state.prescriptions = await getPrescriptions().then(unwrap);
    renderProgrammes();
  } catch (err) {
    console.error("Programmes load failed:", err);
    if (exerciseSelect) {
      exerciseSelect.innerHTML = `<option value="">Could not load exercises</option>`;
      exerciseSelect.disabled = true;
    }
    const status = document.getElementById("rx-status");
    if (status) status.textContent = "The exercise catalogue could not be loaded. Refresh and try again.";
  }
}

function renderClinicianInfo(me) {
  const name = `${me.first_name} ${me.last_name}`.trim() || "Clinician";
  const nameEl   = document.getElementById("clinician-name");
  const avatarEl = document.getElementById("clinician-avatar");
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials(name);
  const floatingAiLauncher = document.getElementById("agentChatLauncher");
  const floatingAiPanel = document.getElementById("agentChatPanel");
  if (floatingAiLauncher) floatingAiLauncher.hidden = true;
  if (floatingAiPanel) floatingAiPanel.hidden = true;

}

function setLoading(on) {
  document.querySelector(".therapist-content")?.classList.toggle("is-loading", on);
}

async function loadDashboard() {
  if (!isLoggedIn()) return;

  const dateEl = document.getElementById("dashboard-date");
  if (dateEl) dateEl.textContent = formatDate(new Date());

  setLoading(true);
  try {
    const [me, patientsData, consultData, triageData] = await Promise.all([
      getMe(), getPatients(), getConsultations().catch(() => []), getTriageQueue().catch(() => []),
    ]);

    if (me.role !== "clinician") {
      document.getElementById("patient-table-body").innerHTML =
        `<p class="empty-state">Clinician access only.</p>`;
      return;
    }

    renderClinicianInfo(me);
    state.patients      = unwrap(patientsData);
    state.consultations = unwrap(consultData);
    state.triage        = excludeRosterPatientsFromTriage(
      unwrap(triageData),
      state.patients,
    );

    renderStats(state.patients);
    renderOverview(state.patients, state.consultations);
    renderPatientTable(state.patients);
    renderTriage();
    // Surface the unread-messages badge without opening the tab.
    getCareMessageThreads()
      .then(t => updateMessagingBadge(Array.isArray(t) ? t : t.results ?? []))
      .catch(() => {});
  } catch (err) {
    const body = document.getElementById("patient-table-body");
    if (body) body.innerHTML = `<p class="empty-state">Could not load patients. Please try again.</p>`;
    console.error("Dashboard load failed:", err);
  } finally {
    setLoading(false);
  }
}

// ── Event wiring (delegated; elements live inside the modal) ──

document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { switchTab(tabBtn.getAttribute("data-tab")); return; }

  if (e.target.closest("#messaging-new")) {
    showNewConversationPicker();
    return;
  }

  if (e.target.closest("#triage-refresh")) {
    loadTriage();
    return;
  }

  const triageClaim = e.target.closest("[data-triage-claim]");
  if (triageClaim) {
    claimTriageRequest(triageClaim);
    return;
  }

  const triageDecline = e.target.closest("[data-triage-decline]");
  if (triageDecline) {
    declineTriageRequest(triageDecline);
    return;
  }

  if (e.target.closest("[data-ai-conversation]")) {
    showClinicalAssistant();
    return;
  }

  const aiPrompt = e.target.closest("[data-ai-prompt]");
  if (aiPrompt) {
    const input = document.getElementById("clinical-ai-input");
    if (input) {
      input.value = aiPrompt.getAttribute("data-ai-prompt");
      if (aiPrompt.closest(".clinical-ai-help")) {
        input.focus();
      } else {
        input.form?.requestSubmit();
      }
    }
    return;
  }

  const aiFill = e.target.closest("[data-ai-fill]");
  if (aiFill) {
    const input = document.getElementById("clinical-ai-input");
    if (input) {
      input.value = aiFill.getAttribute("data-ai-fill");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    return;
  }

  const newConversation = e.target.closest("[data-new-conversation]");
  if (newConversation) {
    openConversation(newConversation.getAttribute("data-new-conversation"));
    return;
  }

  const conversation = e.target.closest("[data-conversation]");
  if (conversation) {
    openConversation(conversation.getAttribute("data-conversation"));
    return;
  }

  const row = e.target.closest("[data-patient-id]");
  if (row && !e.target.closest(".status-pill")) {
    const inOverview = row.closest('[data-panel="overview"]');
    if (inOverview) switchTab("patients");
    showPatientDetail(row.getAttribute("data-patient-id"));
    return;
  }

  handleConsultAction(e);
});

document.addEventListener("input", (e) => {
  if (e.target.id === "patient-search") renderPatientTable(state.patients);
});

document.addEventListener("change", (e) => {
  if (["rx-filter-patient", "rx-filter-status", "rx-filter-completion"].includes(e.target.id)) {
    renderProgrammes();
  }
});

document.getElementById("rx-form")?.addEventListener("submit", submitPrescription);

window.pvLoadDashboard = loadDashboard;
