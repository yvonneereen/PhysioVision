export function getRoleNavigationState(loggedIn, role) {
  const authenticated = Boolean(loggedIn);
  return {
    showSignIn: !authenticated,
    showSignOut: authenticated,
    showPatientProfile: authenticated && role === "patient",
    showTherapistView: authenticated && role === "clinician",
    showPlan: !authenticated || role === "patient",
  };
}
