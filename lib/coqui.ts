const DEFAULT_BASE_URL = "http://localhost:5001";
const DEFAULT_TIMEOUT_MS = 180000;

type CoquiConfig = {
  baseUrl: string;
  timeoutMs: number;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function getCoquiConfig(): CoquiConfig {
  const timeoutMs = Number(process.env.COQUI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  return {
    baseUrl: normalizeBaseUrl(process.env.COQUI_URL ?? DEFAULT_BASE_URL),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
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
    const response = await fetch(`${config.baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Coqui GPU server responded with ${response.status}.`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out while contacting the Coqui GPU server.");
    }

    throw new Error("Coqui GPU server is not reachable. Make sure the container is running.");
  } finally {
    clearTimeout(timeout);
  }
}

type SynthesizeInput = {
  baseUrl: string;
  language: string;
  text: string;
  audioFile: File;
  timeoutMs: number;
};

export async function synthesize({
  baseUrl,
  language,
  text,
  audioFile,
  timeoutMs,
}: SynthesizeInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const formData = new FormData();
  formData.set("language", language);
  formData.set("text", text);
  formData.set("audio", audioFile);

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/synthesize`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorMessage = await readErrorBody(response);
      throw new Error(
        `Coqui synthesis failed (${response.status}): ${errorMessage}`,
      );
    }

    const chunkCount = Number(response.headers.get("x-coqui-chunks") ?? "1");
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return { audioBuffer, chunkCount };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out while waiting for the Coqui GPU server response.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
