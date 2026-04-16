import os
import tempfile
import whisper
import torch
from fastapi import UploadFile
from fastapi.responses import Response
from elevenlabs.client import ElevenLabs

eleven_client = ElevenLabs(api_key=os.getenv("ELEVEN_API_KEY"))

# Laad Whisper model eenmalig bij opstarten
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_model = whisper.load_model("small", device=device)


async def speech_to_text(audio_bestand: UploadFile) -> str:
    """Ontvang een audiobestand en zet het om naar tekst via Whisper."""
    inhoud = await audio_bestand.read()

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(inhoud)
        tmp_pad = tmp.name

    try:
        resultaat = whisper_model.transcribe(tmp_pad, language="nl")
        tekst = resultaat["text"].strip()
    finally:
        os.unlink(tmp_pad)

    return tekst


def text_to_speech(tekst: str) -> Response:
    """Zet tekst om naar spraak via ElevenLabs en geef het terug als audio."""
    audio_stream = eleven_client.text_to_speech.convert(
        voice_id=os.getenv("ELEVEN_VOICE_ID"),
        text=tekst,
        model_id="eleven_multilingual_v2",
    )
    audio_bytes = b"".join(audio_stream)

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=ana.mp3"},
    )
