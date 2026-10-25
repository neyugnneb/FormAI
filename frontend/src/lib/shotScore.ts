export type TargetMatchComponent = {
  key: string
  label: string
  value: number | null
  unit: string
  targetMin: number
  targetMax: number
  score: number | null
}

export type ShotTargetMatchScore = {
  score: number | null
  components: TargetMatchComponent[]
  version: 'target_match_v1' | 'golf_putt_v1' | 'overhead_action_v1'
}

type ShotScoreMetrics = {
  knee_angle_at_dip_degrees: number | null
  knee_extension_range_degrees: number | null
  wrist_peak_after_knee_extension_seconds: number | null
  elbow_angle_degrees: number
  wrist_set_point_above_shoulder_arm_length_ratio: number
}

function scoreRange(value: number | null, min: number, max: number) {
  if (value === null || !Number.isFinite(value)) return null
  if (value >= min && value <= max) return 100

  const distance = value < min ? min - value : value - max
  return Math.round(Math.max(0, 1 - distance / (max - min)) * 100)
}

function buildTargetMatch(
  comparisons: readonly Omit<TargetMatchComponent, 'score'>[],
  version: ShotTargetMatchScore['version'],
): ShotTargetMatchScore {
  const components = comparisons.map((comparison) => ({
    ...comparison,
    score: scoreRange(
      comparison.value,
      comparison.targetMin,
      comparison.targetMax,
    ),
  }))
  const measuredScores = components.flatMap((component) =>
    component.score === null ? [] : [component.score],
  )

  return {
    score:
      measuredScores.length > 0
        ? Math.round(
            measuredScores.reduce((total, value) => total + value, 0) /
              measuredScores.length,
          )
        : null,
    components,
    version,
  }
}

export function calculateShotTargetMatch(
  metrics: ShotScoreMetrics,
): ShotTargetMatchScore {
  const comparisons = [
    {
      key: 'knee_angle_at_dip_degrees',
      label: 'Knee angle at dip',
      value: metrics.knee_angle_at_dip_degrees,
      unit: '°',
      targetMin: 100,
      targetMax: 130,
    },
    {
      key: 'knee_extension_range_degrees',
      label: 'Knee extension range',
      value: metrics.knee_extension_range_degrees,
      unit: '°',
      targetMin: 50,
      targetMax: 70,
    },
    {
      key: 'wrist_peak_after_knee_extension_seconds',
      label: 'Wrist peak after knee extension',
      value: metrics.wrist_peak_after_knee_extension_seconds,
      unit: ' s',
      targetMin: 0,
      targetMax: 0.15,
    },
    {
      key: 'elbow_angle_degrees',
      label: 'Elbow angle at peak wrist height',
      value: metrics.elbow_angle_degrees,
      unit: '°',
      targetMin: 150,
      targetMax: 180,
    },
    {
      key: 'wrist_set_point_above_shoulder_arm_length_ratio',
      label: 'Wrist height above shoulder / arm length',
      value: metrics.wrist_set_point_above_shoulder_arm_length_ratio,
      unit: '×',
      targetMin: 1.2,
      targetMax: 2,
    },
  ] as const

  return buildTargetMatch(comparisons, 'target_match_v1')
}

type GolfPuttScoreMetrics = {
  setup_spine_tilt_degrees: number | null
  setup_knee_flexion_degrees: number | null
  setup_elbow_angle_degrees: number | null
}

export function calculateGolfPuttTargetMatch(
  metrics: GolfPuttScoreMetrics,
): ShotTargetMatchScore {
  const comparisons = [
    {
      key: 'setup_spine_tilt_degrees',
      label: 'Setup spine tilt from vertical',
      value: metrics.setup_spine_tilt_degrees,
      unit: '°',
      targetMin: 25,
      targetMax: 45,
    },
    {
      key: 'setup_knee_flexion_degrees',
      label: 'Setup knee flexion',
      value: metrics.setup_knee_flexion_degrees,
      unit: '°',
      targetMin: 10,
      targetMax: 30,
    },
    {
      key: 'setup_elbow_angle_degrees',
      label: 'Setup elbow angle',
      value: metrics.setup_elbow_angle_degrees,
      unit: '°',
      targetMin: 140,
      targetMax: 180,
    },
  ] as const

  return buildTargetMatch(comparisons, 'golf_putt_v1')
}

type OverheadActionScoreMetrics = {
  elbow_angle_at_highest_wrist_degrees: number
  arm_elevation_at_highest_wrist_degrees: number
  torso_lean_at_highest_wrist_degrees: number | null
}

export function calculateOverheadActionTargetMatch(
  metrics: OverheadActionScoreMetrics,
): ShotTargetMatchScore {
  const comparisons = [
    {
      key: 'elbow_angle_at_highest_wrist_degrees',
      label: 'Elbow angle at highest wrist position',
      value: metrics.elbow_angle_at_highest_wrist_degrees,
      unit: '°',
      targetMin: 120,
      targetMax: 175,
    },
    {
      key: 'arm_elevation_at_highest_wrist_degrees',
      label: 'Arm elevation at highest wrist position',
      value: metrics.arm_elevation_at_highest_wrist_degrees,
      unit: '°',
      targetMin: 45,
      targetMax: 90,
    },
    {
      key: 'torso_lean_at_highest_wrist_degrees',
      label: 'Torso lean at highest wrist position',
      value: metrics.torso_lean_at_highest_wrist_degrees,
      unit: '°',
      targetMin: 0,
      targetMax: 35,
    },
  ] as const

  return buildTargetMatch(comparisons, 'overhead_action_v1')
}
