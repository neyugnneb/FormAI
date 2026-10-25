import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SPORTS = ['Basketball', 'Golf', 'Tennis', 'Baseball', 'Volleyball'] as const
type Sport = (typeof SPORTS)[number]

type AnalysisPoint = {
  id: string
  createdAt: string
  score: number
}

type AnalysisRow = {
  id: string
  created_at: string
  target_match_score: number | null
}

const CHART = {
  width: 900,
  height: 390,
  left: 68,
  right: 28,
  top: 24,
  bottom: 88,
}

const Y_TICKS = [0, 20, 40, 60, 80, 100]

function Dashboard() {
  const [sport, setSport] = useState<Sport>('Basketball')
  const [points, setPoints] = useState<AnalysisPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const latestScore = points.at(-1)?.score
  const bestScore = points.length > 0 ? Math.max(...points.map((point) => point.score)) : null
  const averageScore =
    points.length > 0
      ? Math.round(points.reduce((total, point) => total + point.score, 0) / points.length)
      : null

  useEffect(() => {
    let isCurrent = true

    async function loadAnalyses() {
      setIsLoading(true)
      setError(null)
      setPoints([])

      if (!supabase) {
        setError('Supabase is not configured. Add the frontend environment variables and restart the app.')
        setIsLoading(false)
        return
      }

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!authData.user) {
          navigate('/auth?mode=login', { replace: true })
          return
        }

        const { data, error: queryError } = await supabase
          .from('shot_analyses')
          .select('id, created_at, target_match_score')
          .eq('sport', sport)
          .not('target_match_score', 'is', null)
          .order('created_at', { ascending: true })

        if (queryError) throw queryError
        if (!isCurrent) return

        const rows = (data ?? []) as AnalysisRow[]
        setPoints(
          rows.flatMap((row) =>
            typeof row.target_match_score === 'number' &&
            Number.isFinite(row.target_match_score)
              ? [{
                  id: row.id,
                  createdAt: row.created_at,
                  score: row.target_match_score,
                }]
              : [],
          ),
        )
      } catch (loadError) {
        if (!isCurrent) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load your saved analysis statistics.',
        )
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void loadAnalyses()
    return () => {
      isCurrent = false
    }
  }, [navigate, sport])

  return (
    <main className="min-h-svh bg-black px-4 py-7 text-white sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-7">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">
              FormAI <span className="px-1 text-white/25">/</span> Training dashboard
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your progress</h1>
              <p className="mt-2 max-w-xl text-base text-white/60">
                See how your movement scores change with every saved video.
              </p>
            </div>
          </div>
          <Link
            to={`/mvp?sport=${encodeURIComponent(sport)}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-semibold text-gray-950 transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span aria-hidden="true" className="text-lg leading-none">+</span>
            Analyze a video
          </Link>
        </header>

        <section aria-label="Choose a sport" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-white/60">Training focus</h2>
            <span className="text-xs text-white/40">Scores are shown for one sport at a time</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sport">
            {SPORTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={sport === option}
                onClick={() => setSport(option)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  sport === option
                    ? 'border-white bg-white text-gray-950'
                    : 'border-white/15 bg-white/[0.03] text-white/65 hover:border-white/40 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        <section aria-label={`${sport} score summary`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Latest score', value: latestScore === undefined ? '—' : `${Math.round(latestScore)}%`, detail: 'Most recent analysis' },
            { label: 'Average score', value: averageScore === null ? '—' : `${averageScore}%`, detail: 'Across saved analyses' },
            { label: 'Personal best', value: bestScore === null ? '—' : `${Math.round(bestScore)}%`, detail: 'Highest score so far' },
            { label: 'Videos analyzed', value: isLoading ? '—' : String(points.length), detail: `Saved ${sport.toLowerCase()} analyses` },
          ].map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <p className="text-xs font-medium text-white/50 sm:text-sm">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-white/40">{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                Progress over time
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                {sport} target-match score
              </h2>
            </div>
            <p className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55">
              Scale: 0–100%
            </p>
          </div>

          <div className="p-4 sm:p-7">

          {isLoading ? (
            <p role="status" className="py-20 text-center text-sm text-white/60">
              Loading your {sport.toLowerCase()} statistics…
            </p>
          ) : error ? (
            <p role="alert" className="rounded-2xl border border-white/15 bg-white/[0.04] p-5 text-sm text-white/80">
              Could not load statistics: {error}
            </p>
          ) : points.length === 0 ? (
            <div className="mx-auto max-w-md space-y-3 py-14 text-center">
              <div aria-hidden="true" className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-xl text-white/70">
                ↗
              </div>
              <p className="text-lg font-semibold">Your {sport.toLowerCase()} progress starts here</p>
              <p className="text-sm leading-relaxed text-white/55">
                Analyze and save a video to see your target-match score over time.
              </p>
              <Link
                to={`/mvp?sport=${encodeURIComponent(sport)}`}
                className="mt-2 inline-flex min-h-11 items-center rounded-full bg-white px-5 py-2 font-semibold text-gray-950 transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Analyze a video
              </Link>
            </div>
          ) : (
            <ScoreChart sport={sport} points={points} />
          )}
          </div>
        </section>
      </div>
    </main>
  )
}

function ScoreChart({
  sport,
  points,
}: {
  sport: Sport
  points: AnalysisPoint[]
}) {
  const plotWidth = CHART.width - CHART.left - CHART.right
  const plotHeight = CHART.height - CHART.top - CHART.bottom
  const plotBottom = CHART.top + plotHeight
  const coordinates = points.map((point, index) => ({
    ...point,
    x:
      points.length === 1
        ? CHART.left + plotWidth / 2
        : CHART.left + (index / (points.length - 1)) * plotWidth,
    y: CHART.top + ((100 - point.score) / 100) * plotHeight,
  }))
  const xLabelIndexes = Array.from(
    new Set(
      points.length <= 4
        ? points.map((_, index) => index)
        : [0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1],
    ),
  )
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')

  return (
    <div className="space-y-3">
      <svg
        aria-label={`${sport} target-match score by analysis date`}
        className="block h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      >
        <defs>
          <linearGradient id="score-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.16" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Y_TICKS.map((tick) => {
          const y = CHART.top + ((100 - tick) / 100) * plotHeight
          return (
            <g key={tick}>
              <line
                x1={CHART.left}
                y1={y}
                x2={CHART.width - CHART.right}
                y2={y}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray={tick === 0 ? undefined : '3 7'}
              />
              <text
                x={CHART.left - 12}
                y={y + 5}
                fill="rgba(255,255,255,0.52)"
                fontSize="12"
                textAnchor="end"
              >
                {tick}%
              </text>
            </g>
          )
        })}
        <line
          x1={CHART.left}
          y1={CHART.top}
          x2={CHART.left}
          y2={plotBottom}
          stroke="rgba(255,255,255,0.25)"
        />
        <line
          x1={CHART.left}
          y1={plotBottom}
          x2={CHART.width - CHART.right}
          y2={plotBottom}
          stroke="rgba(255,255,255,0.25)"
        />
        <text
          x="18"
          y={CHART.top + plotHeight / 2}
          fill="rgba(255,255,255,0.65)"
          fontSize="13"
          textAnchor="middle"
          transform={`rotate(-90 18 ${CHART.top + plotHeight / 2})`}
        >
          Target-match score
        </text>
        {coordinates.length > 1 && (
          <polygon
            fill="url(#score-area)"
            points={`${coordinates[0].x},${plotBottom} ${linePoints} ${coordinates[coordinates.length - 1].x},${plotBottom}`}
          />
        )}
        {coordinates.length > 1 && (
          <polyline
            fill="none"
            points={linePoints}
            stroke="#fff"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
        )}
        {coordinates.map((point) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="5.5"
            fill="#0a0a0a"
            stroke="#fff"
            strokeWidth="2.5"
          >
            <title>
              {`${new Date(point.createdAt).toLocaleString()}: ${point.score}%`}
            </title>
          </circle>
        ))}
        {xLabelIndexes.map((index) => {
          const point = coordinates[index]
          return (
            <text
              key={point.id}
              x={point.x}
              y={plotBottom + 24}
              fill="rgba(255,255,255,0.62)"
              fontSize="12"
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {new Date(point.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </text>
          )
        })}
        <text
          x={CHART.left + plotWidth / 2}
          y={CHART.height - 12}
          fill="rgba(255,255,255,0.65)"
          fontSize="13"
          textAnchor="middle"
        >
          Video analysis date and time
        </text>
      </svg>
      <p className="px-1 text-xs leading-relaxed text-white/45 sm:text-sm">
        {points.length} saved {points.length === 1 ? 'analysis' : 'analyses'} for {sport}.
        Each point is a target-match estimate, not a validated shot-quality score.
      </p>
    </div>
  )
}

export default Dashboard
