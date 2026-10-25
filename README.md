# FormAI

## Save shot analyses to Supabase

Run the SQL in
[`supabase/migrations/20261024201100_create_shot_analyses.sql`](./supabase/migrations/20261024201100_create_shot_analyses.sql)
and then
[`supabase/migrations/20261024201600_add_shot_target_match_score.sql`](./supabase/migrations/20261024201600_add_shot_target_match_score.sql)
in the Supabase Dashboard SQL Editor, in order. For golf putting, tennis,
volleyball, and baseball analyses, also run
[`supabase/migrations/20261024230000_add_golf_putting_analysis.sql`](./supabase/migrations/20261024230000_add_golf_putting_analysis.sql)
and
[`supabase/migrations/20261024231900_add_overhead_action_score_version.sql`](./supabase/migrations/20261024231900_add_overhead_action_score_version.sql)
in order. The migrations create one `shot_analyses` row per analysis, store
pose-derived proxy values and coaching feedback, and restrict each
authenticated user to their own rows with row-level security. Sport-specific
metrics are stored in `sport_metrics`; video files are not stored in this table.

The analysis page saves results only when a user is logged in. It displays and
saves a target-match percentage based on the available knee dip angle, knee
extension range, wrist peak timing after knee extension, elbow angle at peak
wrist height, and wrist height relative to upper-arm length. These broad
comparisons are equally weighted; values inside a target range receive 100%,
and values outside lose points linearly with distance, reaching 0% one full
target-range width beyond the range. Missing measurements are omitted and the
remaining components are averaged. This is a versioned, illustrative target
match—not a validated shooting-quality score. Golf, tennis, volleyball, and
baseball use separate versioned proxy comparisons; these are illustrative
tracking aids, not validated performance scores. Camera- and clip-dependent
proxies and ball/club events the app cannot detect are excluded.

## Supabase authentication

The `/auth` page supports email/password sign-up and login. Copy
`frontend/.env.example` to `frontend/.env.local` and set the Supabase project URL
and publishable key from your Supabase project settings. These `VITE_` values
are included in the browser bundle, so use only the public publishable/anon key;
never put a Supabase service-role key in the frontend.

Configure the Supabase Auth site URL and allowed redirect URLs for your local
and deployed frontend origins. If email confirmation is enabled, users will be
asked to confirm their address before logging in. After changing environment
variables, restart the Vite dev server.

## Run pose detection locally

The `/mvp` page sends a selected video to a local MediaPipe Pose API. The API
processes every decoded video frame and returns an MP4 with detected body
joints drawn directly onto each frame. Basketball analysis estimates
shot-related posture and movement proxies; golf putting estimates setup
posture and movement; tennis and volleyball serve and baseball pitch analyses
estimate overhead arm and body movement. Gemini receives only those metrics,
not the video, and returns sport-specific coaching feedback with drills.

These are approximate 2D pose estimates, not validated performance measures.
The system does not track the ball or sports equipment, or measure ball contact,
release, speed, spin, accuracy, or trajectory. Broad comparison ranges and
composite scores are illustrative and vary by athlete, camera angle, and clip.
Processing every frame takes longer for higher-frame-rate videos. Uploaded and
generated files are temporary.
The annotated video is served through a one-time playback URL and is removed
after it is fetched; unused results expire after 15 minutes.

Set a Gemini API key in the backend terminal before starting the API:

```sh
export GEMINI_API_KEY="your-api-key"
```

The model defaults to `gemini-3.5-flash-lite`; override it with `GEMINI_MODEL` if desired.
Install and start the backend from the project root:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m uvicorn main:app --app-dir backend --reload
```

In another terminal, start the frontend:

```sh
cd frontend
npm run dev
```

The starter API limits uploads to 100 MB and videos to two minutes. It is intended
for local development; add authentication and stricter resource limits before
exposing it to other users.