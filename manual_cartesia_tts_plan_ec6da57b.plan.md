---
name: Manual Coqui TTS Plan
overview: Build a separate minimal local test app for hosted Coqui voice cloning and TTS. The app will have no login or database, just a simple web form to choose language, paste French or Spanish text, upload sermon audio, and generate downloadable speech.
todos:
  - id: build-minimal-ui
    content: Create a one-page local web interface with language selection, pasted text input, sermon audio upload, and a generate button.
    status: completed
  - id: implement-coqui-backend
    content: Add a backend endpoint that validates inputs, extracts a short voice sample, sends it to hosted Coqui voice cloning and TTS endpoints, and returns audio.
    status: completed
  - id: support-long-text
    content: Chunk long pasted text for Coqui TTS when needed and concatenate the returned audio into one downloadable file.
    status: completed
  - id: document-local-setup
    content: Document the local-only setup, required hosted Coqui configuration, and expected failure cases for testing.
    status: completed
isProject: false
---

# Standalone Coqui Test App Plan

## Recommendation

Use a minimal `Next.js` web app for this test.

Why this is the best fit:

- Fastest way to get a simple interface running locally.
- Easy single-page form UI.
- Easy file upload handling and server-side API route for hosted Coqui calls.
- No login, database, or deployment requirements for v1.

This should be a separate app in the other location you mentioned, not a change to the earlier sermon pipeline.

## Goal

Build a small local test app that lets you:

- choose `French` or `Spanish`
- paste the final text
- upload a sermon audio file to use as the clone reference
- click `Generate`
- preview or download the generated audio

## Simple Interface

Single page only, no auth.

Recommended fields:

- `Language` dropdown with `French` and `Spanish`
- `Text` textarea for the final translated text
- `Audio upload` input for the sermon voice file
- `Generate audio` button
- Result section with an audio player and download link
- Small status/error area for validation and API failures

## Backend Flow

When the user clicks `Generate`:

1. Submit the form to a single backend route.
2. Validate that language, text, audio file, and hosted Coqui credentials are available.
3. Read the uploaded sermon audio.
4. Extract and normalize the first 10-30 seconds as the reference voice sample.
5. Create or condition a hosted Coqui `XTTS` voice using that reference sample.
6. Chunk the pasted text if it is long or if the hosted synthesis endpoint handles the full text poorly.
7. Run Coqui TTS for each chunk using the same cloned or conditioned voice.
8. Concatenate the audio chunks if chunking is used.
9. Return one final audio file to the UI for playback/download.

## Scope Choices

For this test app, keep it intentionally simple:

- No login
- No database
- No sermon records
- No approval workflow
- No saved clone history in v1

Important simplification:

- For v1, process each request independently using the uploaded sermon audio as the reference source for the hosted Coqui voice flow.
- If testing shows repeated voice setup is too slow or expensive, add a lightweight local cache later using the uploaded file hash.

## Tech Shape

Suggested structure for the separate app:

- `app/page.tsx`: single-page form UI
- `app/api/generate/route.ts`: upload + preprocessing + hosted Coqui voice cloning and TTS endpoint
- `lib/coqui.ts`: Coqui helper functions for hosted voice cloning and speech synthesis requests
- `lib/audio.ts`: sample extraction, normalization, and chunk concatenation helpers
- `.env.local`: hosted Coqui configuration

## Prerequisites For Implementation

- `Node.js` and a package manager for the `Next.js` app.
- A hosted Coqui account with API access and a bearer token.
- Confirmed hosted endpoint access for voice cloning and speech generation.
- `.env.local` support for hosted Coqui credentials and request settings.
- An HTTP client that supports `multipart/form-data`, bearer authentication, and redirect or binary audio download handling.
- Audio tooling for preprocessing and merging:
  - keep or add an `ffmpeg`-based path if the app trims uploaded sermon audio and concatenates results locally.
- Good reference audio:
  - clean speech
  - minimal background music or noise
  - minimal reverb
  - enough spoken content to extract a stable sample
- Confirm language support for the chosen hosted Coqui model. `XTTS` is the right fit for `French` and `Spanish`.
- Operational expectations for the hosted provider:
  - request size limits
  - latency and timeouts
  - rate limits
  - temporary file cleanup for uploaded sermon audio

## Environments

Required:

- `COQUI_API_TOKEN`

Optional:

- `COQUI_BASE_URL=https://app.coqui.ai/api/v2`
- `COQUI_MODEL_NAME=xtts`
- `COQUI_VOICE_SAMPLE_SECONDS=15`
- `COQUI_REQUEST_TIMEOUT_MS`

No other API keys are required for this app.

## Failure Behavior

- Missing text: show `Please paste French or Spanish text`.
- Missing audio: show `Please upload a sermon audio file`.
- Missing token: show `Coqui is not configured`.
- Voice-clone failure: return an explicit Coqui error.
- Invalid or poor-quality reference audio: return a clear Coqui reference error.
- TTS failure on a chunk: stop and return which part failed.
- Unsupported file type: return a clear upload validation error.
- Upstream timeout or service error: return a clear hosted Coqui failure.
- Unsupported language or model setup: return a clear synthesis error.

## Test Plan

- Paste French text, upload sermon audio, and generate a playable file.
- Paste Spanish text, upload the same sermon audio, and generate a playable file.
- Use a long text sample and confirm chunking still returns one final audio file.
- Confirm errors are clear when text, audio, or token is missing.
- Confirm the app returns a clear error when the hosted Coqui request fails or times out.
- Confirm voice quality is acceptable from sermon-derived reference audio.

## Notes

- Because this plan uses hosted Coqui, it should not require local GPU or local model hosting.
- If the hosted synthesis endpoint handles longer text well, chunking can remain available but does not have to be mandatory in every request.

Because the current workspace is empty, this plan is intentionally framework-level and targeted at a new standalone app in the other location. Once you point me at that folder, the next step is to turn this into an exact file-by-file implementation plan or start building it.