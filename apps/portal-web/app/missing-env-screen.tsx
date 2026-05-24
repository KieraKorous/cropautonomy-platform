// Renders when the portal boots without Clerk env. Bypasses <ClerkProvider>
// entirely so we don't trigger Clerk's "keyless mode" path, which currently
// trips a Turbopack server-actions check in Clerk 6.36 (one of its keyless
// helpers isn't async and lives next to a "use server" file).

export function MissingEnvScreen({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-svh flex-col gap-6 bg-base-100 px-6 py-10 text-base-content sm:px-12">
      <header className="max-w-3xl">
        <p className="text-xs uppercase tracking-wider text-warning">
          Setup required
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral">
          Portal isn&rsquo;t configured yet
        </h1>
        <p className="mt-2 text-sm text-base-content/65">
          The portal needs a Clerk publishable key + secret to mount the auth
          provider. Set the variables below in{" "}
          <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">
            apps/portal-web/.env.local
          </code>{" "}
          and restart the dev server.
        </p>
      </header>

      <section className="max-w-3xl rounded-md border border-warning/30 bg-warning/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-warning">
          Missing
        </p>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-sm text-neutral">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </section>

      <section className="flex max-w-3xl flex-col gap-3 text-sm text-base-content/70">
        <p>Start from the example file:</p>
        <pre className="overflow-x-auto rounded-md border border-base-content/15 bg-base-content/[0.03] p-3 text-xs leading-relaxed text-base-content/80">
{`Copy-Item apps/portal-web/.env.example apps/portal-web/.env.local`}
        </pre>
        <p>
          Then fill the Clerk publishable + secret keys from your Clerk
          dashboard (the same instance the field PWA uses). Full walkthrough
          in{" "}
          <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">
            CLERK_SETUP.md
          </code>{" "}
          at the repo root.
        </p>
      </section>

      <footer className="mt-auto max-w-3xl rounded-md border border-base-content/10 bg-base-100 p-4 text-xs text-base-content/55">
        Next.js reads <code className="rounded bg-base-content/[0.06] px-1 py-0.5">.env.local</code>{" "}
        only at startup. After editing, stop and restart{" "}
        <code className="rounded bg-base-content/[0.06] px-1 py-0.5">pnpm dev:portal</code>.
      </footer>
    </main>
  );
}
