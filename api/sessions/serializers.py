from rest_framework import serializers

from .models import PainCheckin, Session


class SessionSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source='exercise.name', read_only=True)

    class Meta:
        model  = Session
        fields = [
            'id', 'exercise', 'exercise_name', 'prescription', 'calibration',
            'started_at', 'ended_at', 'duration_seconds',
            'sets_completed', 'reps_completed', 'reps_target', 'sets_target',
            'affected_side', 'quality_score', 'pain_level', 'notes',
            'cues_triggered', 'symmetry_warnings_count', 'low_confidence_frames_pct',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'duration_seconds', 'created_at', 'updated_at']


class PainCheckinSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PainCheckin
        fields = [
            'id', 'session', 'pain_level', 'location_notes', 'checked_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
