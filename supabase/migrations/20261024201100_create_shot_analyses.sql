create table public.shot_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  sport text not null default 'Basketball',
  shooting_arm text not null check (shooting_arm in ('left', 'right')),
  elbow_angle_degrees numeric not null,
  wrist_release_angle_estimate_degrees numeric,
  stance_width_to_shoulder_width numeric,
  knee_flexion_at_deepest_point_degrees numeric,
  knee_angle_at_dip_degrees numeric,
  knee_extension_range_degrees numeric,
  wrist_peak_after_knee_extension_seconds numeric,
  elbow_wrist_horizontal_offset_arm_length_ratio numeric not null,
  wrist_set_point_above_shoulder_arm_length_ratio numeric not null,
  hip_drift_arm_length_ratio numeric,
  follow_through_hold_seconds numeric,
  frames_with_pose integer not null check (frames_with_pose > 0),
  measurement_notes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(measurement_notes) = 'array'),
  coaching_feedback jsonb not null
    check (jsonb_typeof(coaching_feedback) = 'object'),
  created_at timestamptz not null default now()
);

create index shot_analyses_user_created_at_idx
  on public.shot_analyses (user_id, created_at desc);

alter table public.shot_analyses enable row level security;

revoke all on public.shot_analyses from anon;
grant select, insert, delete on public.shot_analyses to authenticated;

create policy "Users can read their own shot analyses"
  on public.shot_analyses
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own shot analyses"
  on public.shot_analyses
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own shot analyses"
  on public.shot_analyses
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
