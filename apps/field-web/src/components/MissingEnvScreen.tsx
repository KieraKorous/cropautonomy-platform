// Renders when the PWA boots without required env vars. Better than the
// blank page you'd otherwise get if env.ts threw at module-eval time.

export function MissingEnvScreen({ missing }: { missing: readonly string[] }) {
  return (
    <main className="safe-top safe-bottom flex min-h-svh flex-col gap-6 bg-base-100 px-6 py-10 text-base-content">
      <header>
        <p className="text-xs uppercase tracking-wider text-warning">
          Setup required
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral">
          Field PWA isn't configured yet
        </h1>
        <p className="mt-2 text-sm text-base-content/65">
          The browser bundle loaded but {missing.length}{" "}
          environment variable{missing.length === 1 ? "" : "s"} {missing.length === 1 ? "is" : "are"} missing.
          Set them in <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">apps/field-web/.env.local</code>{" "}
          and restart the dev server.
        </p>
      </header>

      <section className="rounded-md border border-warning/30 bg-warning/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-warning">
          Missing
        </p>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-sm text-neutral">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 text-sm text-base-content/70">
        <p>
          Start from <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">apps/field-web/.env.example</code>:
        </p>
        <pre className="overflow-x-auto rounded-md border border-base-content/15 bg-base-content/[0.03] p-3 text-xs leading-relaxed text-base-content/80">
{`Copy-Item apps/field-web/.env.example apps/field-web/.env.local`}
        </pre>
        <p>
          Then fill in your Clerk publishable key and Supabase project URL +
          anon key. Full walkthrough in{" "}
          <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">
            CLERK_SETUP.md
          </code>{" "}
          at the repo root.
        </p>
      </section>

      <footer className="mt-auto rounded-md border border-base-content/10 bg-base-100 p-4 text-xs text-base-content/55">
        Vite reads env vars only at startup. After editing{" "}
        <code className="rounded bg-base-content/[0.06] px-1 py-0.5">.env.local</code>,
        stop and restart{" "}
        <code className="rounded bg-base-content/[0.06] px-1 py-0.5">pnpm dev:field</code>.
      </footer>
    </main>
  );
}
