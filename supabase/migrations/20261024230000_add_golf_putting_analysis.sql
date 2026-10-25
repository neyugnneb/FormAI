alter table public.shot_analyses
  alter column shooting_arm drop not null,
  alter column elbow_angle_degrees drop not null,
  alter column elbow_wrist_horizontal_offset_arm_length_ratio drop not null,
  alter column wrist_set_point_above_shoulder_arm_length_ratio drop not null,
  add column sport_metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sport_metrics) = 'object');

alter table public.shot_analyses
  drop constraint shot_analyses_target_match_version_check,
  add constraint shot_analyses_target_match_version_check
    check (target_match_version in ('target_match_v1', 'golf_putt_v1'));
