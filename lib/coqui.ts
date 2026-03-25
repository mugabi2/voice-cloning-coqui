const DEFAULT_BASE_URL = "http://127.0.0.1:5002";
const DEFAULT_TIMEOUT_MS = 120000;

type CoquiConfig = {
  baseUrl: string;
  timeoutMs: number;
  voiceSampleSeconds: number;
};

type SynthesizeChunkInput = {
  baseUrl: string;
  text: string;
  languageId: string;
  speakerWavPath: string;
  timeoutMs: number;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function getCoquiConfig(): CoquiConfig {
  const timeoutMs = Number(process.env.COQUI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const voiceSampleSeconds = Number(process.env.COQUI_VOICE_SAMPLE_SECONDS ?? 15);

  return {
    baseUrl: normalizeBaseUrl(process.env.COQUI_BASE_URL ?? DEFAULT_BASE_URL),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    voiceSampleSeconds:
      Number.isFinite(voiceSampleSeconds) && voiceSampleSeconds > 0
        ? voiceSampleSeconds
        : 15,
  };
}

async function readErrorBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string; error?: string }
      | null;

    return body?.detail ?? body?.error ?? response.statusText;
  }

  const text = await response.text().catch(() => "");
  return text || response.statusText;
}

export async function assertCoquiServerAvailable(config: CoquiConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 5000));

  try {
    const response = await fetch(config.baseUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Coqui server responded with ${response.status}.`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out while contacting the Coqui server.");
    }

    throw new Error("Coqui server is not reachable. Make sure it is running.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function synthesizeChunk({
  baseUrl,
  text,
  languageId,
  speakerWavPath,
  timeoutMs,
}: SynthesizeChunkInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const body = new URLSearchParams({
    text,
    "speaker-wav": speakerWavPath,
    "language-id": languageId,
  });

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "audio/wav",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorMessage = await readErrorBody(response);
      throw new Error(
        `Coqui synthesis failed (${response.status}): ${errorMessage}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out while waiting for the Coqui server response.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
