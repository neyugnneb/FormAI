alter table public.shot_analyses
  add column target_match_score numeric
    check (target_match_score between 0 and 100),
  add column target_match_components jsonb not null default '[]'::jsonb
    check (jsonb_typeof(target_match_components) = 'array'),
  add column target_match_version text not null default 'target_match_v1'
    check (target_match_version = 'target_match_v1');
