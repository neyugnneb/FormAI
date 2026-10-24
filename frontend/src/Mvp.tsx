
import { useEffect, useRef, useState } from 'react'

const SPORTS = [
  { name: 'Basketball', emoji: '🏀' },
  { name: 'Golf', emoji: '⛳' },
  { name: 'Tennis', emoji: '🎾' },
  { name: 'Baseball', emoji: '⚾' },
  { name: 'Volleyball', emoji: '🏐' },
] as const
type Sport = (typeof SPORTS)[number]['name']

type ShotMetrics = {
  shooting_arm: string
  elbow_angle_degrees: number
  wrist_release_angle_estimate_degrees: number | null
  stance_width_to_shoulder_width: number | null
  knee_flexion_at_deepest_point_degrees: number | null
  knee_angle_at_dip_degrees: number | null
  knee_extension_range_degrees: number | null
  wrist_peak_after_knee_extension_seconds: number | null
  elbow_wrist_horizontal_offset_arm_length_ratio: number
  wrist_set_point_above_shoulder_arm_length_ratio: number
  hip_drift_arm_length_ratio: number | null
  follow_through_hold_seconds: number | null
  frames_with_pose: number
  measurement_notes: string[]
}

type CoachingFeedback = {
  summary: string
  strengths: string[]
  improvements: {
    aspect: string
    observation: string
    drill: string
  }[]
}

type AnalysisResponse = {
  metrics: ShotMetrics
  feedback: CoachingFeedback
  video_url: string
}

function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (typeof value !== 'object' || value === null) return false
  if (!('metrics' in value) || typeof value.metrics !== 'object' || value.metrics === null) return false
  if (!('feedback' in value) || typeof value.feedback !== 'object' || value.feedback === null) return false
  if (!('video_url' in value) || typeof value.video_url !== 'string') return false

  const metrics = value.metrics
  const feedback = value.feedback
  return (
    'shooting_arm' in metrics &&
    typeof metrics.shooting_arm === 'string' &&
    'elbow_angle_degrees' in metrics &&
    typeof metrics.elbow_angle_degrees === 'number' &&
    'wrist_release_angle_estimate_degrees' in metrics &&
    (typeof metrics.wrist_release_angle_estimate_degrees === 'number' ||
      metrics.wrist_release_angle_estimate_degrees === null) &&
    'stance_width_to_shoulder_width' in metrics &&
    (typeof metrics.stance_width_to_shoulder_width === 'number' ||
      metrics.stance_width_to_shoulder_width === null) &&
    'knee_flexion_at_deepest_point_degrees' in metrics &&
    (typeof metrics.knee_flexion_at_deepest_point_degrees === 'number' ||
      metrics.knee_flexion_at_deepest_point_degrees === null) &&
    'knee_angle_at_dip_degrees' in metrics &&
    (typeof metrics.knee_angle_at_dip_degrees === 'number' ||
      metrics.knee_angle_at_dip_degrees === null) &&
    'knee_extension_range_degrees' in metrics &&
    (typeof metrics.knee_extension_range_degrees === 'number' ||
      metrics.knee_extension_range_degrees === null) &&
    'wrist_peak_after_knee_extension_seconds' in metrics &&
    (typeof metrics.wrist_peak_after_knee_extension_seconds === 'number' ||
      metrics.wrist_peak_after_knee_extension_seconds === null) &&
    'elbow_wrist_horizontal_offset_arm_length_ratio' in metrics &&
    typeof metrics.elbow_wrist_horizontal_offset_arm_length_ratio === 'number' &&
    'wrist_set_point_above_shoulder_arm_length_ratio' in metrics &&
    typeof metrics.wrist_set_point_above_shoulder_arm_length_ratio === 'number' &&
    'hip_drift_arm_length_ratio' in metrics &&
    (typeof metrics.hip_drift_arm_length_ratio === 'number' ||
      metrics.hip_drift_arm_length_ratio === null) &&
    'follow_through_hold_seconds' in metrics &&
    (typeof metrics.follow_through_hold_seconds === 'number' ||
      metrics.follow_through_hold_seconds === null) &&
    'frames_with_pose' in metrics &&
    typeof metrics.frames_with_pose === 'number' &&
    'measurement_notes' in metrics &&
    Array.isArray(metrics.measurement_notes) &&
    metrics.measurement_notes.every((note) => typeof note === 'string') &&
    'summary' in feedback &&
    typeof feedback.summary === 'string' &&
    'strengths' in feedback &&
    Array.isArray(feedback.strengths) &&
    feedback.strengths.every((item) => typeof item === 'string') &&
    'improvements' in feedback &&
    Array.isArray(feedback.improvements) &&
    feedback.improvements.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'aspect' in item &&
        typeof item.aspect === 'string' &&
        'observation' in item &&
        typeof item.observation === 'string' &&
        'drill' in item &&
        typeof item.drill === 'string',
    ) &&
    value.video_url.startsWith('/api/pose/video/')
  )
}

export default function Mvp() {
  const [sport, setSport] = useState<Sport>('Basketball')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [annotatedVideoUrl, setAnnotatedVideoUrl] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<ShotMetrics | null>(null)
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const analysisId = useRef(0)
  const videoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!videoFile) {
      setVideoUrl(null)
      return
    }

    const url = URL.createObjectURL(videoFile)
    setVideoUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [videoFile])

  useEffect(() => {
    return () => {
      if (annotatedVideoUrl) URL.revokeObjectURL(annotatedVideoUrl)
    }
  }, [annotatedVideoUrl])

  function handleVideoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    const currentAnalysisId = ++analysisId.current

    setVideoFile(file)
    setAnnotatedVideoUrl(null)
    setMetrics(null)
    setFeedback(null)
    setError(null)
    setIsAnalyzing(false)

    if (file) {
      void analyzeVideo(file, sport, currentAnalysisId)
    }
  }

  function handleSportSelect(selectedSport: Sport) {
    analysisId.current += 1
    setSport(selectedSport)
    setVideoFile(null)
    setVideoUrl(null)
    setAnnotatedVideoUrl(null)
    setMetrics(null)
    setFeedback(null)
    setError(null)
    setIsAnalyzing(false)
    if (videoInput.current) videoInput.current.value = ''
  }

  async function analyzeVideo(
    file: File,
    sport: Sport,
    currentAnalysisId: number,
  ) {
    setIsAnalyzing(true)
    setError(null)

    const formData = new FormData()
    formData.append('video', file)
    formData.append('sport', sport)

    try {
      const response = await fetch('/api/pose', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const responseText = await response.text()
        let detail: string | null = null
        try {
          const result: unknown = JSON.parse(responseText)
          if (
            typeof result === 'object' &&
            result !== null &&
            'detail' in result &&
            typeof result.detail === 'string'
          ) {
            detail = result.detail
          }
        } catch {
          detail = null
        }
        throw new Error(
          detail ??
            `Pose detection failed (HTTP ${response.status}). Check that the backend is running.`,
        )
      }

      let result: unknown
      try {
        result = await response.json() as unknown
      } catch {
        throw new Error(
          'Pose detection service returned an invalid response. Check that the backend is running.',
        )
      }

      if (!isAnalysisResponse(result)) {
        throw new Error('Pose detection service returned incomplete analysis data.')
      }
      if (currentAnalysisId !== analysisId.current) return
      setMetrics(result.metrics)
      setFeedback(result.feedback)

      const videoResponse = await fetch(result.video_url)
      if (!videoResponse.ok) {
        throw new Error('Could not load the annotated video.')
      }
      if (!videoResponse.headers.get('content-type')?.includes('video/mp4')) {
        throw new Error('Annotated video service returned an unexpected response.')
      }
      const annotatedVideo = await videoResponse.blob()
      if (annotatedVideo.size === 0) {
        throw new Error('Pose detection returned an empty video.')
      }
      if (currentAnalysisId !== analysisId.current) return
      setAnnotatedVideoUrl(URL.createObjectURL(annotatedVideo))
    } catch (requestError) {
      if (currentAnalysisId !== analysisId.current) return
      setError(
        requestError instanceof Error
          ? requestError.message === 'Failed to fetch'
            ? 'Could not connect to the pose detection service. Start the backend and try again.'
            : requestError.message
          : 'Could not connect to the pose detection service.',
      )
    } finally {
      if (currentAnalysisId === analysisId.current) {
        setIsAnalyzing(false)
      }
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="text-3xl font-medium">Upload a video</h1>
      <fieldset className="w-full space-y-3">
        <legend className="mb-3 text-left font-medium">
          Choose the sport you want to improve at
        </legend>
        <div className="grid grid-cols-5 gap-3">
          {SPORTS.map((option) => {
            const isSelected = sport === option.name
            return (
              <button
                key={option.name}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSportSelect(option.name)}
                className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 px-4 py-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50 text-gray-950'
                    : 'border-gray-300 bg-white text-gray-800 hover:border-purple-400 hover:bg-purple-50/50'
                }`}
              >
                <span aria-hidden="true" className="text-4xl">
                  {option.emoji}
                </span>
                <span className="text-base font-semibold">{option.name}</span>
              </button>
            )
          })}
        </div>
        <span className="text-sm">
          Basketball shot-form analysis is currently available for basketball.
        </span>
      </fieldset>
      <label className="flex cursor-pointer flex-col gap-2">
        <span>Select a video to analyze</span>
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          onChange={handleVideoChange}
          className="cursor-pointer"
        />
      </label>
      {videoUrl && (
        <div className="relative w-full max-w-xl">
          <video
            key={annotatedVideoUrl ?? videoUrl}
            src={annotatedVideoUrl ?? videoUrl}
            controls
            className="block w-1/2"
          >
            Your browser does not support video playback.
          </video>
        </div>
      )}
      {isAnalyzing && <p role="status">Analyzing video…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {metrics && feedback && (
        <section className="w-full max-w-xl space-y-4 text-left">
          <h2 className="text-2xl font-medium">Basketball shot feedback</h2>
          <p>{feedback.summary}</p>
          <div>
            <h3 className="font-medium">Measured mechanics</h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Metric
                label={`${metrics.shooting_arm} elbow angle at highest wrist position (not confirmed set/release)`}
                value={`${metrics.elbow_angle_degrees}°`}
              />
              <Metric
                label="Stance width / shoulder width"
                value={formatMetric(metrics.stance_width_to_shoulder_width, '×')}
              />
              <Metric
                label="Knee angle at dip"
                value={formatMetric(metrics.knee_angle_at_dip_degrees, '°')}
              />
              <Metric
                label="Knee angle range"
                value={formatMetric(metrics.knee_extension_range_degrees, '°')}
              />
              <Metric
                label="Wrist peak after knee extension peak"
                value={formatMetric(
                  metrics.wrist_peak_after_knee_extension_seconds,
                  ' s',
                )}
              />
              <Metric
                label="Elbow-to-wrist horizontal offset / arm length"
                value={`${metrics.elbow_wrist_horizontal_offset_arm_length_ratio}×`}
              />
              <Metric
                label="Wrist-to-shoulder height difference at arm peak / arm length"
                value={`${metrics.wrist_set_point_above_shoulder_arm_length_ratio}×`}
              />
              <Metric
                label="Hip drift across clip / arm length"
                value={formatMetric(metrics.hip_drift_arm_length_ratio, '×')}
              />
              <Metric
                label="Follow-through hold near wrist peak"
                value={formatMetric(metrics.follow_through_hold_seconds, ' s')}
              />
              <Metric
                label="Wrist ascent angle (not ball launch angle)"
                value={formatMetric(
                  metrics.wrist_release_angle_estimate_degrees,
                  '°',
                )}
              />
            </dl>
          </div>
          <details>
            <summary className="cursor-pointer font-medium">
              General jump-shot reference ranges
            </summary>
            <p className="pt-2 text-sm">
              These are broad coaching references, not requirements. Shot
              distance, player build, and individual mechanics can change what
              works. Only the knee angle at dip is compared with a measured
              value; the other events or objects are not reliably detected.
            </p>
            <ul className="list-disc space-y-1 pl-6 pt-2 text-sm">
              <li>
                Knee angle at dip: about 100–120°; longer shots may use a
                deeper dip and free throws a shallower one.
                {metrics.knee_angle_at_dip_degrees === null
                  ? ' Not enough visible pose data to compare.'
                  : ` Measured ${metrics.knee_angle_at_dip_degrees}° — ${metrics.knee_angle_at_dip_degrees >= 100 && metrics.knee_angle_at_dip_degrees <= 120 ? 'within' : 'outside'} this reference range.`}
              </li>
              <li>
                Elbow angle at set point: about 80–100° — the app does not
                reliably identify the ball set point.
              </li>
              <li>
                Elbow alignment: within about 10–15° of the shoulder-to-basket
                line — the basket and that 3D alignment are not tracked.
              </li>
              <li>
                Release height: at or above eye/forehead level — eye and
                forehead landmarks are not measured.
              </li>
              <li>
                Elbow angle at release: about 165–180° — the ball-release frame
                is not identified, so the measured arm-raise angle is not
                comparable.
              </li>
              <li>
                Ball launch angle: about 48–55° for a free throw or 45–52° for
                a jump shot — the ball is not tracked.
              </li>
              <li>
                Release timing: at or just before jump peak — ball release and
                jump peak are not measured.
              </li>
            </ul>
          </details>
          <details>
            <summary className="cursor-pointer font-medium">
              Measurement limits
            </summary>
            <ul className="list-disc space-y-1 pl-6 pt-2 text-sm">
              {metrics.measurement_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
          {feedback.strengths.length > 0 && (
            <div>
              <h3 className="font-medium">Strengths</h3>
              <ul className="list-disc pl-6">
                {feedback.strengths.map((strength) => (
                  <li key={strength}>{strength}</li>
                ))}
              </ul>
            </div>
          )}
          {feedback.improvements.map((item) => (
            <article key={item.aspect}>
              <h3 className="font-medium">{item.aspect}</h3>
              <p>{item.observation}</p>
              <p>
                <strong>Try:</strong> {item.drill}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function formatMetric(value: number | null, unit: string) {
  return value === null ? 'Not enough visible pose data' : `${value}${unit}`
}