# FormAI

## Run pose detection locally

The `/mvp` page sends a selected video to a local MediaPipe Pose API. The API
processes every decoded video frame, returns an MP4 with detected body joints
drawn directly onto each frame, and calculates approximate stance, knee bend
and extension, elbow/wrist alignment, wrist height and motion, body drift, and
follow-through-hold measurements. Gemini receives only those measurements—not
the video—and returns coaching feedback with drills. These are 2D pose
estimates: the system does not track the ball, basket, guide-hand push, finger
direction, backspin, or whether the follow-through is held until the ball
reaches the rim. The UI includes broad jump-shot reference ranges and compares
the measured knee angle at the dip against 100–120°; other reference values
are shown as context only because their events or objects are not reliably
detected. These ranges vary by shot distance and player. Processing every frame
takes longer for higher-frame-rate videos. Uploaded and generated files are
temporary.
The annotated video is served through a one-time playback URL and is removed
after it is fetched; unused results expire after 15 minutes.

Set a Gemini API key in the backend terminal before starting the API:

```sh
export GEMINI_API_KEY="your-api-key"
```

The model defaults to `gemini-flash-latest`; override it with `GEMINI_MODEL` if desired.
The current shot-form metrics are basketball-specific; other sports in the
selector are not yet supported by the analysis endpoint.

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