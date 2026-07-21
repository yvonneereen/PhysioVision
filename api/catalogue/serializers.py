from rest_framework import serializers

from .models import Calibration, Exercise, Prescription


class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Exercise
        fields = [
            'id', 'name', 'category', 'camera_direction', 'rep_rule',
            'default_sets', 'default_reps', 'default_hold_seconds', 'default_days_per_week',
            'phase_confirmation_ms', 'max_cues',
            'tracking_notes', 'tracking_warning',
            'tracked_angles_config', 'phases_config', 'cues_config',
            'calibration_config', 'symmetry_config', 'stage_images',
            'is_active', 'sort_order',
        ]


class PrescriptionSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source='exercise.name', read_only=True)

    class Meta:
        model  = Prescription
        fields = [
            'id', 'exercise', 'exercise_name', 'clinician',
            'sets', 'reps', 'hold_seconds', 'days_per_week', 'notes',
            'is_active', 'valid_from', 'valid_until',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'clinician', 'created_at', 'updated_at']


class CalibrationSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source='exercise.name', read_only=True)

    class Meta:
        model  = Calibration
        fields = [
            'id', 'exercise', 'exercise_name', 'version', 'affected_side',
            'captured_at', 'start_measurements', 'target_measurements',
            'phase_ranges', 'natural_knee_difference', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'version', 'created_at', 'updated_at']
