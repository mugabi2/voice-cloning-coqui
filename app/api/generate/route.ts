import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCoquiServerAvailable,
  getCoquiConfig,
  synthesize,
} from "@/lib/coqui";

export const runtime = "nodejs";

const requestSchema = z.object({
  language: z.enum(["fr", "es"]),
  text: z
    .string()
    .trim()
    .min(1, "Please paste French or Spanish text.")
    .max(12000, "Text is too long for a single request."),
});

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name);
}

function toJsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return toJsonError("Expected multipart form data with text, language, and audio.");
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return toJsonError("Could not parse the uploaded form data.");
  }

  const language = formData.get("language");
  const text = formData.get("text");
  const audio = formData.get("audio");

  const parsed = requestSchema.safeParse({ language, text });

  if (!parsed.success) {
    return toJsonError(parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return toJsonError("Please upload a sermon audio file.");
  }

  if (!isAudioFile(audio)) {
    return toJsonError("Unsupported file type. Please upload an audio file.");
  }

  const config = getCoquiConfig();

  try {
    await assertCoquiServerAvailable(config);

    const { audioBuffer, chunkCount } = await synthesize({
      baseUrl: config.baseUrl,
      language: parsed.data.language,
      text: parsed.data.text,
      audioFile: audio,
      timeoutMs: config.timeoutMs,
    });

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": `attachment; filename="${parsed.data.language}-output.wav"`,
        "X-Coqui-Chunks": String(chunkCount),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio generation failed.";
    const status = /not reachable|timed out/i.test(message) ? 502 : 500;

    return toJsonError(message, status);
  }
}
