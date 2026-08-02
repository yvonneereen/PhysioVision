from rest_framework import serializers

from .models import CareMessage, Consultation, Escalation, MessageSender


class ConsultationSerializer(serializers.ModelSerializer):
    clinician_name = serializers.SerializerMethodField()
    patient_name   = serializers.SerializerMethodField()

    class Meta:
        model  = Consultation
        fields = [
            'id', 'clinician', 'clinician_name', 'patient', 'patient_name',
            'scheduled_at', 'duration_minutes', 'status', 'initiated_by',
            'patient_notes', 'clinician_notes', 'video_link',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'clinician', 'clinician_name', 'patient', 'patient_name',
            'status', 'initiated_by', 'clinician_notes', 'video_link',
            'created_at', 'updated_at',
        ]

    def get_clinician_name(self, obj):
        return str(obj.clinician.user)

    def get_patient_name(self, obj):
        return obj.patient.user.get_full_name().strip() or obj.patient.user.email


class CareMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model  = CareMessage
        fields = [
            'id', 'patient', 'clinician', 'sender', 'sender_name', 'body',
            'read_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'patient', 'clinician', 'sender', 'sender_name', 'read_at',
            'created_at',
        ]

    def get_sender_name(self, obj):
        user = obj.patient.user if obj.sender == MessageSender.PATIENT else obj.clinician.user
        return user.get_full_name().strip() or user.email


class EscalationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Escalation
        fields = [
            'id', 'patient', 'clinician', 'trigger_type', 'description',
            'session', 'status', 'reviewed_at', 'reviewed_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'patient', 'trigger_type', 'description', 'session', 'created_at', 'updated_at']
