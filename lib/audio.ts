import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const REFERENCE_SAMPLE_RATE = "24000";

function ensureFfmpeg() {
  const configuredBinary = process.env.FFMPEG_PATH?.trim();

  if (configuredBinary) {
    return configuredBinary;
  }

  return "ffmpeg";
}

async function runFfmpeg(args: string[]) {
  const binary = ensureFfmpeg();

  await new Promise<void>((resolve, reject) => {
    const process = spawn(binary, args, {
      windowsHide: true,
    });

    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      if ("code" in error && error.code === "ENOENT") {
        reject(
          new Error(
            "ffmpeg was not found. Install ffmpeg or set FFMPEG_PATH to the ffmpeg executable.",
          ),
        );
        return;
      }

      reject(error);
    });
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || "ffmpeg failed while processing audio."));
    });
  });
}

function escapeConcatPath(filePath: string) {
  return filePath.replace(/'/g, "'\\''");
}

function detectExtension(fileName: string, mimeType: string) {
  const extension = path.extname(fileName);

  if (extension) {
    return extension;
  }

  if (mimeType.includes("mpeg")) {
    return ".mp3";
  }

  if (mimeType.includes("wav")) {
    return ".wav";
  }

  if (mimeType.includes("ogg")) {
    return ".ogg";
  }

  if (mimeType.includes("webm")) {
    return ".webm";
  }

  if (mimeType.includes("mp4")) {
    return ".m4a";
  }

  return ".bin";
}

export async function createWorkingDirectory() {
  return mkdtemp(path.join(tmpdir(), "coqui-app-"));
}

export async function persistUploadedAudio(file: File, workingDirectory: string) {
  const extension = detectExtension(file.name, file.type);
  const inputPath = path.join(workingDirectory, `input${extension}`);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(inputPath, buffer);

  return inputPath;
}

export async function extractReferenceSample(
  inputPath: string,
  workingDirectory: string,
  sampleSeconds: number,
) {
  const samplePath = path.join(workingDirectory, "reference.wav");

  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-t",
    String(sampleSeconds),
    "-ac",
    "1",
    "-ar",
    REFERENCE_SAMPLE_RATE,
    samplePath,
  ]);

  return samplePath;
}

export function chunkText(text: string, maxChunkLength = 320) {
  const cleanedText = text.replace(/\s+/g, " ").trim();

  if (!cleanedText) {
    return [];
  }

  if (cleanedText.length <= maxChunkLength) {
    return [cleanedText];
  }

  const sentences = cleanedText.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }

    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;

    if (candidate.length <= maxChunkLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (sentence.length <= maxChunkLength) {
      currentChunk = sentence;
      continue;
    }

    const words = sentence.split(" ");
    let wordChunk = "";

    for (const word of words) {
      const wordCandidate = wordChunk ? `${wordChunk} ${word}` : word;

      if (wordCandidate.length <= maxChunkLength) {
        wordChunk = wordCandidate;
        continue;
      }

      if (wordChunk) {
        chunks.push(wordChunk);
      }

      wordChunk = word;
    }

    currentChunk = wordChunk;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function writeChunkAudio(
  buffer: Buffer,
  workingDirectory: string,
  index: number,
) {
  const outputPath = path.join(workingDirectory, `chunk-${index}.wav`);

  await writeFile(outputPath, buffer);

  return outputPath;
}

export async function concatenateAudioFiles(
  inputPaths: string[],
  workingDirectory: string,
) {
  const outputPath = path.join(workingDirectory, `output-${randomUUID()}.wav`);

  if (inputPaths.length === 1) {
    const onlyFile = await readFile(inputPaths[0]);
    await writeFile(outputPath, onlyFile);
    return outputPath;
  }

  const concatDirectory = path.join(workingDirectory, "concat");
  const concatListPath = path.join(concatDirectory, "inputs.txt");
  const concatFileContents = inputPaths
    .map((filePath) => `file '${escapeConcatPath(filePath)}'`)
    .join("\n");

  await mkdir(concatDirectory, { recursive: true });
  await writeFile(concatListPath, concatFileContents, "utf8");

  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-acodec",
    "pcm_s16le",
    "-ar",
    REFERENCE_SAMPLE_RATE,
    "-ac",
    "1",
    outputPath,
  ]);

  return outputPath;
}

export async function removeWorkingDirectory(workingDirectory: string) {
  await rm(workingDirectory, { recursive: true, force: true });
}
