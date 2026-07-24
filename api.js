// Central API client — all backend calls go through here.
// Token is kept in localStorage so it survives page refreshes.

const runtimeWindow = typeof window === "undefined" ? {} : window;
const runtimeHostname = runtimeWindow.location?.hostname ?? "localhost";
const BASE = runtimeWindow.PHYSIOVISION_API_BASE ?? (
  ["localhost", "127.0.0.1"].includes(runtimeHostname)
    ? "http://localhost:8000/api"
    : "/api"
);
const TOKEN_KEY = "physiovision.token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Token ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || "Request failed"), { status: res.status, data: err });
  }

  return res.status === 204 ? null : res.json();
}

// ── Auth ──────────────────────────────────────────────────────

export async function register({ email, password, firstName, lastName, role = "patient", ...profileFields }) {
  const data = await request("POST", "/auth/register/", {
    email, password,
    first_name: firstName,
    last_name: lastName,
    role,
    ...profileFields,
  });
  setToken(data.token);
  return data;
}

export async function login({ email, password }) {
  const data = await request("POST", "/auth/login/", { email, password });
  setToken(data.token);
  return data;
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

// ── Role-specific AI assistant ───────────────────────────────

export async function sendAgentMessage(message) {
  return request("POST", "/auth/agent/chat/", { message });
}
