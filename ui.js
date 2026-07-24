import {
  hasSavedProfile,
  loadProfile,
  saveProfile,
} from "./personalization.js";
import {
  buildConservativeWellnessPlan,
  evaluateWellnessScreening,
  WELLNESS_SCREENING_KEYS,
} from "./wellness-screening.js";
import { isLoggedIn } from "./api.js";

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
  const toast = document.getElementById("toast");
  const wellnessEligibleOutcome = document.getElementById("wellnessEligibleOutcome");
  const wellnessReviewOutcome = document.getElementById("wellnessReviewOutcome");
  const wellnessReviewReasons = document.getElementById("wellnessReviewReasons");
  const generatedWellnessPlan = document.getElementById("generatedWellnessPlan");
  let activeModal = null;
  let previousFocus = null;
  let planStep = 1;
  let activeWellnessPlan = null;
  let toastTimer;
  let authenticatedRole = null;

  window.addEventListener("physiovision:auth-role", (event) => {
    authenticatedRole = event.detail?.role ?? null;
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
      if (hasSavedProfile()) {
        const savedProfile = loadProfile();
        fillFormFromProfile(planForm, savedProfile);
        fillWellnessScreening(planForm, savedProfile.wellnessScreening);
      }
      showPlanStep(1);
    } else if (id === "profile-modal") {
      fillFormFromProfile(profileForm, loadProfile());
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
      const patientOnly =
        modalId === "plan-modal" || modalId === "profile-modal";

      if (patientOnly && !isLoggedIn()) {
        document.getElementById("authTabLogin")?.click();
        modalId = "auth-modal";
      } else if (patientOnly && authenticatedRole === "clinician") {
        modalId = "therapist-view";
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
      summary.textContent = `Based on your confirmed wellness pathway${
        age ? ` at age ${age}` : ""
      }, this conservative routine focuses on ${plan.goal.toLowerCase()}.`;
    }
  }

  planForm?.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      if (planStep === 2) {
        const formData = new FormData(planForm);
        if (!validatePlanStep(planSteps[1])) return;
        const screening = evaluateWellnessScreening(
          readWellnessScreening(formData)
        );
        saveProfile({
          carePath:
            screening.status === "eligible" ? "wellness" : "needs_review",
          wellnessScreening: screening,
        });
        renderWellnessOutcome(screening);
        if (screening.status !== "eligible") {
          showPlanStep(4);
          return;
        }
      }

      if (planStep === 3) {
        if (!validatePlanStep(planSteps[2])) return;
        const formData = new FormData(planForm);
        const goal = formData.get("goal") || "moving with confidence";
        const age = formData.get("age");
        saveProfile({
          name: formData.get("name"),
          age,
          goal,
          activity: formData.get("activity"),
          focusSide: formData.get("focusSide"),
          cueStyle: formData.get("cueStyle"),
          carePath: "wellness",
        });
        renderWellnessPlan(
          buildConservativeWellnessPlan(String(goal)),
          age
        );
        renderWellnessOutcome({ status: "eligible" });
      }
      showPlanStep(planStep + 1);
    });
  });

  planForm?.querySelectorAll("[data-prev-step]").forEach((button) => {
    button.addEventListener("click", () => showPlanStep(planStep - 1));
  });

  document.querySelector("[data-start-plan]")?.addEventListener("click", () => {
    const firstExerciseId = activeWellnessPlan?.days?.[0]?.exerciseIds?.[0];
    const exerciseSelect = document.getElementById("exerciseSelect");
    if (firstExerciseId && exerciseSelect) {
      exerciseSelect.value = firstExerciseId;
      exerciseSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    closeModal();
    document.getElementById("practice")?.scrollIntoView({ behavior: "smooth" });
  });

  document.querySelector("[data-review-screening]")?.addEventListener("click", () => {
    showPlanStep(2);
  });

  profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const formData = new FormData(profileForm);
    saveProfile(Object.fromEntries(formData.entries()));
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

  document.querySelectorAll(".date-options, .time-options").forEach((group) => {
    group.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        group.querySelectorAll("button").forEach((item) => {
          item.classList.toggle("selected", item === button);
        });
      });
    });
  });

  document.getElementById("confirmBooking")?.addEventListener("click", () => {
    closeModal();
    window.clearTimeout(toastTimer);
    toast?.classList.add("show");
    toastTimer = window.setTimeout(() => toast?.classList.remove("show"), 4500);
  });

  document.querySelectorAll(".therapist-sidebar nav button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".therapist-sidebar nav button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    });
  });
})();
