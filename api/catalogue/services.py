from django.db.models import Q
from django.utils import timezone

from api.core.models import (
    CarePath,
    PatientPathwayChoice,
    WellnessScreeningStatus,
)

from .models import Prescription


def active_prescriptions_queryset():
    """Return prescriptions that are active for today's programme."""
    today = timezone.localdate()
    return Prescription.objects.filter(
        is_active=True,
        valid_from__lte=today,
    ).filter(
        Q(valid_until__isnull=True) | Q(valid_until__gte=today)
    )


def active_prescriptions_for(patient):
    if not patient.primary_clinician_id:
        return Prescription.objects.none()
    return active_prescriptions_queryset().filter(
        patient=patient,
        clinician_id=patient.primary_clinician_id,
    )


def active_prescriptions_by(clinician):
    """Return the programmes this clinician and their current roster share."""
    return active_prescriptions_queryset().filter(
        clinician=clinician,
        patient__primary_clinician=clinician,
    )


def sync_patient_care_path(patient):
    if active_prescriptions_for(patient).exists():
        next_path = CarePath.CLINICIAN
    elif patient.pathway_choice == PatientPathwayChoice.PHYSIOTHERAPIST:
        next_path = CarePath.CLINICIAN
    elif patient.primary_clinician_id:
        next_path = CarePath.NEEDS_REVIEW
    elif patient.pathway_choice == PatientPathwayChoice.WELLNESS:
        next_path = (
            CarePath.NEEDS_REVIEW
            if (
                patient.wellness_screening_status
                == WellnessScreeningStatus.NEEDS_REVIEW
            )
            else CarePath.WELLNESS
        )
    elif (
        patient.wellness_screening_status
        == WellnessScreeningStatus.ELIGIBLE
    ):
        next_path = CarePath.WELLNESS
    else:
        # Until the patient answers the pathway question, preserve the stored
        # path. The frontend blocks plan access and asks for this choice.
        next_path = patient.care_path

    if patient.care_path != next_path:
        patient.care_path = next_path
        patient.save(update_fields=["care_path", "updated_at"])
    return next_path
