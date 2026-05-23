create table if not exists public.public_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('cropautonomy.com', 'gaiabots.ai')),
  name text not null,
  email text not null,
  organization text,
  interest text not null check (
    interest in (
      'farm_or_grower',
      'agricultural_business',
      'research_institution',
      'robotics_collaborator',
      'investor_or_partner',
      'technical_contributor',
      'other'
    )
  ),
  message text,
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.public_leads enable row level security;

create index if not exists public_leads_source_created_at_idx
  on public.public_leads (source, created_at desc);

create index if not exists public_leads_email_idx
  on public.public_leads (email);
