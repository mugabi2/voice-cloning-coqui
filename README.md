# Coqui Voice Cloning

Next.js frontend + Dockerized GPU backend for voice cloning with Coqui XTTS v2.

## What It Does

- Choose `French` or `Spanish`
- Paste final text
- Upload sermon audio
- Generate one downloadable audio file

## Architecture

```
Your PC (Next.js localhost:3000)  →  GPU Machine (Docker container :5001)
```

The frontend sends the audio file + text to the GPU container over HTTP. The container handles reference extraction, text chunking, XTTS v2 inference, and audio concatenation internally. Returns a single WAV.

## Prerequisites

- Node.js `20+`
- A running Coqui GPU container (see `gpu-services/coqui/`)

## Frontend Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and set the GPU server URL:

```bash
copy .env.example .env.local
```

3. Edit `.env.local` — set `COQUI_URL` to your GPU server address:

```
COQUI_URL=http://<gpu-ip>:5001
```

4. Start the app:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## GPU Container Setup

See `gpu-services/coqui/` for the Dockerfile and server code.

On the GPU machine:

```bash
cd gpu-services
docker compose up coqui
```

First run downloads XTTS v2 model weights (~4 GB). Subsequent runs use the cached volume.

## Environment Variables

- `COQUI_URL` — URL of the GPU container (default: `http://localhost:5001`)
- `COQUI_REQUEST_TIMEOUT_MS` — Request timeout in milliseconds (default: `180000`)
