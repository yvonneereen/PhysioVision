import assert from "node:assert/strict";

import {
  analysePatientTrend,
  findUpcomingConsultation,
  isClinicianGuidedProfile,
  isCurrentPrescription,
  isPhysiotherapistRequestPending,
  shouldShowPhysiotherapistRequest,
} from "../patient-dashboard-state.js";

const dates = [
  "2026-07-27T08:00:00Z",
  "2026-07-25T08:00:00Z",
  "2026-07-23T08:00:00Z",
];

assert.equal(
  analysePatientTrend({
    sessions: dates.map((started_at, index) => ({
      started_at,
      quality_score: [62, 72, 80][index],
    })),
    now: new Date("2026-07-27T12:00:00Z"),
  }).status,
  "review_suggested",
);

assert.equal(
  analysePatientTrend({
    painCheckins: dates.map((checked_at, index) => ({
      checked_at,
      pain_level: [6, 5, 3][index],
      recovery_status: index < 2 ? "worse" : "same",
    })),
  }).reason,
  "pain_increase",
);

assert.equal(
  analysePatientTrend({
    escalations: [{
      status: "open",
      trigger_type: "quality_decline",
      description: "Measured movement quality has decreased.",
      created_at: dates[0],
    }],
  }).title,
  "A physiotherapist review is suggested",
);

assert.equal(
  analysePatientTrend({
    sessions: dates.map((started_at, index) => ({
      started_at,
      quality_score: [84, 80, 76][index],
    })),
  }).status,
  "improving",
);

assert.equal(
  isCurrentPrescription(
    {
      is_active: true,
      valid_from: "2026-07-01",
      valid_until: "2026-07-31",
    },
    new Date("2026-07-27T12:00:00Z"),
  ),
  true,
);

assert.equal(
  findUpcomingConsultation(
    [
      {
        id: 1,
        status: "cancelled",
        scheduled_at: "2026-08-03T09:00:00Z",
      },
      {
        id: 2,
        status: "requested",
        scheduled_at: "2026-08-04T09:00:00Z",
      },
      {
        id: 3,
        status: "confirmed",
        scheduled_at: "2026-08-02T09:00:00Z",
      },
    ],
    new Date("2026-08-01T09:00:00Z"),
  )?.id,
  3,
);

assert.equal(
  findUpcomingConsultation(
    [{
      status: "requested",
      scheduled_at: "2026-07-31T09:00:00Z",
    }],
    new Date("2026-08-01T09:00:00Z"),
  ),
  null,
);

assert.equal(
  findUpcomingConsultation(
    [
      {
        id: 4,
        status: "confirmed",
        scheduled_at: "2026-08-04T09:00:00Z",
      },
      {
        id: 5,
        status: "requested",
        scheduled_at: null,
        created_at: "2026-08-01T10:00:00Z",
      },
    ],
    new Date("2026-08-01T09:00:00Z"),
  )?.id,
  5,
  "an unscheduled patient request remains visible while awaiting the physiotherapist",
);

assert.equal(
  findUpcomingConsultation(
    [{ id: 6, status: "confirmed", scheduled_at: null }],
    new Date("2026-08-01T09:00:00Z"),
  ),
  null,
  "a confirmed consultation must have a scheduled time",
);

assert.equal(
  isClinicianGuidedProfile({ pathway_choice: "physiotherapist" }),
  true,
);

assert.equal(
  isClinicianGuidedProfile({ carePath: "clinician" }),
  true,
);

assert.equal(
  isClinicianGuidedProfile({ primaryClinician: { id: 12 } }),
  true,
);

assert.equal(
  shouldShowPhysiotherapistRequest({
    pathwayChoice: "wellness",
    wellnessScreeningStatus: "eligible",
  }),
  true,
);

assert.equal(
  isPhysiotherapistRequestPending({
    pathwayChoice: "wellness",
    physiotherapistRequestedAt: "2026-08-06T09:30:00Z",
  }),
  true,
  "a pending request must not make a wellness patient clinician-guided",
);

assert.equal(
  isClinicianGuidedProfile({
    pathwayChoice: "wellness",
    physiotherapistRequestedAt: "2026-08-06T09:30:00Z",
  }),
  false,
);

assert.equal(
  isPhysiotherapistRequestPending({
    pathwayChoice: "physiotherapist",
    primaryClinician: { id: 12 },
    physiotherapistRequestedAt: "2026-08-06T09:30:00Z",
  }),
  false,
);

assert.equal(
  shouldShowPhysiotherapistRequest({
    pathwayChoice: "physiotherapist",
    primaryClinician: { id: 12 },
  }),
  false,
);

assert.equal(
  shouldShowPhysiotherapistRequest({
    pathwayChoice: "wellness",
    medical_history: "Recent knee replacement",
  }),
  false,
  "a patient with medical history must not see the self-referral action",
);

assert.equal(
  shouldShowPhysiotherapistRequest({
    pathwayChoice: "wellness",
    hasRelevantHistory: true,
  }),
  false,
  "the browser profile medical-history flag must also hide self-referral",
);

console.log("patient dashboard state tests passed");
