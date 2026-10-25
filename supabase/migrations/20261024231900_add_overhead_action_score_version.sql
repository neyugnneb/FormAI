alter table public.shot_analyses
  drop constraint shot_analyses_target_match_version_check,
  add constraint shot_analyses_target_match_version_check
    check (
      target_match_version in (
        'target_match_v1',
        'golf_putt_v1',
        'overhead_action_v1'
      )
    );
