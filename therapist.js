import {
  getMe, getPatients, isLoggedIn,
  getExercises, getPrescriptions, createPrescription,
  getConsultations, confirmConsultation, cancelConsultation,
  getPatientSessions, getPatientPainCheckins,
  requestSlackLinkCode,
} from "./api.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];

const TAB_TITLES = {
  overview: "Patient overview",
  patients: "All patients",
  programmes: "Programmes",
  consultations: "Consultations",
};

// In-memory caches populated on load; tabs render from these.
const state = { patients: [], consultations: [], exercises: [], prescriptions: [] };

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
    const [sessRaw, painRaw] = await Promise.all([
      getPatientSessions(patientId),
      getPatientPainCheckins(patientId),
    ]);
    const sessions = (Array.isArray(sessRaw) ? sessRaw : sessRaw.results ?? []);
    const pains    = (Array.isArray(painRaw) ? painRaw : painRaw.results ?? []);

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
      <div class="detail-section"><strong>Pain diary</strong>${painRows}</div>`;

    panel.querySelector("#detail-close")?.addEventListener("click", () => panel.classList.add("hidden"));
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">Could not load patient detail.</p>`;
    console.error("Patient detail failed:", err);
  }
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
      .filter(c => new Date(c.scheduled_at).getTime() >= now && ["requested", "confirmed"].includes(c.status))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 3);
    upcoming.innerHTML = next.length
      ? next.map(c => `
          <div class="detail-row">
            <span><strong>${escapeHtml(c.patient_name || "Patient")}</strong></span>
            <span>${new Date(c.scheduled_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
            <span class="consult-status consult-${c.status}">${c.status}</span>
          </div>`).join("")
      : `<p class="empty-state">No upcoming consultations.</p>`;
  }
}

// ── Programmes ──────────────────────────────────────────────

function renderProgrammes() {
  const patientSel  = document.getElementById("rx-patient");
  const exerciseSel = document.getElementById("rx-exercise");
  const list        = document.getElementById("rx-list");

  if (patientSel) {
    patientSel.innerHTML = state.patients.length
      ? state.patients.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("")
      : `<option value="">No linked patients yet</option>`;
  }
  if (exerciseSel) {
    const active = state.exercises.filter(e => e.is_active);
    exerciseSel.innerHTML = active.length
      ? active.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("")
      : `<option value="">No exercises available</option>`;
  }
  if (list) {
    const today = new Date().toISOString().slice(0, 10);
    const current = state.prescriptions.filter(p =>
      p.is_active && p.valid_from <= today && (!p.valid_until || p.valid_until >= today));
    list.innerHTML = current.length
      ? current.map(p => `
          <div class="detail-row">
            <span><strong>${escapeHtml(p.patient_name)}</strong></span>
            <span>${escapeHtml(p.exercise_name)}</span>
            <span>${p.sets}×${p.reps}</span>
            <span>${escapeHtml(p.days_per_week)}×/wk</span>
          </div>`).join("")
      : `<p class="empty-state">No active programmes yet.</p>`;
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
  // Whose turn it is to respond, for requested consultations.
  let waiting = "";
  if (c.status === "requested") {
    waiting = c.initiated_by === "patient"
      ? `<span class="consult-waiting">Patient proposed a time</span>`
      : `<span class="consult-waiting">Awaiting patient</span>`;
  }
  const actions = withActions ? `
    <span class="consult-actions">
      ${c.status === "requested" ? `<button class="button button-coral button-small" data-confirm="${c.id}">Confirm</button>` : ""}
      ${["requested", "confirmed"].includes(c.status) ? `<button class="button button-light button-small" data-cancel="${c.id}">Cancel</button>` : ""}
    </span>` : `<span class="consult-status consult-${c.status}">${c.status}</span>`;
  return `
    <div class="detail-row">
      <span><strong>${escapeHtml(c.patient_name || "Patient")}</strong>${waiting}</span>
      <span>${new Date(c.scheduled_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
      <span>${c.duration_minutes} min</span>
      ${actions}
    </div>`;
}

function renderConsultations() {
  const now = Date.now();
  const upcoming = state.consultations
    .filter(c => new Date(c.scheduled_at).getTime() >= now && ["requested", "confirmed"].includes(c.status))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const past = state.consultations.filter(c => !upcoming.includes(c));

  const up = document.getElementById("consult-upcoming");
  const pa = document.getElementById("consult-past");
  if (up) up.innerHTML = upcoming.length ? upcoming.map(c => consultRow(c, true)).join("") : `<p class="empty-state">No upcoming consultations.</p>`;
  if (pa) pa.innerHTML = past.length ? past.map(c => consultRow(c, false)).join("") : `<p class="empty-state">No past consultations.</p>`;
}

async function handleConsultAction(e) {
  const confirmId = e.target.getAttribute("data-confirm");
  const cancelId  = e.target.getAttribute("data-cancel");
  if (!confirmId && !cancelId) return;
  e.target.disabled = true;
  try {
    if (confirmId) await confirmConsultation(confirmId);
    if (cancelId)  await cancelConsultation(cancelId);
    state.consultations = await getConsultations().then(unwrap);
    renderConsultations();
    renderOverview(state.patients, state.consultations);
  } catch (err) {
    console.error("Consultation action failed:", err);
    e.target.disabled = false;
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
}

async function loadProgrammes() {
  try {
    if (!state.exercises.length) state.exercises = await getExercises().then(unwrap);
    state.prescriptions = await getPrescriptions().then(unwrap);
    renderProgrammes();
  } catch (err) {
    console.error("Programmes load failed:", err);
  }
}

function renderClinicianInfo(me) {
  const name = `${me.first_name} ${me.last_name}`.trim() || "Clinician";
  const nameEl   = document.getElementById("clinician-name");
  const avatarEl = document.getElementById("clinician-avatar");
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials(name);

  const btn    = document.getElementById("slack-connect-btn");
  const status = document.getElementById("slack-connect-status");
  if (btn && me.profile?.slack_linked) {
    btn.textContent = "Slack connected";
    btn.disabled = true;
    if (status) status.textContent = "✓ Your Slack account is linked.";
  }
}

async function connectSlack() {
  const btn    = document.getElementById("slack-connect-btn");
  const status = document.getElementById("slack-connect-status");
  if (!status) return;

  status.textContent = "Generating code…";
  if (btn) btn.disabled = true;
  try {
    const { code } = await requestSlackLinkCode();
    status.innerHTML =
      `In Slack, send:<br><code>@Physio Assistant link ${code}</code><br>` +
      `<small>Code expires in 10 minutes.</small>`;
  } catch (err) {
    status.textContent = err.message || "Could not generate a code.";
  } finally {
    if (btn) btn.disabled = false;
  }
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
    const [me, patientsData, consultData] = await Promise.all([
      getMe(), getPatients(), getConsultations().catch(() => []),
    ]);

    if (me.role !== "clinician") {
      document.getElementById("patient-table-body").innerHTML =
        `<p class="empty-state">Clinician access only.</p>`;
      return;
    }

    renderClinicianInfo(me);
    state.patients      = unwrap(patientsData);
    state.consultations = unwrap(consultData);

    renderStats(state.patients);
    renderOverview(state.patients, state.consultations);
    renderPatientTable(state.patients);
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

  if (e.target.closest("#slack-connect-btn")) { connectSlack(); return; }

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

document.getElementById("rx-form")?.addEventListener("submit", submitPrescription);

window.pvLoadDashboard = loadDashboard;
