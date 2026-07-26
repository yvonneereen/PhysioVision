import {
  getCalibrations,
  getMe,
  getPrescriptions,
  isLoggedIn,
  login,
  logout,
  register,
  resendEmailVerification,
  verifyEmail,
} from "./api.js";

const shell        = document.getElementById("auth-modal");
const loginForm    = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const verificationForm = document.getElementById("verificationForm");
const authTabs      = document.getElementById("authTabs");
const tabLogin     = document.getElementById("authTabLogin");
const tabRegister  = document.getElementById("authTabRegister");
const loginError   = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const verificationError = document.getElementById("verificationError");
const verificationStatus = document.getElementById("verificationStatus");
const verificationEmail = document.getElementById("verificationEmail");
const resendVerification = document.getElementById("resendVerification");

const headerSignIn  = document.getElementById("headerSignIn");
const headerSignOut = document.getElementById("headerSignOut");
const mobileSignIn  = document.getElementById("mobileSignIn");
const mobileSignOut = document.getElementById("mobileSignOut");
const USER_CACHE_KEYS = [
  "physiovision.profile.v1",
  "physiovision.calibrations.v1",
  "physiovision.prescriptions.v1",
];

let pendingVerificationEmail = "";

function clearUserCachedData() {
  USER_CACHE_KEYS.forEach((key) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  });
}

function updateAuthButtons(loggedIn) {
  headerSignIn.style.display  = loggedIn ? "none" : "";
  headerSignOut.style.display = loggedIn ? "" : "none";
  mobileSignIn.style.display  = loggedIn ? "none" : "";
  mobileSignOut.style.display = loggedIn ? "" : "none";
}

function showModal() {
  shell.classList.add("is-open");
  shell.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function hideModal() {
  shell.classList.remove("is-open");
  shell.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = "block";
}

function clearError(el) {
  el.textContent = "";
  el.style.display = "none";
}

function routeAfterAuthentication(user) {
  window.setTimeout(() => {
    if (user?.role === "clinician") {
      document
        .querySelector("[data-open='therapist-view']")
        ?.click();
      return;
    }
    document
      .getElementById("practice")
      ?.scrollIntoView({ behavior: "smooth" });
  }, 0);
}

function selectLoginTab() {
  loginForm.style.display = "";
  registerForm.style.display = "none";
  verificationForm.style.display = "none";
  authTabs.style.display = "flex";
  tabLogin.className = "button button-coral";
  tabRegister.className = "button button-light";
  clearError(loginError);
}

function selectRegisterTab(role = "patient") {
  loginForm.style.display = "none";
  registerForm.style.display = "";
  verificationForm.style.display = "none";
  authTabs.style.display = "flex";
  tabLogin.className = "button button-light";
  tabRegister.className = "button button-coral";
  registerForm.elements.role.value = role;
  clearError(registerError);
}

function selectVerification(email, message = "We sent a 6-digit code to") {
  pendingVerificationEmail = String(email ?? "").trim().toLowerCase();
  loginForm.style.display = "none";
  registerForm.style.display = "none";
  verificationForm.style.display = "";
  authTabs.style.display = "none";
  verificationEmail.textContent = pendingVerificationEmail;
  verificationStatus.textContent = message;
  verificationForm.reset();
  clearError(verificationError);
  verificationForm.elements.code.focus();
}

// Account buttons can open the normal sign-in form or a role-specific
// registration form. The backend still decides the user's role after login.
document.querySelectorAll("[data-open='auth-modal']").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.authMode === "register") {
      selectRegisterTab(button.dataset.authRole || "patient");
    } else {
      selectLoginTab();
    }
    showModal();
  });
});

// Tab switching
tabLogin.addEventListener("click", selectLoginTab);
tabRegister.addEventListener("click", () => selectRegisterTab());

// Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(loginError);
  const data = new FormData(loginForm);
  try {
    await login({ email: data.get("email"), password: data.get("password") });
    const user = await completeAuthentication();
    hideModal();
    updateAuthButtons(true);
    routeAfterAuthentication(user);
  } catch (err) {
    if (err.data?.code === "email_not_verified") {
      selectVerification(err.data.email ?? data.get("email"));
      return;
    }
    showError(loginError, err.data?.non_field_errors?.[0] ?? err.message ?? "Login failed.");
  }
});

// Register
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(registerError);
  const data = new FormData(registerForm);
  try {
    const result = await register({
      email:     data.get("email"),
      password:  data.get("password"),
      firstName: data.get("firstName"),
      lastName:  data.get("lastName"),
      role:      data.get("role"),
    });
    selectVerification(result.email ?? data.get("email"));
  } catch (err) {
    if (err.data?.verification_required) {
      selectVerification(
        err.data.email ?? data.get("email"),
        "Your account was created. Request a new code below."
      );
      showError(verificationError, err.data.detail ?? err.message);
      return;
    }
    const detail = err.data?.email?.[0] ?? err.data?.non_field_errors?.[0] ?? err.message ?? "Registration failed.";
    showError(registerError, detail);
  }
});

verificationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(verificationError);
  const data = new FormData(verificationForm);
  try {
    await verifyEmail({
      email: pendingVerificationEmail,
      code: String(data.get("code") ?? "").trim(),
    });
    const user = await completeAuthentication();
    hideModal();
    updateAuthButtons(true);
    routeAfterAuthentication(user);
  } catch (err) {
    showError(
      verificationError,
      err.data?.detail ?? err.message ?? "Verification failed."
    );
  }
});

resendVerification.addEventListener("click", async () => {
  clearError(verificationError);
  resendVerification.disabled = true;
  try {
    const result = await resendEmailVerification(pendingVerificationEmail);
    verificationStatus.textContent = result.detail;
  } catch (err) {
    showError(
      verificationError,
      err.data?.detail ?? err.message ?? "Could not resend the code."
    );
  } finally {
    resendVerification.disabled = false;
  }
});

// Pull calibrations from the private API into this tab's short-lived cache.
async function seedCalibrationsFromApi() {
  try {
    const data = await getCalibrations();
    const results = data.results ?? data;
    const calibrations = {};
    results.forEach(cal => {
      if (cal.is_active) {
        calibrations[cal.exercise] = {
          version:              cal.version,
          exerciseId:           cal.exercise,
          affectedSide:         cal.affected_side,
          capturedAt:           cal.captured_at,
          start:                cal.start_measurements,
          target:               cal.target_measurements,
          phaseRanges:          cal.phase_ranges,
          naturalKneeDifference: cal.natural_knee_difference,
        };
      }
    });
    sessionStorage.setItem("physiovision.calibrations.v1", JSON.stringify(calibrations));
  } catch (_) {
    // Non-fatal
  }
}

async function seedPrescriptionsFromApi() {
  try {
    const data = await getPrescriptions();
    const prescriptions = data.results ?? data;
    sessionStorage.setItem(
      "physiovision.prescriptions.v1",
      JSON.stringify(prescriptions)
    );
    window.dispatchEvent(new CustomEvent(
      "physiovision:prescriptions-updated",
      { detail: prescriptions }
    ));
  } catch (_) {
    // A missing backend connection must not create fake prescriptions.
    sessionStorage.setItem("physiovision.prescriptions.v1", "[]");
    window.dispatchEvent(new CustomEvent(
      "physiovision:prescriptions-updated",
      { detail: [] }
    ));
  }
}

// Pull the profile from the private API into this tab's short-lived cache.
async function seedProfileFromApi() {
  const me = await getMe();
  window.dispatchEvent(new CustomEvent(
    "physiovision:auth-role",
    { detail: { role: me.role, user: me } }
  ));
  if (me.role === "patient" && me.profile) {
    const p = me.profile;
    const goalLabels = {
      stronger_knees: "Stronger knees",
      better_balance: "Better balance",
      less_stiffness: "Move with less stiffness",
      stay_active: "Stay active",
    };
    const activityLabels = {
      lightly_active: "Lightly active",
      mostly_seated: "Mostly seated",
      active_most_days: "Active most days",
    };
    const mobilityLabels = {
      independent: "Independent",
      walking_aid: "Use a walking aid",
      needs_person: "Need another person nearby",
    };
    const mapped = {
      name:      `${me.first_name} ${me.last_name}`.trim(),
      goal:      goalLabels[p.goal]             ?? p.goal ?? "",
      activity:  activityLabels[p.activity_level] ?? p.activity_level ?? "",
      mobility:  mobilityLabels[p.mobility_status] ?? p.mobility_status ?? "",
      focusSide: p.focus_side       ?? "right",
      cueStyle:  p.cue_style        ?? "gentle",
      carePath:  p.care_path        ?? "wellness",
      wellnessScreening: {
        version: 1,
        status: p.wellness_screening_status ?? "pending",
        answers: {
          notTreatingCondition:
            p.wellness_screening_answers?.not_treating_condition === true,
          noClinicianRestrictions:
            p.wellness_screening_answers?.no_clinician_restrictions === true,
          generalWellnessGoal:
            p.wellness_screening_answers?.general_wellness_goal === true,
          noConcerningSymptoms:
            p.wellness_screening_answers?.no_concerning_symptoms === true,
        },
        reviewReasons: [],
        screenedAt: p.wellness_screened_at ?? null,
      },
    };
    sessionStorage.setItem("physiovision.profile.v1", JSON.stringify(mapped));
    window.dispatchEvent(new CustomEvent("physiovision:profile-updated", { detail: mapped }));
  }
  return me;
}

async function seedSignedInData() {
  const me = await seedProfileFromApi();
  if (me?.role === "patient") {
    await Promise.all([
      seedCalibrationsFromApi(),
      seedPrescriptionsFromApi(),
    ]);
  }
  return me;
}

async function completeAuthentication() {
  clearUserCachedData();
  try {
    return await seedSignedInData();
  } catch (err) {
    await logout();
    clearUserCachedData();
    throw err;
  }
}

// Signed-out visitors can view the read-only landing-page demonstration.
// Authentication opens only when they choose a sign-in or protected action.
updateAuthButtons(false);
if (isLoggedIn()) {
  completeAuthentication()
    .then(() => updateAuthButtons(true))
    .catch(() => updateAuthButtons(false));
} else {
  clearUserCachedData();
}

// Expose logout globally
window.pvLogout = async () => {
  await logout();
  clearUserCachedData();
  updateAuthButtons(false);
  location.reload();
};
