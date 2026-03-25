# Coqui Voice Cloning Test App

Minimal local Next.js app for testing voice cloning with a self-hosted Coqui server.

## What It Does

- choose `French` or `Spanish`
- paste final text
- upload sermon audio
- generate one downloadable audio file

## Prerequisites

- Node.js `20+`
- Python `>= 3.9, < 3.12`
- A local Coqui server running from the GitHub-based Coqui project

## Start The Coqui Server

One straightforward setup is:

```bash
pip install "coqui-tts[server]"
tts-server --model_name tts_models/multilingual/multi-dataset/xtts_v2
```

The app sends requests to the Coqui demo server at `http://127.0.0.1:5002` by default.

## App Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file:

```bash
copy .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

- `COQUI_BASE_URL`
  Default: `http://127.0.0.1:5002`
- `COQUI_VOICE_SAMPLE_SECONDS`
  Default: `15`
- `COQUI_REQUEST_TIMEOUT_MS`
  Default: `120000`
- `FFMPEG_PATH`
  Optional explicit path to `ffmpeg.exe` when `ffmpeg` is not available on PATH

## Notes

- The backend trims the uploaded audio into a short mono WAV reference sample before sending it to Coqui.
- Long text is chunked and the generated audio is concatenated into one output file.
- The demo server is suitable for local testing, not production traffic.
- Clean spoken reference audio works best.
- If you installed `ffmpeg` through Conda, starting `npm run dev` from the same activated environment should make it available automatically.
