import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

REFERENCE_SAMPLE_SECONDS = int(os.getenv("REFERENCE_SAMPLE_SECONDS", "15"))
REFERENCE_SAMPLE_RATE = 24000
MAX_CHUNK_LENGTH = 320
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

logger = logging.getLogger("coqui-gpu")
model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    from TTS.api import TTS

    logger.info("Loading %s onto GPU …", MODEL_NAME)
    model = TTS(MODEL_NAME, gpu=True)
    logger.info("Model ready.")
    yield
    model = None


app = FastAPI(title="Coqui XTTS v2 GPU Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "gpu": torch.cuda.is_available(),
    }


def detect_extension(filename: str, content_type: str) -> str:
    ext = Path(filename).suffix
    if ext:
        return ext

    mime_map = {
        "mpeg": ".mp3",
        "wav": ".wav",
        "ogg": ".ogg",
        "webm": ".webm",
        "mp4": ".m4a",
    }
    for key, value in mime_map.items():
        if key in content_type:
            return value
    return ".bin"


def extract_reference(input_path: str, output_path: str) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-vn",
            "-t",
            str(REFERENCE_SAMPLE_SECONDS),
            "-ac",
            "1",
            "-ar",
            str(REFERENCE_SAMPLE_RATE),
            output_path,
        ],
        check=True,
        capture_output=True,
    )


def concatenate_wavs(input_paths: list[str], output_path: str) -> None:
    if len(input_paths) == 1:
        shutil.copy2(input_paths[0], output_path)
        return

    concat_list = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    try:
        for p in input_paths:
            concat_list.write(f"file '{p}'\n")
        concat_list.close()

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_list.name,
                "-acodec",
                "pcm_s16le",
                "-ar",
                str(REFERENCE_SAMPLE_RATE),
                "-ac",
                "1",
                output_path,
            ],
            check=True,
            capture_output=True,
        )
    finally:
        os.unlink(concat_list.name)


def chunk_text(text: str, max_length: int = MAX_CHUNK_LENGTH) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_length:
        return [cleaned]

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        if not sentence:
            continue

        candidate = f"{current} {sentence}" if current else sentence

        if len(candidate) <= max_length:
            current = candidate
            continue

        if current:
            chunks.append(current)

        if len(sentence) <= max_length:
            current = sentence
            continue

        words = sentence.split(" ")
        word_chunk = ""
        for word in words:
            word_candidate = f"{word_chunk} {word}" if word_chunk else word
            if len(word_candidate) <= max_length:
                word_chunk = word_candidate
                continue
            if word_chunk:
                chunks.append(word_chunk)
            word_chunk = word

        current = word_chunk

    if current:
        chunks.append(current)

    return chunks


@app.post("/synthesize")
async def synthesize(
    language: str = Form(...),
    text: str = Form(...),
    audio: UploadFile = File(...),
):
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded yet.")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text must not be empty.")

    work_dir = tempfile.mkdtemp(prefix="coqui-gpu-")

    try:
        ext = detect_extension(audio.filename or "upload.wav", audio.content_type or "")
        input_path = os.path.join(work_dir, f"input{ext}")
        with open(input_path, "wb") as f:
            f.write(await audio.read())

        ref_path = os.path.join(work_dir, "reference.wav")
        try:
            extract_reference(input_path, ref_path)
        except subprocess.CalledProcessError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"ffmpeg failed to process the uploaded audio: {exc.stderr.decode(errors='replace')}",
            )

        chunks = chunk_text(text)
        if not chunks:
            raise HTTPException(status_code=400, detail="No usable text after cleaning.")

        chunk_paths: list[str] = []
        for i, chunk in enumerate(chunks):
            chunk_wav_path = os.path.join(work_dir, f"chunk-{i}.wav")
            wav = model.tts(
                text=chunk,
                speaker_wav=ref_path,
                language=language,
            )
            wav_np = np.array(wav, dtype=np.float32)
            sf.write(chunk_wav_path, wav_np, REFERENCE_SAMPLE_RATE)
            chunk_paths.append(chunk_wav_path)

        output_path = os.path.join(work_dir, f"output-{uuid.uuid4()}.wav")
        concatenate_wavs(chunk_paths, output_path)

        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename=f"{language}-output.wav",
            headers={"X-Coqui-Chunks": str(len(chunks))},
            background=None,
        )

    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.exception("Synthesis failed")
        raise HTTPException(status_code=500, detail=str(exc))

