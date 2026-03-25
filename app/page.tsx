import { GeneratorForm } from "@/components/generator-form";

export default function HomePage() {
  return (
    <main className="page">
      <div className="shell">
        <section className="hero">
          <h1>Coqui Voice Cloning Test</h1>
          <p>
            Upload a sermon voice sample, paste the final text, and generate a
            downloadable file through your local Coqui server.
          </p>
        </section>

        <GeneratorForm />

        <section className="card">
          <h2>Prerequisites</h2>
          <ul className="list">
            <li>Run a local Coqui server before using this page.</li>
            <li>
              Install Python and the Coqui server package from the GitHub-based
              project instructions.
            </li>
            <li>
              Keep <code>ffmpeg</code> support available for trimming and
              concatenating audio.
            </li>
            <li>
              Use French or Spanish text to match the language selected above.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
