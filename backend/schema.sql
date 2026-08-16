-- ReOpSy data spine
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create table if not exists public.topics (
  slug        text primary key,
  label       text not null,
  blurb       text,
  sort_order  int  not null default 100,
  active      boolean not null default true
);

insert into public.topics (slug, label, blurb, sort_order) values
  ('ml',            'Machine Learning',           'Learning theory, optimisation, architectures',                 10),
  ('dl',            'Deep Learning',              'Neural networks, deep architectures, representation learning',   20),
  ('nlp',           'Language & NLP',             'Language models, parsing, translation',                        30),
  ('cv',            'Computer Vision',            'Recognition, generation, 3D, video',                           40),
  ('ai-health',     'AI in Mental Health',        'Clinical applications, mental health, psychiatry',             50),
  ('llm',           'Large Language Models',      'Foundational models, alignment, prompting',                    60),
  ('robotics',      'Robotics & Control',         'Autonomous systems, manipulation, control theory',             70),
  ('cybersecurity', 'Cybersecurity & AI',         'Adversarial robustness, threat detection, privacy',            80),
  ('data-science',  'Data Science',               'Statistical learning, analytics, data mining',                 90),
  ('bio',           'Computational Biology',      'Genomics, protein structure, bioinformatics',                  100)
on conflict (slug) do update
  set label = excluded.label,
      blurb = excluded.blurb,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- papers
--
-- license_ok is the copyright-risk gate. It is true only when the source
-- declares an open licence that permits reproducing the abstract verbatim
-- (CC-BY family, CC0, public domain). When it is false the app shows only the
-- machine-generated extractive summary and a link out. The app enforces this
-- again at render time, but the rule lives here first.
-- ---------------------------------------------------------------------------
create table if not exists public.papers (
  id              text primary key,          -- 'oa:W2741809807' | 'arxiv:2401.01234'
  source          text not null check (source in ('openalex', 'arxiv')),
  title           text not null,
  authors         text[] not null default '{}',
  year            int,
  venue           text,
  topics          text[] not null default '{}',
  summary         text not null,             -- extractive, <= 60 words, AI-condensed
  abstract        text,                      -- only populated when license_ok
  license         text,
  license_ok      boolean not null default false,
  doi             text,
  arxiv_id        text,
  url             text not null,
  pdf_url         text,
  cited_by_count  int,
  title_key       text not null,             -- normalised title, for dedupe
  published_at    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists papers_topics_idx      on public.papers using gin (topics);
create index if not exists papers_published_idx   on public.papers (published_at desc nulls last);
create index if not exists papers_title_trgm_idx  on public.papers using gin (title gin_trgm_ops);
create unique index if not exists papers_title_key_idx on public.papers (title_key);
create index if not exists papers_doi_idx         on public.papers (doi) where doi is not null;
create index if not exists papers_arxiv_idx       on public.papers (arxiv_id) where arxiv_id is not null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists papers_touch_updated_at on public.papers;
create trigger papers_touch_updated_at
  before update on public.papers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- ingest_runs  (operational log; how you find out the nightly job died)
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  topics       text[] not null default '{}',
  fetched      int not null default 0,
  inserted     int not null default 0,
  updated      int not null default 0,
  skipped      int not null default 0,
  ok           boolean not null default false,
  error        text
);

create index if not exists ingest_runs_started_idx on public.ingest_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The app is anonymous and read-only. Writes happen exclusively through the
-- service_role key from the ingest job, which bypasses RLS by design.
-- ---------------------------------------------------------------------------
alter table public.papers      enable row level security;
alter table public.topics      enable row level security;
alter table public.ingest_runs enable row level security;

drop policy if exists papers_anon_read on public.papers;
create policy papers_anon_read
  on public.papers for select
  to anon, authenticated
  using (true);

drop policy if exists topics_anon_read on public.topics;
create policy topics_anon_read
  on public.topics for select
  to anon, authenticated
  using (active);

-- ingest_runs stays private: no anon policy, so anon sees nothing.

-- ---------------------------------------------------------------------------
-- A convenience view the app can page through.
-- ---------------------------------------------------------------------------
create or replace view public.papers_feed as
  select id, source, title, authors, year, venue, topics, summary,
         case when license_ok then abstract else null end as abstract,
         license, license_ok, doi, arxiv_id, url, pdf_url,
         cited_by_count, published_at
  from public.papers
  order by published_at desc nulls last, cited_by_count desc nulls last;
