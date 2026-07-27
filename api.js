// Central API client — all backend calls go through here.
// The token is limited to this browser tab/session and is not persisted on disk.

const runtimeWindow = typeof window === "undefined" ? {} : window;
const runtimeHostname = runtimeWindow.location?.hostname ?? "localhost";
const BASE = runtimeWindow.PHYSIOVISION_API_BASE ?? (
  ["localhost", "127.0.0.1"].includes(runtimeHostname)
    ? "http://localhost:8000/api"
    : "/api"
);
const TOKEN_KEY = "physiovision.token";

function getToken() {
  return runtimeWindow.sessionStorage?.getItem(TOKEN_KEY) ?? null;
}

function setToken(token) {
  runtimeWindow.sessionStorage?.setItem(TOKEN_KEY, token);
}

function clearToken() {
  runtimeWindow.sessionStorage?.removeItem(TOKEN_KEY);
  // Remove tokens created by older versions of the site.
  runtimeWindow.localStorage?.removeItem(TOKEN_KEY);
}

runtimeWindow.localStorage?.removeItem(TOKEN_KEY);

export function isLoggedIn() {
  return Boolean(getToken());
}

async function request(method, path, body, { skipAuth = false } = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token && !skipAuth) headers["Authorization"] = `Token ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const fieldError = Object.entries(err).find(
      ([key, value]) => key !== "detail" && Array.isArray(value) && value.length
    );
    const fieldMessage = fieldError
      ? `${fieldError[0].replaceAll("_", " ")}: ${fieldError[1][0]}`
      : "";
    const productionApiMissing = (
      res.status === 404
      && !runtimeWindow.PHYSIOVISION_API_BASE
      && !["localhost", "127.0.0.1"].includes(runtimeHostname)
    );
    const message = productionApiMissing
      ? "The online account service has not been connected yet."
      : err.detail || fieldMessage || `Request failed (${res.status}).`;

    throw Object.assign(new Error(message), {
      status: res.status,
      data: err,
    });
  }

  return res.status === 204 ? null : res.json();
}

// ── Auth ──────────────────────────────────────────────────────

export async function register({ email, password, firstName, lastName, role = "patient", ...profileFields }) {
  return request("POST", "/auth/register/", {
    email, password,
    first_name: firstName,
    last_name: lastName,
    role,
    ...profileFields,
  });
}

export async function login({ email, password }) {
  const data = await request("POST", "/auth/login/", { email, password }, { skipAuth: true });
  setToken(data.token);
  return data;
}

export async function verifyEmail({ email, code }) {
  const data = await request("POST", "/auth/verify-email/", { email, code });
  setToken(data.token);
  return data;
}

export async function resendEmailVerification(email) {
  return request("POST", "/auth/resend-verification/", { email });
}

export async function requestPasswordReset(email) {
  return request(
    "POST",
    "/auth/forgot-password/",
    { email },
    { skipAuth: true }
  );
}

export async function verifyPasswordResetCode({ email, code }) {
  return request(
    "POST",
    "/auth/verify-reset-code/",
    { email, code },
    { skipAuth: true }
  );
}

export async function resetPassword({ email, resetToken, newPassword }) {
  return request(
    "POST",
    "/auth/reset-password/",
    {
      email,
      reset_token: resetToken,
      new_password: newPassword,
    },
    { skipAuth: true }
  );
}

export async function logout() {
  await request("POST", "/auth/logout/").catch(() => {});
  clearToken();
}

// ── Profile ───────────────────────────────────────────────────

export async function getMe() {
  return request("GET", "/auth/me/");
}

export async function patchMe(fields) {
  return request("PATCH", "/auth/me/", fields);
}

export async function postWellnessScreening(answers) {
  return request("POST", "/auth/wellness-screening/", answers);
}

export async function createCareInvitation() {
  return request("POST", "/auth/care-invitations/", {});
}

export async function acceptCareInvitation(code) {
  return request("POST", "/auth/care-invitations/accept/", { code });
}

export async function getClinicianPatients() {
  return request("GET", "/auth/clinician/patients/");
}

// ── Sessions ──────────────────────────────────────────────────

export async function postSession(session) {
  return request("POST", "/sessions/", session);
}

export async function postPainCheckin(checkin) {
  return request("POST", "/pain-checkins/", checkin);
}

export async function getSessions() {
  return request("GET", "/sessions/");
}

export async function getPainCheckins() {
  return request("GET", "/pain-checkins/");
}

// ── Calibrations ──────────────────────────────────────────────

export async function postCalibration(calibration) {
  return request("POST", "/calibrations/", calibration);
}

export async function getCalibrations() {
  return request("GET", "/calibrations/");
}

// ── Exercises ─────────────────────────────────────────────────

export async function getExercises() {
  return request("GET", "/exercises/");
}

// ── Therapist ─────────────────────────────────────────────────

export async function getPatients() {
  return request("GET", "/patients/");
}

export async function getPatientSessions(patientId) {
  return request("GET", `/sessions/?patient=${patientId}`);
}

export async function getPatientPainCheckins(patientId) {
  return request("GET", `/pain-checkins/?patient=${patientId}`);
}

export async function getPrescriptions() {
  return request("GET", "/prescriptions/");
}

export async function createPrescription(prescription) {
  return request("POST", "/prescriptions/", prescription);
}

// ── Consultations and trend alerts ───────────────────────────

export async function getConsultations() {
  return request("GET", "/consultations/");
}

export async function createConsultation(consultation) {
  return request("POST", "/consultations/", consultation);
}

export async function getEscalations() {
  return request("GET", "/escalations/");
}

// ── Role-specific AI assistant ───────────────────────────────

export async function sendAgentMessage(message) {
  return request("POST", "/auth/agent/chat/", { message });
}
