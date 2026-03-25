import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  chunkText,
  concatenateAudioFiles,
  createWorkingDirectory,
  extractReferenceSample,
  persistUploadedAudio,
  removeWorkingDirectory,
  writeChunkAudio,
} from "@/lib/audio";
import {
  assertCoquiServerAvailable,
  getCoquiConfig,
  synthesizeChunk,
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

  const parsed = requestSchema.safeParse({
    language,
    text,
  });

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
  let workingDirectory: string | null = null;

  try {
    await assertCoquiServerAvailable(config);

    workingDirectory = await createWorkingDirectory();

    const uploadedAudioPath = await persistUploadedAudio(audio, workingDirectory);
    const referenceSamplePath = await extractReferenceSample(
      uploadedAudioPath,
      workingDirectory,
      config.voiceSampleSeconds,
    );
    const chunks = chunkText(parsed.data.text);

    if (chunks.length === 0) {
      return toJsonError("Please paste French or Spanish text.");
    }

    const outputChunkPaths: string[] = [];

    for (const [index, chunk] of chunks.entries()) {
      const chunkAudio = await synthesizeChunk({
        baseUrl: config.baseUrl,
        text: chunk,
        languageId: parsed.data.language,
        speakerWavPath: referenceSamplePath,
        timeoutMs: config.timeoutMs,
      });

      const chunkPath = await writeChunkAudio(chunkAudio, workingDirectory, index);
      outputChunkPaths.push(chunkPath);
    }

    const outputPath = await concatenateAudioFiles(outputChunkPaths, workingDirectory);
    const outputBuffer = await readFile(outputPath);
    const outputName = `${parsed.data.language}-${path.basename(outputPath)}`;

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "X-Coqui-Chunks": String(chunks.length),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio generation failed.";
    const status = /not reachable|timed out/i.test(message) ? 502 : 500;

    return toJsonError(message, status);
  } finally {
    if (workingDirectory) {
      await removeWorkingDirectory(workingDirectory);
    }
  }
}
