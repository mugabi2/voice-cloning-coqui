"use client";

import { FormEvent, useMemo, useState } from "react";

type GenerationResult = {
  audioUrl: string;
  downloadName: string;
  chunkCount: number;
};

const languageOptions = [
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

const initialText = `Bonjour, merci d'avoir pris le temps d'ecouter ce message.`;

export function GeneratorForm() {
  const [language, setLanguage] = useState("fr");
  const [text, setText] = useState(initialText);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedLanguage = useMemo(
    () => languageOptions.find((option) => option.value === language)?.label,
    [language],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!audioFile) {
      setError("Please upload a sermon audio file.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus("Preparing the reference sample and sending the request to Coqui...");

    if (result?.audioUrl) {
      URL.revokeObjectURL(result.audioUrl);
      setResult(null);
    }

    const formData = new FormData();
    formData.set("language", language);
    formData.set("text", text);
    formData.set("audio", audioFile);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(body?.error ?? "Generation failed.");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = disposition.match(/filename="(.+?)"/i);
      const chunkCount = Number(response.headers.get("x-coqui-chunks") ?? "1");

      setResult({
        audioUrl,
        downloadName: filenameMatch?.[1] ?? "coqui-output.wav",
        chunkCount,
      });
      setStatus("Audio generated successfully.");
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Generation failed.";

      setError(message);
      setStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Generate Audio</h2>

        <form className="grid" onSubmit={handleSubmit}>
          <div className="grid two">
            <div className="field">
              <label htmlFor="language">Language</label>
              <select
                id="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="audio">Sermon audio upload</label>
              <input
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
              />
              <div className="hint">
                Use a clean spoken clip with minimal music, crowd noise, or
                reverb.
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="text">Text</label>
            <textarea
              id="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the final translated text here..."
            />
          </div>

          <div className="actions">
            <button className="button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Generating..." : "Generate audio"}
            </button>
            <span className="hint">
              Selected language: <strong>{selectedLanguage}</strong>
            </span>
          </div>
        </form>
      </section>

      {(status || error || result) && (
        <section className="card">
          <h2>Result</h2>

          {status && !error && <div className="status">{status}</div>}
          {error && <div className="error">{error}</div>}

          {result && (
            <div className="success">
              <p>
                Generated successfully using {result.chunkCount} text chunk
                {result.chunkCount === 1 ? "" : "s"}.
              </p>
              <audio className="audio" controls src={result.audioUrl} />
              <div className="actions" style={{ marginTop: 12 }}>
                <a
                  className="buttonSecondary"
                  download={result.downloadName}
                  href={result.audioUrl}
                >
                  Download audio
                </a>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
