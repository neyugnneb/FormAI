
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  calculateGolfPuttTargetMatch,
  calculateOverheadActionTargetMatch,
  calculateShotTargetMatch,
  type ShotTargetMatchScore,
} from '../lib/shotScore'

const SPORTS = ['Basketball', 'Golf', 'Tennis', 'Baseball', 'Volleyball'] as const
type Sport = (typeof SPORTS)[number]

const SPORT_EMOJI: Record<Sport, string> = {
  Basketball: '🏀',
  Golf: '⛳',
  Tennis: '🎾',
  Baseball: '⚾',
  Volleyball: '🏐',
}

function isSport(value: string | null): value is Sport {
  return value !== null && SPORTS.some((sport) => sport === value)
}

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

type GolfPuttMetrics = {
  analysis_type: 'golf_putt'
  setup_spine_tilt_degrees: number | null
  setup_knee_flexion_degrees: number | null
  setup_elbow_angle_degrees: number | null
  wrist_path_range_body_scale: number | null
  shoulder_movement_body_scale: number | null
  frames_with_pose: number
  measurement_notes: string[]
}

type OverheadActionMetrics = {
  analysis_type: 'overhead_action'
  active_arm: 'left' | 'right'
  elbow_angle_at_highest_wrist_degrees: number
  arm_elevation_at_highest_wrist_degrees: number
  torso_lean_at_highest_wrist_degrees: number | null
  knee_flexion_range_degrees: number | null
  hip_displacement_body_widths: number | null
  frames_with_pose: number
  measurement_notes: string[]
}

type AnalysisMetrics = ShotMetrics | GolfPuttMetrics | OverheadActionMetrics

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
  sport: Sport
  metrics: AnalysisMetrics
  feedback: CoachingFeedback
  video_url: string
}

type FeedbackTab = 'strengths' | 'weaknesses' | 'training-plan' | 'statistics'

function isGolfPuttMetrics(value: unknown): value is GolfPuttMetrics {
  if (typeof value !== 'object' || value === null) return false
  return (
    'analysis_type' in value &&
    value.analysis_type === 'golf_putt' &&
    'setup_spine_tilt_degrees' in value &&
    (typeof value.setup_spine_tilt_degrees === 'number' ||
      value.setup_spine_tilt_degrees === null) &&
    'setup_knee_flexion_degrees' in value &&
    (typeof value.setup_knee_flexion_degrees === 'number' ||
      value.setup_knee_flexion_degrees === null) &&
    'setup_elbow_angle_degrees' in value &&
    (typeof value.setup_elbow_angle_degrees === 'number' ||
      value.setup_elbow_angle_degrees === null) &&
    'wrist_path_range_body_scale' in value &&
    (typeof value.wrist_path_range_body_scale === 'number' ||
      value.wrist_path_range_body_scale === null) &&
    'shoulder_movement_body_scale' in value &&
    (typeof value.shoulder_movement_body_scale === 'number' ||
      value.shoulder_movement_body_scale === null) &&
    'frames_with_pose' in value &&
    typeof value.frames_with_pose === 'number' &&
    'measurement_notes' in value &&
    Array.isArray(value.measurement_notes) &&
    value.measurement_notes.every((note) => typeof note === 'string')
  )
}

function isOverheadActionMetrics(value: unknown): value is OverheadActionMetrics {
  if (typeof value !== 'object' || value === null) return false
  return (
    'analysis_type' in value &&
    value.analysis_type === 'overhead_action' &&
    'active_arm' in value &&
    (value.active_arm === 'left' || value.active_arm === 'right') &&
    'elbow_angle_at_highest_wrist_degrees' in value &&
    typeof value.elbow_angle_at_highest_wrist_degrees === 'number' &&
    'arm_elevation_at_highest_wrist_degrees' in value &&
    typeof value.arm_elevation_at_highest_wrist_degrees === 'number' &&
    'torso_lean_at_highest_wrist_degrees' in value &&
    (typeof value.torso_lean_at_highest_wrist_degrees === 'number' ||
      value.torso_lean_at_highest_wrist_degrees === null) &&
    'knee_flexion_range_degrees' in value &&
    (typeof value.knee_flexion_range_degrees === 'number' ||
      value.knee_flexion_range_degrees === null) &&
    'hip_displacement_body_widths' in value &&
    (typeof value.hip_displacement_body_widths === 'number' ||
      value.hip_displacement_body_widths === null) &&
    'frames_with_pose' in value &&
    typeof value.frames_with_pose === 'number' &&
    'measurement_notes' in value &&
    Array.isArray(value.measurement_notes) &&
    value.measurement_notes.every((note) => typeof note === 'string')
  )
}

function isBasketballMetrics(value: unknown): value is ShotMetrics {
  if (typeof value !== 'object' || value === null) return false
  return (
    'shooting_arm' in value &&
    typeof value.shooting_arm === 'string' &&
    'elbow_angle_degrees' in value &&
    typeof value.elbow_angle_degrees === 'number' &&
    'wrist_release_angle_estimate_degrees' in value &&
    (typeof value.wrist_release_angle_estimate_degrees === 'number' ||
      value.wrist_release_angle_estimate_degrees === null) &&
    'stance_width_to_shoulder_width' in value &&
    (typeof value.stance_width_to_shoulder_width === 'number' ||
      value.stance_width_to_shoulder_width === null) &&
    'knee_flexion_at_deepest_point_degrees' in value &&
    (typeof value.knee_flexion_at_deepest_point_degrees === 'number' ||
      value.knee_flexion_at_deepest_point_degrees === null) &&
    'knee_angle_at_dip_degrees' in value &&
    (typeof value.knee_angle_at_dip_degrees === 'number' ||
      value.knee_angle_at_dip_degrees === null) &&
    'knee_extension_range_degrees' in value &&
    (typeof value.knee_extension_range_degrees === 'number' ||
      value.knee_extension_range_degrees === null) &&
    'wrist_peak_after_knee_extension_seconds' in value &&
    (typeof value.wrist_peak_after_knee_extension_seconds === 'number' ||
      value.wrist_peak_after_knee_extension_seconds === null) &&
    'elbow_wrist_horizontal_offset_arm_length_ratio' in value &&
    typeof value.elbow_wrist_horizontal_offset_arm_length_ratio === 'number' &&
    'wrist_set_point_above_shoulder_arm_length_ratio' in value &&
    typeof value.wrist_set_point_above_shoulder_arm_length_ratio === 'number' &&
    'hip_drift_arm_length_ratio' in value &&
    (typeof value.hip_drift_arm_length_ratio === 'number' ||
      value.hip_drift_arm_length_ratio === null) &&
    'follow_through_hold_seconds' in value &&
    (typeof value.follow_through_hold_seconds === 'number' ||
      value.follow_through_hold_seconds === null) &&
    'frames_with_pose' in value &&
    typeof value.frames_with_pose === 'number' &&
    'measurement_notes' in value &&
    Array.isArray(value.measurement_notes) &&
    value.measurement_notes.every((note) => typeof note === 'string')
  )
}

function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (typeof value !== 'object' || value === null) return false
  if (
    !('sport' in value) ||
    typeof value.sport !== 'string' ||
    !isSport(value.sport)
  ) return false
  if (!('metrics' in value)) return false
  if (!('feedback' in value) || typeof value.feedback !== 'object' || value.feedback === null) return false
  if (!('video_url' in value) || typeof value.video_url !== 'string') return false

  const metricsValid =
    value.sport === 'Golf'
      ? isGolfPuttMetrics(value.metrics)
      : value.sport === 'Basketball'
        ? isBasketballMetrics(value.metrics)
        : isOverheadActionMetrics(value.metrics)
  const feedback = value.feedback
  return (
    metricsValid &&
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
  const [searchParams] = useSearchParams()
  const requestedSport = searchParams.get('sport')
  const sport = isSport(requestedSport) ? requestedSport : 'Basketball'
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [annotatedVideoUrl, setAnnotatedVideoUrl] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<AnalysisMetrics | null>(null)
  const [targetMatch, setTargetMatch] = useState<ShotTargetMatchScore | null>(null)
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null)
  const [feedbackTab, setFeedbackTab] = useState<FeedbackTab>('statistics')
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const analysisId = useRef(0)

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
    setTargetMatch(null)
    setFeedback(null)
    setFeedbackTab('statistics')
    setError(null)
    setSaveMessage(null)
    setSaveFailed(false)
    setIsAnalyzing(false)

    if (file) {
      void analyzeVideo(file, sport, currentAnalysisId)
    }
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
      if (result.sport !== sport) {
        throw new Error('The analysis service returned results for a different sport.')
      }
      const score = isGolfPuttMetrics(result.metrics)
        ? calculateGolfPuttTargetMatch(result.metrics)
        : isOverheadActionMetrics(result.metrics)
          ? calculateOverheadActionTargetMatch(result.metrics)
          : calculateShotTargetMatch(result.metrics)
      setMetrics(result.metrics)
      setTargetMatch(score)
      setFeedback(result.feedback)
      setFeedbackTab('statistics')
      void saveAnalysis(
        result.metrics,
        result.feedback,
        score,
        sport,
        currentAnalysisId,
      )

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

  async function saveAnalysis(
    analysisMetrics: AnalysisMetrics,
    analysisFeedback: CoachingFeedback,
    analysisTargetMatch: ShotTargetMatchScore,
    analysisSport: Sport,
    currentAnalysisId: number,
  ) {
    if (!supabase) {
      setSaveFailed(true)
      setSaveMessage('Supabase is not configured; this analysis was not saved.')
      return
    }

    setSaveFailed(false)
    setSaveMessage('Saving analysis to your account…')
    try {
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (currentAnalysisId !== analysisId.current) return
      if (!data.user) {
        setSaveFailed(true)
        setSaveMessage('Log in to save this analysis to your account.')
        return
      }

      const analysisRow = !isBasketballMetrics(analysisMetrics)
        ? {
            frames_with_pose: analysisMetrics.frames_with_pose,
            measurement_notes: analysisMetrics.measurement_notes,
            sport_metrics: analysisMetrics,
          }
        : analysisMetrics
      const { error: insertError } = await supabase
        .from('shot_analyses')
        .insert({
          sport: analysisSport,
          ...analysisRow,
          coaching_feedback: analysisFeedback,
          target_match_score: analysisTargetMatch.score,
          target_match_components: analysisTargetMatch.components,
          target_match_version: analysisTargetMatch.version,
        })
      if (insertError) throw insertError

      if (currentAnalysisId !== analysisId.current) return
      setSaveMessage('Analysis saved to your account.')
    } catch (saveError) {
      if (currentAnalysisId === analysisId.current) {
        setSaveFailed(true)
        const errorMessage =
          typeof saveError === 'object' &&
          saveError !== null &&
          'message' in saveError &&
          typeof saveError.message === 'string'
            ? saveError.message
            : saveError instanceof Error
              ? saveError.message
              : typeof saveError === 'string'
                ? saveError
                : null
        const errorCode =
          typeof saveError === 'object' &&
          saveError !== null &&
          'code' in saveError &&
          typeof saveError.code === 'string'
            ? saveError.code
            : null
        const isSchemaError =
          errorCode === 'PGRST204' ||
          errorCode === '42703' ||
          errorCode === '23502' ||
          errorCode === '23514' ||
          (errorMessage !== null &&
            /column|schema cache|constraint|not-null/i.test(errorMessage))

        setSaveMessage(
          analysisSport !== 'Basketball' && isSchemaError
            ? `Could not save this analysis because the database schema is missing or outdated. Apply the sport-metrics migrations in supabase/migrations/ in timestamp order, then retry. Database error: ${errorMessage ?? errorCode}`
            : errorMessage
              ? `Could not save analysis: ${errorMessage}`
              : 'Could not save analysis to your account. Check your connection and Supabase session, then try again.',
        )
      }
    }
  }

  return (
    <main className="min-h-svh bg-gray-950 px-4 py-6 text-left text-white sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-9">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Back to dashboard
          </Link>
          <span className="text-lg font-semibold tracking-tight">FormAI</span>
        </header>

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/75">
            Your next rep starts here
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-3xl"
            >
              {SPORT_EMOJI[sport]}
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {sport === 'Golf'
                  ? 'Analyze your golf putting'
                  : sport === 'Volleyball'
                    ? 'Analyze your volleyball serve'
                    : sport === 'Tennis'
                      ? 'Analyze your tennis serve'
                      : sport === 'Baseball'
                        ? 'Analyze your baseball pitch'
                        : 'Analyze your basketball form'}
              </h1>
              <p className="mt-2 max-w-2xl text-white/65">
                {sport === 'Golf'
                  ? 'Upload a short clip from address through your putting stroke to review setup posture and movement proxies.'
                  : sport === 'Tennis' || sport === 'Volleyball' || sport === 'Baseball'
                    ? 'Upload a full-body side-view clip to review overhead arm and body-movement proxies.'
                    : 'Upload a practice clip to get a breakdown of your mechanics, strengths, and areas to work on.'}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-white/15 bg-white/5 p-5 sm:p-7">
            <div className="mb-5">
              <p className="text-sm font-medium text-white/75">01 / Upload</p>
              <h2 className="mt-1 text-xl font-semibold">Choose your video</h2>
              <p className="mt-1 text-sm text-white/60">
                Select a clip from your device to start the analysis.
              </p>
            </div>
            <label className="group flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-gray-900/60 px-5 py-8 text-center transition hover:border-white hover:bg-white/5 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-white">
              <span
                aria-hidden="true"
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl text-white transition group-hover:bg-white/20"
              >
                ↑
              </span>
              <span className="text-base font-semibold">
                {videoFile
                  ? 'Choose a different video'
                  : 'Select a video to get started'}
              </span>
              <span className="mt-1 text-sm text-white/55">
                Click to browse your files
              </span>
              <span className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-gray-950 transition group-hover:bg-gray-200">
                Browse videos
              </span>
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoChange}
                className="sr-only"
                aria-label={`Select a ${sport} video to analyze`}
              />
            </label>
            <p className="mt-3 text-center text-xs text-white/45">
              Your video file is not stored. Analysis metrics and feedback may be saved to your account.
            </p>
            {videoFile && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <span aria-hidden="true" className="text-xl">▶</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{videoFile.name}</p>
                  <p className="text-xs text-white/50">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-3xl border border-white/15 bg-white/5 p-5 sm:p-7">
            <p className="text-sm font-medium text-white/75">02 / Get ready</p>
            <h2 className="mt-1 text-xl font-semibold">A better clip, better cues</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              A few simple setup tips help the pose analysis read your movement.
            </p>
            <div className="mt-5 space-y-3">
              {[
                ['01', 'Keep your full body in frame'],
                ['02', 'Use a steady, side-on camera angle'],
                ['03', 'Choose a well-lit clip with clear movement'],
              ].map(([step, tip]) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <span className="text-xs font-semibold text-white/60">{step}</span>
                  <p className="text-sm text-white/80">{tip}</p>
                </div>
              ))}
            </div>
            {sport === 'Golf' && (
              <p className="mt-5 rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white/75">
                Putting feedback uses 2D body-pose estimates. The putter, ball,
                impact, and ball path are not tracked.
              </p>
            )}
            {(sport === 'Tennis' || sport === 'Volleyball' || sport === 'Baseball') && (
              <p className="mt-5 rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white/75">
                These are 2D pose estimates, not validated performance scores.
                Ball contact, release, speed, spin, and trajectory are not tracked.
              </p>
            )}
          </aside>
        </section>

        {isAnalyzing && (
          <div
            role="status"
            className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/5 p-4"
          >
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <div>
              <p className="font-medium">Analyzing your movement…</p>
              <p className="text-sm text-white/60">
                This can take a little while. Keep this page open.
              </p>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-2xl border border-white/25 bg-white/10 p-4 text-white">
            {error}
          </p>
        )}

        {videoUrl && (
          <section className="space-y-4 rounded-3xl border border-white/15 bg-white/5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white/75">03 / Review</p>
              <h2 className="mt-1 text-xl font-semibold">
                {annotatedVideoUrl ? 'Your analyzed video' : 'Video preview'}
              </h2>
            </div>
            {annotatedVideoUrl && (
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white">
                Analysis complete
              </span>
            )}
          </div>
          <video
            key={annotatedVideoUrl ?? videoUrl}
            src={annotatedVideoUrl ?? videoUrl}
            controls
            className="mx-auto block max-h-[70vh] w-full rounded-2xl bg-black object-contain"
          >
            Your browser does not support video playback.
          </video>
          {annotatedVideoUrl && (
            <p className="text-sm text-white/55">
              Pose landmarks are overlaid on the analyzed clip. Review the feedback below.
            </p>
          )}
          </section>
        )}
        {feedback && (
          <section className="w-full space-y-5 rounded-3xl bg-white p-4 text-left text-gray-950 shadow-xl sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-gray-600">
                Your coaching report
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Analysis results</h2>
            </div>
            {saveMessage && (
              <p
                role={saveFailed ? 'alert' : 'status'}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  saveFailed
                    ? 'bg-gray-200 text-gray-950'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {saveMessage}
              </p>
            )}
          </div>
          <div className="flex overflow-x-auto border-b border-gray-200" aria-label="Shot feedback" role="tablist">
            {([
              ['statistics', 'Statistics'],
              ['strengths', 'Strengths'],
              ['weaknesses', 'Weaknesses'],
              ['training-plan', 'Training Plan'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                id={`feedback-tab-${tab}`}
                type="button"
                role="tab"
                aria-selected={feedbackTab === tab}
                aria-controls="feedback-tab-panel"
                onClick={() => setFeedbackTab(tab)}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:px-6 sm:text-base ${
                  feedbackTab === tab
                    ? 'border-gray-950 text-gray-950'
                    : 'border-transparent text-gray-500 hover:text-gray-950'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="feedback-tab-panel"
            role="tabpanel"
            aria-labelledby={`feedback-tab-${feedbackTab}`}
            tabIndex={0}
            className="min-h-24"
          >
            {feedbackTab === 'strengths' && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Strengths</h2>
                <p className="text-sm text-gray-600">
                  Positive observations from the pose-based analysis.
                </p>
                {feedback.strengths.length > 0 ? (
                  <div className="space-y-4">
                    {feedback.strengths.map((strength, index) => (
                      <div
                        key={`${index}-${strength}`}
                        className="rounded-xl border border-gray-200 p-4"
                      >
                        <p>{strength}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>
                    The analysis did not identify a clear strength in this clip.
                  </p>
                )}
              </div>
            )}
            {feedbackTab === 'weaknesses' && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Areas to improve</h2>
                {feedback.improvements.length > 0 ? (
                  <ul className="space-y-4">
                    {feedback.improvements.map((item, index) => (
                      <li
                        key={`${index}-${item.aspect}`}
                        className="rounded-xl border border-gray-200 p-4"
                      >
                        <h3 className="font-medium">{item.aspect}</h3>
                        <p className="mt-1">{item.observation}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>The analysis did not identify a specific area to improve.</p>
                )}
              </div>
            )}
            {feedbackTab === 'training-plan' && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Training Plan</h2>
                <p className="text-sm text-gray-600">
                  Practice the suggested drill for each identified area. Recheck
                  your form as you practice.
                </p>
                {feedback.improvements.length > 0 ? (
                  <div className="space-y-4">
                    {feedback.improvements.map((item, index) => (
                      <article
                        key={`${index}-${item.aspect}`}
                        className="rounded-xl border border-gray-200 p-4"
                      >
                        <h3 className="font-medium">{item.aspect}</h3>
                        <p className="mt-1 text-sm text-gray-600">
                          Focus: {item.observation}
                        </p>
                        <p className="mt-2">
                          <strong>Drill:</strong> {item.drill}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>
                    No weaknesses were identified, so there are no targeted
                    drills to add from this analysis.
                  </p>
                )}
              </div>
            )}
            {feedbackTab === 'statistics' && metrics && targetMatch && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Statistics</h2>
                {saveMessage && (
                  <p
                    role={saveFailed ? 'alert' : 'status'}
                    className={saveFailed ? 'text-gray-800' : 'text-sm text-gray-600'}
                  >
                    {saveMessage}
                  </p>
                )}
                <p>{feedback.summary}</p>
                <div className="rounded-xl border border-gray-300 p-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-medium">Target-match score</h3>
                    <p className="text-2xl font-semibold">
                      {targetMatch.score === null ? '—' : `${targetMatch.score}%`}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Equal-weight average of available pose proxies against
                    broad comparison ranges. Values inside a range score 100%;
                    points decrease linearly outside it. This is not a
                    validated measure of performance.
                    {sport !== 'Basketball' &&
                      ' Comparison ranges are broad illustrative pose references, not universal coaching standards or validated performance measures.'}
                  </p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {targetMatch.components.map((component) => (
                      <Metric
                        key={component.key}
                        label={`${component.label} (${component.targetMin}–${component.targetMax}${component.unit})`}
                        value={
                          component.score === null
                            ? 'Not enough pose data'
                            : `${component.value}${component.unit.trim()} · ${component.score}%`
                        }
                      />
                    ))}
                  </dl>
                </div>
                <div>
                  <h3 className="font-medium">Measured mechanics</h3>
                  <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {isGolfPuttMetrics(metrics) ? (
                      <>
                        <Metric
                          label="Setup spine tilt from vertical (first second)"
                          value={formatMetric(metrics.setup_spine_tilt_degrees, '°')}
                        />
                        <Metric
                          label="Setup knee flexion (first second)"
                          value={formatMetric(metrics.setup_knee_flexion_degrees, '°')}
                        />
                        <Metric
                          label="Setup elbow angle (first second)"
                          value={formatMetric(metrics.setup_elbow_angle_degrees, '°')}
                        />
                        <Metric
                          label="Wrist path range across clip / body scale"
                          value={formatMetric(metrics.wrist_path_range_body_scale, '×')}
                        />
                        <Metric
                          label="Shoulder movement across clip / body scale"
                          value={formatMetric(metrics.shoulder_movement_body_scale, '×')}
                        />
                        <Metric
                          label="Frames with detected pose"
                          value={`${metrics.frames_with_pose}`}
                        />
                      </>
                    ) : isOverheadActionMetrics(metrics) ? (
                      <>
                        <Metric
                          label={`${metrics.active_arm} arm elbow angle at highest wrist position (not confirmed release)`}
                          value={`${metrics.elbow_angle_at_highest_wrist_degrees}°`}
                        />
                        <Metric
                          label="Arm elevation at highest wrist position"
                          value={`${metrics.arm_elevation_at_highest_wrist_degrees}°`}
                        />
                        <Metric
                          label="Torso lean at highest wrist position"
                          value={formatMetric(metrics.torso_lean_at_highest_wrist_degrees, '°')}
                        />
                        <Metric
                          label="Knee flexion range during clip"
                          value={formatMetric(metrics.knee_flexion_range_degrees, '°')}
                        />
                        <Metric
                          label="Hip displacement / shoulder width across clip"
                          value={formatMetric(metrics.hip_displacement_body_widths, '×')}
                        />
                        <Metric
                          label="Frames with detected pose"
                          value={`${metrics.frames_with_pose}`}
                        />
                      </>
                    ) : (
                      <>
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
                          value={formatMetric(metrics.wrist_peak_after_knee_extension_seconds, ' s')}
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
                          value={formatMetric(metrics.wrist_release_angle_estimate_degrees, '°')}
                        />
                      </>
                    )}
                  </dl>
                  {(isGolfPuttMetrics(metrics) ||
                    isOverheadActionMetrics(metrics)) && (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4">
                      <h4 className="font-medium">Measurement limits</h4>
                      <div className="mt-2 space-y-2">
                        {metrics.measurement_notes.map((note) => (
                          <p key={note} className="text-sm text-gray-600">{note}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </section>
        )}
      </div>
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