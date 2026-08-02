import {
  hasSavedProfile,
  loadProfile,
  saveProfile,
} from "./personalization.js";
import {
  evaluateWellnessScreening,
  WELLNESS_SCREENING_KEYS,
} from "./wellness-screening.js";
import {
  acceptWellnessPlan,
  generateWellnessPlan,
  isLoggedIn,
  postWellnessScreening,
} from "./api.js?v=22";

const GOAL_API_VALUES = Object.freeze({
  "Stronger knees": "stronger_knees",
  "Better balance": "better_balance",
  "Move with less stiffness": "less_stiffness",
  "Stay active": "stay_active",
  "Stronger hips": "stronger_hips",
  "Better ankle movement": "ankle_mobility",
  "Walk with confidence": "walking_confidence",
  "Other": "other",
});

const ACTIVITY_API_VALUES = Object.freeze({
  "Lightly active": "lightly_active",
  "Mostly seated": "mostly_seated",
  "Active most days": "active_most_days",
});

(() => {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector(".menu-toggle");
  const mobileNav = document.querySelector(".mobile-nav");
  const modalShells = [...document.querySelectorAll(".modal-shell")];
  const planForm = document.getElementById("planForm");
  const profileForm = document.getElementById("profileForm");
  const planSteps = planForm ? [...planForm.querySelectorAll(".form-step")] : [];
  const progressBars = [...document.querySelectorAll(".modal-progress span")];
  const wellnessEligibleOutcome = document.getElementById("wellnessEligibleOutcome");
  const wellnessReviewOutcome = document.getElementById("wellnessReviewOutcome");
  const wellnessReviewReasons = document.getElementById("wellnessReviewReasons");
  const generatedWellnessPlan = document.getElementById("generatedWellnessPlan");
  const plannerRationale = document.getElementById("plannerRationale");
  const plannerAgentTrace = document.getElementById("plannerAgentTrace");
  const plannerRequestStatus = document.getElementById("plannerRequestStatus");
  const plannerAcceptStatus = document.getElementById("plannerAcceptStatus");
  const wellnessScreeningStatus = document.getElementById("wellnessScreeningStatus");
  const requestPlanDraft = document.getElementById("requestPlanDraft");
  const requestPlanRevision = document.getElementById("requestPlanRevision");
  const planRevisionRequest = document.getElementById("planRevisionRequest");
  const planCustomGoalField = document.getElementById("planCustomGoalField");
  const planCustomGoalInput = document.getElementById("planCustomGoal");
  const plannerMedicalHistoryField = document.getElementById(
    "plannerMedicalHistoryField"
  );
  const plannerMedicalHistory = document.getElementById(
    "plannerMedicalHistory"
  );
  const profileCustomGoalField = document.getElementById("profileCustomGoalField");
  const profileCustomGoalInput = document.getElementById("profileCustomGoal");
  let activeModal = null;
  let previousFocus = null;
  let planStep = 1;
  let activeWellnessPlan = null;
  let activePlanPreferences = null;
  let activePlanDraftToken = null;
  let authenticatedRole = null;

  window.addEventListener("physiovision:auth-role", (event) => {
    authenticatedRole = event.detail?.role ?? null;
  });

  function syncCustomGoalField(form, field, input) {
    if (!form || !field || !input) return;
    const selectedGoal = form.elements.namedItem("goal")?.value;
    const isOther = selectedGoal === "Other";
    field.hidden = !isOther;
    input.required = isOther;
    if (!isOther) input.setCustomValidity("");
  }

  planForm?.querySelectorAll('input[name="goal"]').forEach((input) => {
    input.addEventListener("change", () => {
      syncCustomGoalField(planForm, planCustomGoalField, planCustomGoalInput);
      if (input.value === "Other") planCustomGoalInput?.focus();
    });
  });
  profileForm?.elements.namedItem("goal")?.addEventListener("change", () => {
    syncCustomGoalField(
      profileForm,
      profileCustomGoalField,
      profileCustomGoalInput
    );
  });

  function syncPlannerMedicalHistoryField() {
    const hasRelevantHistory =
      planForm
        ?.querySelector('input[name="hasRelevantHistory"]:checked')
        ?.value === "true";
    if (plannerMedicalHistoryField) {
      plannerMedicalHistoryField.hidden = !hasRelevantHistory;
    }
    if (plannerMedicalHistory) {
      plannerMedicalHistory.disabled = !hasRelevantHistory;
      plannerMedicalHistory.required = hasRelevantHistory;
    }
  }

  planForm
    ?.querySelectorAll('input[name="hasRelevantHistory"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        syncPlannerMedicalHistoryField();
        if (input.value === "true" && input.checked) {
          plannerMedicalHistory?.focus();
        }
      });
    });

  const setHeaderState = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 80);
  };

  setHeaderState();
  window.addEventListener("scroll", setHeaderState, { passive: true });

  const closeMenu = () => {
    mobileNav?.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "Open navigation");
  };

  menuButton?.addEventListener("click", () => {
    const opening = !mobileNav?.classList.contains("is-open");
    mobileNav?.classList.toggle("is-open", opening);
    menuButton.setAttribute("aria-expanded", String(opening));
    menuButton.setAttribute("aria-label", opening ? "Close navigation" : "Open navigation");
  });

  mobileNav?.querySelectorAll("a, button").forEach((control) => {
    control.addEventListener("click", closeMenu);
  });

  const focusableSelector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    previousFocus = document.activeElement;
    activeModal = modal;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    body.classList.add("modal-open");

    if (id === "plan-modal") {
      const savedProfile = loadProfile();
      if (hasSavedProfile()) {
        fillFormFromProfile(planForm, savedProfile);
        fillWellnessScreening(planForm, savedProfile.wellnessScreening);
      }
      syncCustomGoalField(planForm, planCustomGoalField, planCustomGoalInput);
      syncPlannerMedicalHistoryField();
      // A replacement draft may use the accepted plan as context. Merely
      // opening or closing the planner never removes the current plan.
      activeWellnessPlan = savedProfile.wellnessPlan ?? null;
      activePlanPreferences = null;
      activePlanDraftToken = null;
      if (plannerRequestStatus) plannerRequestStatus.textContent = "";
      if (plannerAcceptStatus) plannerAcceptStatus.textContent = "";
      showPlanStep(1);
    } else if (id === "profile-modal") {
      fillFormFromProfile(profileForm, loadProfile());
      syncCustomGoalField(
        profileForm,
        profileCustomGoalField,
        profileCustomGoalInput
      );
    } else if (id === "therapist-view") {
      window.pvLoadDashboard?.();
    }

    window.setTimeout(() => {
      modal.querySelector(focusableSelector)?.focus();
    }, 50);
  }

  function closeModal(modal = activeModal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    body.classList.remove("modal-open");
    activeModal = null;
    previousFocus?.focus?.();
  }

  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      let modalId = button.dataset.open;
      const currentRole =
        authenticatedRole || document.body.dataset.authRole || null;
      const patientOnly =
        modalId === "plan-modal" ||
        modalId === "profile-modal" ||
        modalId === "booking-modal";
      const therapistOnly = modalId === "therapist-view";

      if (patientOnly && !isLoggedIn()) {
        document.getElementById("authTabLogin")?.click();
        modalId = "auth-modal";
      } else if (patientOnly && currentRole === "clinician") {
        modalId = "therapist-view";
      } else if (therapistOnly && !isLoggedIn()) {
        document.getElementById("authTabLogin")?.click();
        modalId = "auth-modal";
      } else if (therapistOnly && currentRole !== "clinician") {
        return;
      }

      openModal(modalId);
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((control) => {
    control.addEventListener("click", () => {
      const shell = control.closest(".modal-shell");
      closeModal(shell);
    });
  });

  modalShells.forEach((shell) => {
    shell.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...shell.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (activeModal) closeModal();
      closeMenu();
    }
  });

  function showPlanStep(step) {
    planStep = Math.max(1, Math.min(step, planSteps.length));
    planSteps.forEach((panel) => {
      panel.classList.toggle("active", Number(panel.dataset.step) === planStep);
    });
    progressBars.forEach((bar, index) => {
      bar.classList.toggle("active", index < planStep);
    });

    const activeStep = planSteps.find(
      (panel) => Number(panel.dataset.step) === planStep
    );
    activeStep?.querySelector("input, button, select, textarea")?.focus();
  }

  function validatePlanStep(step) {
    const required = [...step.querySelectorAll("[required]")];
    const invalid = required.find((field) => !field.checkValidity());
    if (!invalid) return true;
    invalid.reportValidity();
    invalid.focus();
    return false;
  }

  function readWellnessScreening(formData) {
    return Object.fromEntries(
      WELLNESS_SCREENING_KEYS.map((key) => [
        key,
        formData.get(key) === "true",
      ])
    );
  }

  function renderWellnessOutcome(screening) {
    const eligible = screening.status === "eligible";
    wellnessEligibleOutcome.classList.toggle("hidden", !eligible);
    wellnessReviewOutcome.classList.toggle("hidden", eligible);
    if (!eligible) {
      wellnessReviewReasons.innerHTML = "";
      screening.reviewReasons.forEach((reason) => {
        const item = document.createElement("li");
        item.textContent = reason;
        wellnessReviewReasons.appendChild(item);
      });
    }
  }

  function renderWellnessPlan(plan, age) {
    activeWellnessPlan = plan;
    generatedWellnessPlan.innerHTML = "";
    plan.days.forEach((day) => {
      const row = document.createElement("div");
      row.className = "generated-day";

      const dayLabel = document.createElement("span");
      dayLabel.textContent = day.day;
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = day.title;
      const exercises = document.createElement("small");
      exercises.textContent = day.exercises;
      const duration = document.createElement("em");
      duration.textContent = day.duration;

      detail.append(title, exercises);
      row.append(dayLabel, detail, duration);
      generatedWellnessPlan.appendChild(row);
    });

    const summary = document.getElementById("planSummary");
    if (summary) {
      summary.textContent = plan.summary || `This reviewed draft focuses on ${
        plan.goal.toLowerCase()
      }${age ? ` and reflects the preferences supplied at age ${age}` : ""}.`;
    }
    if (plannerRationale) {
      plannerRationale.replaceChildren(
        ...(plan.rationale ?? []).map((reason) => {
          const item = document.createElement("p");
          item.textContent = reason;
          return item;
        })
      );
    }
    if (plannerAgentTrace) {
      plannerAgentTrace.replaceChildren(
        ...(plan.agent_trace ?? []).map((event) => {
          const item = document.createElement("li");
          item.textContent = event;
          return item;
        })
      );
    }
  }

  planForm?.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (planStep === 1 && !validatePlanStep(planSteps[0])) return;

      if (planStep === 2) {
        const formData = new FormData(planForm);
        if (!validatePlanStep(planSteps[1])) return;
        const screening = evaluateWellnessScreening(
          readWellnessScreening(formData)
        );
        const screeningProfile = {
          carePath:
            screening.status === "eligible" ? "wellness" : "needs_review",
          wellnessScreening: screening,
        };
        if (screening.status !== "eligible") {
          screeningProfile.wellnessPlan = null;
          screeningProfile.wellnessPlanAcceptedAt = null;
        }
        const cachedProfile = saveProfile(screeningProfile, {
          syncBackend: false,
          syncScreening: false,
        });
        renderWellnessOutcome(screening);
        button.disabled = true;
        if (wellnessScreeningStatus) {
          wellnessScreeningStatus.textContent = "Checking your answers securely…";
        }
        try {
          const result = await postWellnessScreening({
            not_treating_condition:
              screening.answers.notTreatingCondition === true,
            no_clinician_restrictions:
              screening.answers.noClinicianRestrictions === true,
            general_wellness_goal:
              screening.answers.generalWellnessGoal === true,
            no_concerning_symptoms:
              screening.answers.noConcerningSymptoms === true,
          });
          cachedProfile.wellnessScreening.screenedAt = result.screened_at;
          saveProfile(cachedProfile, {
            syncBackend: false,
            syncScreening: false,
          });
          if (wellnessScreeningStatus) {
            wellnessScreeningStatus.textContent = "";
          }
        } catch (error) {
          if (wellnessScreeningStatus) {
            wellnessScreeningStatus.textContent =
              error.message || "The safety screen could not be saved.";
          }
          return;
        } finally {
          button.disabled = false;
        }
        if (screening.status !== "eligible") {
          showPlanStep(4);
          return;
        }
      }
      showPlanStep(planStep + 1);
    });
  });

  planForm?.querySelectorAll("[data-prev-step]").forEach((button) => {
    button.addEventListener("click", () => showPlanStep(planStep - 1));
  });

  function readPlanPreferences() {
    const formData = new FormData(planForm);
    const goalLabel = String(formData.get("goal") || "Stay active");
    const numberOrNull = (name) => {
      const value = String(formData.get(name) ?? "").trim();
      return value ? Number(value) : null;
    };
    const hasRelevantHistory =
      formData.get("hasRelevantHistory") === "true";
    return {
      goal: GOAL_API_VALUES[goalLabel] ?? "stay_active",
      custom_goal:
        goalLabel === "Other"
          ? String(formData.get("customGoal") || "").trim()
          : "",
      activity_level:
        ACTIVITY_API_VALUES[String(formData.get("activity"))]
        ?? "lightly_active",
      focus_side: String(formData.get("focusSide") || "right"),
      cue_style: String(formData.get("cueStyle") || "gentle"),
      days_per_week: Number(formData.get("daysPerWeek") || 3),
      minutes_per_session: Number(
        formData.get("minutesPerSession") || 10
      ),
      equipment: String(formData.get("equipment") || "chair"),
      planning_notes: String(
        formData.get("planningNotes") || ""
      ).trim(),
      has_relevant_history: hasRelevantHistory,
      medical_history: hasRelevantHistory
        ? String(formData.get("medicalHistory") || "").trim()
        : "",
      age: numberOrNull("age"),
      height_cm: numberOrNull("height"),
      weight_kg: numberOrNull("weight"),
    };
  }

  function setRequestBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.innerHTML;
      button.textContent = busyLabel;
    } else if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
    button.disabled = busy;
  }

  async function requestAiPlan(revision = "", triggerButton = null) {
    if (!validatePlanStep(planSteps[2])) return;
    const preferences = readPlanPreferences();
    const button =
      triggerButton ?? (revision ? requestPlanRevision : requestPlanDraft);
    const statusElement = revision
      ? plannerAcceptStatus
      : plannerRequestStatus;
    setRequestBusy(button, true, revision ? "Revising safely…" : "Creating a safe draft…");
    if (statusElement) {
      statusElement.textContent =
        "The AI is comparing your preferences with the reviewed exercise catalogue.";
    }
    try {
      const response = await generateWellnessPlan({
        ...preferences,
        previous_plan: activeWellnessPlan,
        revision,
      });
      activePlanPreferences = preferences;
      activePlanDraftToken = response.draft_token;
      renderWellnessPlan(response.plan, preferences.age);
      renderWellnessOutcome({ status: "eligible" });
      if (statusElement) statusElement.textContent = "";
      showPlanStep(4);
    } catch (error) {
      if (statusElement) {
        statusElement.textContent =
          error.message || "The AI could not create a draft.";
      }
    } finally {
      setRequestBusy(button, false);
    }
  }

  requestPlanDraft?.addEventListener("click", () => requestAiPlan());
  requestPlanRevision?.addEventListener("click", () => {
    const revision = planRevisionRequest?.value.trim();
    if (!revision) {
      planRevisionRequest?.focus();
      return;
    }
    requestAiPlan(revision, requestPlanRevision);
  });
  document.querySelectorAll("[data-revise-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      requestAiPlan(button.dataset.revisePlan, button);
    });
  });
  document.querySelector("[data-edit-plan-answers]")?.addEventListener(
    "click",
    () => showPlanStep(3)
  );

  function startAcceptedPlan() {
    const firstExerciseId = activeWellnessPlan?.days?.[0]?.exerciseIds?.[0];
    const exerciseSelect = document.getElementById("exerciseSelect");
    if (firstExerciseId && exerciseSelect) {
      exerciseSelect.value = firstExerciseId;
      exerciseSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    closeModal();
    if (window.pvStartPatientExercise) {
      window.pvStartPatientExercise(firstExerciseId);
    } else {
      document.getElementById("practice")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  document.querySelector("[data-accept-plan]")?.addEventListener(
    "click",
    async (event) => {
      if (
        !activeWellnessPlan
        || !activePlanPreferences
        || !activePlanDraftToken
      ) return;
      const button = event.currentTarget;
      setRequestBusy(button, true, "Saving your accepted plan…");
      if (plannerAcceptStatus) {
        plannerAcceptStatus.textContent =
          "Rechecking the fixed safety rules before saving.";
      }
      try {
        const profile = await acceptWellnessPlan(activePlanDraftToken);
        const goalLabel = Object.entries(GOAL_API_VALUES).find(
          ([, value]) => value === profile.goal
        )?.[0] ?? "Stay active";
        saveProfile({
          name: planForm.elements.namedItem("name")?.value ?? "",
          age: activePlanPreferences.age,
          goal: goalLabel,
          customGoal: profile.custom_goal ?? "",
          activity: planForm.elements.namedItem("activity")?.value,
          focusSide: profile.focus_side,
          cueStyle: profile.cue_style,
          carePath: profile.care_path,
          pathwayChoice: profile.pathway_choice,
          wellnessPlan: profile.wellness_plan,
          wellnessPlanAcceptedAt: profile.wellness_plan_accepted_at,
          daysPerWeek: activePlanPreferences.days_per_week,
          minutesPerSession: activePlanPreferences.minutes_per_session,
          equipment: activePlanPreferences.equipment,
          planningNotes: activePlanPreferences.planning_notes,
          hasRelevantHistory: Boolean(profile.medical_history),
          medicalHistory: profile.medical_history ?? "",
        }, {
          syncBackend: false,
          syncScreening: false,
        });
        activeWellnessPlan = profile.wellness_plan;
        if (plannerAcceptStatus) {
          plannerAcceptStatus.textContent = "Plan accepted.";
        }
        startAcceptedPlan();
      } catch (error) {
        if (plannerAcceptStatus) {
          plannerAcceptStatus.textContent =
            error.message || "The plan could not be saved.";
        }
      } finally {
        setRequestBusy(button, false);
      }
    }
  );

  document.querySelector("[data-review-screening]")?.addEventListener("click", () => {
    showPlanStep(2);
  });

  profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const formData = new FormData(profileForm);
    const profile = Object.fromEntries(formData.entries());
    if (profile.goal !== "Other") profile.customGoal = "";
    saveProfile(profile);
    closeModal(profileForm.closest(".modal-shell"));
  });

  function fillFormFromProfile(form, profile) {
    if (!form) return;
    for (const [key, value] of Object.entries(profile)) {
      const field = form.elements.namedItem(key);
      if (field && value !== undefined && value !== null) {
        field.value = String(value);
      }
    }
  }

  function fillWellnessScreening(form, screening) {
    if (!form || !screening?.answers) return;
    WELLNESS_SCREENING_KEYS.forEach((key) => {
      if (typeof screening.answers[key] !== "boolean") return;
      const selector =
        `input[name="${key}"][value="${String(screening.answers[key])}"]`;
      const field = form.querySelector(selector);
      if (field) field.checked = true;
    });
  }

  document.querySelectorAll(".therapist-sidebar nav button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".therapist-sidebar nav button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    });
  });
})();
