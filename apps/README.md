# Apps

## CropAutonomy

Path: `apps/cropautonomy-web`

Local dev:

```powershell
corepack pnpm dev:cropautonomy
```

Expected URL:

```text
http://localhost:3000
```

## GaiaBots

Path: `apps/gaiabots-web`

Local dev:

```powershell
corepack pnpm dev:gaiabots
```

Expected URL:

```text
http://localhost:3001
```

## Lead Capture

Both apps post to `/api/leads`.

Required environment variables are listed in each app's `.env.example`.

Lead capture is designed to:

- insert a durable record into Supabase table `public_leads`
- send a Resend email notification

Apply the migration at `packages/db/migrations/0001_public_leads.sql` before enabling production lead capture.
