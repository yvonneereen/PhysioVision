"""Generate spoken guidance without allowing AI to alter safety wording."""

import base64
import io
import wave

from django.conf import settings


class GuidanceSpeechUnavailable(RuntimeError):
    """Raised when the configured speech provider cannot render guidance."""


LOCALE_NAMES = {
    'en': 'English',
    'zh': 'Mandarin Chinese',
    'ms': 'Malay',
    'ta': 'Tamil',
}


def _pcm_to_wav(pcm_audio):
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24000)
        wav_file.writeframes(pcm_audio)
    return output.getvalue()


def generate_guidance_speech(text, locale='en-SG'):
    """Return base64 WAV audio that recites ``text`` exactly.

    Gemini controls delivery only. It is explicitly forbidden from adding,
    removing or changing words, so medical and safety decisions remain in the
    application's deterministic pathways.
    """
    transcript = ' '.join(str(text).split())
    if not transcript or len(transcript) > 700:
        raise GuidanceSpeechUnavailable('Invalid spoken-guidance transcript.')
    if not settings.GEMINI_API_KEY:
        raise GuidanceSpeechUnavailable('Speech provider is not configured.')

    language = LOCALE_NAMES.get(str(locale).split('-', 1)[0].lower(), 'English')
    delivery_instruction = (
        f'Recite the transcript below exactly in {language}. '
        'Use a warm, clear, natural adult female voice. Speak conversationally '
        'at a moderate pace with steady, audible volume and gentle phrasing. '
        'Do not sound theatrical, elderly, breathy, raspy, robotic or monotone. '
        'Do not add, remove, paraphrase or explain any words.\n\n'
        f'Transcript: {transcript}'
    )

    try:
        from google import genai

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        interaction = client.interactions.create(
            model=settings.GEMINI_TTS_MODEL,
            input=delivery_instruction,
            response_format={'type': 'audio'},
            generation_config={
                'speech_config': [
                    {'voice': settings.GEMINI_TTS_VOICE},
                ],
            },
        )
        audio_data = getattr(getattr(interaction, 'output_audio', None), 'data', None)
        if not audio_data:
            raise GuidanceSpeechUnavailable('Speech provider returned no audio.')
        pcm_audio = base64.b64decode(audio_data, validate=True)
        wav_audio = _pcm_to_wav(pcm_audio)
    except GuidanceSpeechUnavailable:
        raise
    except Exception as exc:
        raise GuidanceSpeechUnavailable('Speech generation failed.') from exc

    return {
        'audio': base64.b64encode(wav_audio).decode('ascii'),
        'mime_type': 'audio/wav',
        'provider': 'gemini_tts',
    }
