function patientId(patient) {
  const value = patient?.id ?? patient?.patient_id ?? patient?.patientId;
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * A patient who is already in the clinician's roster must never also appear
 * in the unassigned triage queue. The API normally enforces this rule; this
 * client-side check also protects the dashboard from stale or legacy data.
 */
export function excludeRosterPatientsFromTriage(triage, roster) {
  const rosterIds = new Set(
    (Array.isArray(roster) ? roster : [])
      .map(patientId)
      .filter(Boolean),
  );

  return (Array.isArray(triage) ? triage : []).filter(patient => {
    const id = patientId(patient);
    return id && !rosterIds.has(id);
  });
}
