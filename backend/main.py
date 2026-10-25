from __future__ import annotations

from pathlib import Path
import json
import logging
import math
import os
import statistics
import tempfile
import threading
import time
from typing import Any
from uuid import uuid4

import cv2
import mediapipe as mp
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from starlette.background import BackgroundTask

app = FastAPI(title="FormAI Pose API")
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_VIDEO_SECONDS = 120
ANNOTATED_VIDEO_TTL_SECONDS = 15 * 60
GEMINI_MAX_ATTEMPTS = 3
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
ALLOWED_EXTENSIONS = {".avi", ".mkv", ".mov", ".mp4", ".webm"}
POSE_CONNECTIONS = (
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("left_wrist", "left_pinky"),
    ("left_wrist", "left_index"),
    ("left_wrist", "left_thumb"),
    ("left_pinky", "left_index"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("right_wrist", "right_pinky"),
    ("right_wrist", "right_index"),
    ("right_wrist", "right_thumb"),
    ("right_pinky", "right_index"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("left_ankle", "left_heel"),
    ("left_ankle", "left_foot_index"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("right_ankle", "right_heel"),
    ("right_ankle", "right_foot_index"),
)
BODY_LANDMARK_NAMES = {
    landmark_name
    for connection in POSE_CONNECTIONS
    for landmark_name in connection
}
MIN_LANDMARK_VISIBILITY = 0.3
ANNOTATED_VIDEOS: dict[str, tuple[Path, float]] = {}
ANNOTATED_VIDEOS_LOCK = threading.Lock()


def calculate_angle(
    first: tuple[float, float],
    vertex: tuple[float, float],
    last: tuple[float, float],
) -> float:
    first_vector = (first[0] - vertex[0], first[1] - vertex[1])
    last_vector = (last[0] - vertex[0], last[1] - vertex[1])
    first_length = math.hypot(*first_vector)
    last_length = math.hypot(*last_vector)
    if first_length == 0 or last_length == 0:
        raise HTTPException(
            status_code=422,
            detail="Could not calculate the elbow angle from this pose. Try a clearer side-view video.",
        )

    cosine = (
        first_vector[0] * last_vector[0] + first_vector[1] * last_vector[1]
    ) / (first_length * last_length)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine))))


def calculate_shot_metrics(samples: list[dict[str, Any]]) -> dict[str, Any]:
    detected_samples = [
        sample
        for sample in samples
        if sample.get("left") is not None or sample.get("right") is not None
    ]
    if not detected_samples:
        raise HTTPException(
            status_code=422,
            detail="No person was detected. Try a clear, full-body side-view video.",
        )

    arm_candidates: list[tuple[float, str, tuple[int, dict[str, Any]]]] = []
    for side in ("left", "right"):
        candidates = [
            (index, sample[side])
            for index, sample in enumerate(samples)
            if sample.get(side) is not None
            and all(name in sample[side] for name in ("shoulder", "elbow", "wrist"))
        ]
        if candidates:
            peak_index, peak = max(
                candidates,
                key=lambda candidate: (
                    candidate[1]["shoulder"][1] - candidate[1]["wrist"][1]
                ),
            )
            elevation = peak["shoulder"][1] - peak["wrist"][1]
            arm_candidates.append((elevation, side, (peak_index, peak)))

    if not arm_candidates:
        raise HTTPException(
            status_code=422,
            detail="Could not track a visible shooting arm. Keep the shoulder, elbow, and wrist in view.",
        )

    _, shooting_arm, (peak_index, peak_arm) = max(
        arm_candidates, key=lambda candidate: candidate[0]
    )
    elbow_angle = calculate_angle(
        peak_arm["shoulder"], peak_arm["elbow"], peak_arm["wrist"]
    )

    arm_samples = [
        (index, sample[shooting_arm])
        for index, sample in enumerate(samples)
        if sample.get(shooting_arm)
        and all(
            name in sample[shooting_arm]
            for name in ("shoulder", "elbow", "wrist")
        )
    ]
    wrist_release_angle: float | None = None
    if len(arm_samples) > 1:
        peak_arm_sample_index = next(
            position
            for position, (sample_index, _) in enumerate(arm_samples)
            if sample_index == peak_index
        )
    else:
        peak_arm_sample_index = 0
    if peak_arm_sample_index > 0:
        previous_index, previous_arm = arm_samples[peak_arm_sample_index - 1]
        current_index, current_arm = arm_samples[peak_arm_sample_index]
        previous = previous_arm["wrist"]
        current = current_arm["wrist"]
        horizontal_motion = abs(current[0] - previous[0])
        upward_motion = previous[1] - current[1]
        elapsed_frames = current_index - previous_index
        if upward_motion > 0 and elapsed_frames > 0:
            wrist_release_angle = round(
                math.degrees(math.atan2(upward_motion, horizontal_motion)), 1
            )

    def side_angle(sample: dict[str, Any], side: str) -> float | None:
        joints = sample.get(side)
        if joints is None or not all(
            name in joints for name in ("hip", "knee", "ankle")
        ):
            return None
        return calculate_angle(joints["hip"], joints["knee"], joints["ankle"])

    average_knee_angles: list[tuple[int, float]] = []
    for index, sample in enumerate(samples):
        angles = [
            angle
            for angle in (side_angle(sample, "left"), side_angle(sample, "right"))
            if angle is not None
        ]
        if angles:
            average_knee_angles.append((index, statistics.mean(angles)))
    knee_flexion = (
        round(180 - min(angle for _, angle in average_knee_angles), 1)
        if average_knee_angles
        else None
    )
    knee_angle_at_dip = (
        round(min(angle for _, angle in average_knee_angles), 1)
        if average_knee_angles
        else None
    )
    knee_extension = (
        round(
            max(angle for _, angle in average_knee_angles)
            - min(angle for _, angle in average_knee_angles),
            1,
        )
        if len(average_knee_angles) > 1
        else None
    )
    knee_extension_peak_index: int | None = None
    if average_knee_angles:
        deepest_knee_index, _ = min(average_knee_angles, key=lambda item: item[1])
        later_knee_angles = [
            item for item in average_knee_angles if item[0] >= deepest_knee_index
        ]
        if later_knee_angles:
            knee_extension_peak_index, _ = max(later_knee_angles, key=lambda item: item[1])

    wrist_peak_after_knee_extension_seconds: float | None = None
    if knee_extension_peak_index is not None:
        wrist_peak_after_knee_extension_seconds = round(
            samples[peak_index]["timestamp_seconds"]
            - samples[knee_extension_peak_index]["timestamp_seconds"],
            2,
        )

    stance_ratios: list[tuple[float, float]] = []
    for sample in samples:
        left = sample.get("left")
        right = sample.get("right")
        if not left or not right:
            continue
        if not all(name in left for name in ("ankle", "shoulder")):
            continue
        if not all(name in right for name in ("ankle", "shoulder")):
            continue
        shoulder_width = math.dist(left["shoulder"], right["shoulder"])
        if shoulder_width > 0:
            stance_ratios.append(
                (
                    sample["timestamp_seconds"],
                    math.dist(left["ankle"], right["ankle"]) / shoulder_width,
                )
            )
    stance_width = None
    if stance_ratios:
        first_timestamp = stance_ratios[0][0]
        initial_stance_ratios = [
            ratio
            for timestamp, ratio in stance_ratios
            if timestamp <= first_timestamp + 0.5
        ]
        stance_width = round(statistics.median(initial_stance_ratios), 2)

    arm_length = max(
        math.dist(peak_arm["shoulder"], peak_arm["elbow"]),
        1,
    )
    elbow_wrist_offset = round(
        abs(peak_arm["elbow"][0] - peak_arm["wrist"][0])
        / arm_length,
        2,
    )
    set_point_height = round(
        (peak_arm["shoulder"][1] - peak_arm["wrist"][1]) / arm_length, 2
    )

    peak_wrist_index = peak_index
    follow_through_hold_seconds: float | None = None
    if peak_wrist_index < len(samples) - 1:
        wrist = peak_arm["wrist"]
        hold_end = peak_wrist_index
        for index in range(peak_wrist_index + 1, len(samples)):
            later_arm = samples[index].get(shooting_arm)
            if later_arm is None or "wrist" not in later_arm:
                break
            if math.dist(wrist, later_arm["wrist"]) > arm_length * 0.12:
                break
            hold_end = index
        if hold_end > peak_wrist_index:
            follow_through_hold_seconds = round(
                samples[hold_end]["timestamp_seconds"]
                - samples[peak_wrist_index]["timestamp_seconds"],
                2,
            )

    first_detected = detected_samples[0]
    last_detected = detected_samples[-1]
    first_hip = next(
        (
            first_detected[side]["hip"]
            for side in ("left", "right")
            if first_detected.get(side) and "hip" in first_detected[side]
        ),
        None,
    )
    last_hip = next(
        (
            last_detected[side]["hip"]
            for side in ("left", "right")
            if last_detected.get(side) and "hip" in last_detected[side]
        ),
        None,
    )
    body_drift = None
    body_scale = arm_length
    if first_hip is not None and last_hip is not None:
        body_drift = round(
            math.dist(first_hip, last_hip) / body_scale, 2
        )

    return {
        "shooting_arm": shooting_arm,
        "elbow_angle_degrees": round(elbow_angle, 1),
        "wrist_release_angle_estimate_degrees": wrist_release_angle,
        "stance_width_to_shoulder_width": stance_width,
        "knee_flexion_at_deepest_point_degrees": knee_flexion,
        "knee_angle_at_dip_degrees": knee_angle_at_dip,
        "knee_extension_range_degrees": knee_extension,
        "wrist_peak_after_knee_extension_seconds": wrist_peak_after_knee_extension_seconds,
        "elbow_wrist_horizontal_offset_arm_length_ratio": elbow_wrist_offset,
        "wrist_set_point_above_shoulder_arm_length_ratio": set_point_height,
        "hip_drift_arm_length_ratio": body_drift,
        "follow_through_hold_seconds": follow_through_hold_seconds,
        "frames_with_pose": len(detected_samples),
        "measurement_notes": [
            "All measurements are approximate 2D image-plane estimates and depend on camera angle and landmark visibility.",
            "Knee angle at the dip is the smallest average visible hip-knee-ankle angle in the clip; it is an image-plane estimate and does not measure force or weight distribution.",
            "Stance width compares ankle distance with shoulder width. It does not determine which foot is ahead or whether the stance is shoulder-width in 3D.",
            "Wrist height is measured at the highest detected arm raise, not a confirmed ball set point. Elbow-to-wrist alignment is only a proxy because the ball is not tracked.",
            "Wrist ascent angle is not the ball launch angle. The wrist peak relative to knee extension is only a timing proxy, not release timing relative to jump apex.",
            "Hip drift compares the first and last detected positions in the clip and may not isolate takeoff and landing.",
            "Guide-hand influence, shoulder/hip alignment to the basket, weight on the balls of the feet, elbow height relative to the eyes, finger direction, ball backspin, and holding the follow-through until the ball reaches the rim are not measured.",
        ],
    }


def calculate_golf_putt_metrics(samples: list[dict[str, Any]]) -> dict[str, Any]:
    detected_samples = [
        sample
        for sample in samples
        if sample.get("left") is not None or sample.get("right") is not None
    ]
    if not detected_samples:
        raise HTTPException(
            status_code=422,
            detail="No golfer was detected. Use a clear, full-body video from the side.",
        )

    first_timestamp = detected_samples[0]["timestamp_seconds"]
    setup_samples = [
        sample
        for sample in detected_samples
        if sample["timestamp_seconds"] <= first_timestamp + 1.0
    ]

    def joint_center(sample: dict[str, Any], joint: str) -> tuple[float, float] | None:
        points = [
            sample[side][joint]
            for side in ("left", "right")
            if sample.get(side) and joint in sample[side]
        ]
        if not points:
            return None
        return (
            statistics.mean(point[0] for point in points),
            statistics.mean(point[1] for point in points),
        )

    spine_tilts: list[float] = []
    knee_flexions: list[float] = []
    elbow_angles: list[float] = []
    for sample in setup_samples:
        shoulder = joint_center(sample, "shoulder")
        hip = joint_center(sample, "hip")
        if shoulder is not None and hip is not None:
            vertical_distance = abs(hip[1] - shoulder[1])
            if vertical_distance > 0:
                spine_tilts.append(
                    math.degrees(
                        math.atan2(abs(shoulder[0] - hip[0]), vertical_distance)
                    )
                )

        for side in ("left", "right"):
            joints = sample.get(side)
            if not joints:
                continue
            if all(name in joints for name in ("hip", "knee", "ankle")):
                if (
                    math.dist(joints["hip"], joints["knee"]) > 0
                    and math.dist(joints["ankle"], joints["knee"]) > 0
                ):
                    knee_flexions.append(
                        180
                        - calculate_angle(
                            joints["hip"], joints["knee"], joints["ankle"]
                        )
                    )
            if all(name in joints for name in ("shoulder", "elbow", "wrist")):
                if (
                    math.dist(joints["shoulder"], joints["elbow"]) > 0
                    and math.dist(joints["wrist"], joints["elbow"]) > 0
                ):
                    elbow_angles.append(
                        calculate_angle(
                            joints["shoulder"], joints["elbow"], joints["wrist"]
                        )
                    )

    shoulder_widths = [
        math.dist(sample["left"]["shoulder"], sample["right"]["shoulder"])
        for sample in detected_samples
        if sample.get("left")
        and sample.get("right")
        and "shoulder" in sample["left"]
        and "shoulder" in sample["right"]
        and math.dist(sample["left"]["shoulder"], sample["right"]["shoulder"]) > 0
    ]
    body_scales = shoulder_widths or [
        math.dist(sample[side]["shoulder"], sample[side]["hip"])
        for sample in detected_samples
        for side in ("left", "right")
        if sample.get(side)
        and "shoulder" in sample[side]
        and "hip" in sample[side]
        and math.dist(sample[side]["shoulder"], sample[side]["hip"]) > 0
    ]
    body_scale = statistics.median(body_scales) if body_scales else None

    wrist_centers = [
        center
        for sample in detected_samples
        if (center := joint_center(sample, "wrist")) is not None
    ]
    wrist_path_range = None
    if wrist_centers and body_scale:
        wrist_path_range = round(
            math.hypot(
                max(point[0] for point in wrist_centers)
                - min(point[0] for point in wrist_centers),
                max(point[1] for point in wrist_centers)
                - min(point[1] for point in wrist_centers),
            )
            / body_scale,
            2,
        )

    shoulder_centers = [
        center
        for sample in detected_samples
        if (center := joint_center(sample, "shoulder")) is not None
    ]
    shoulder_movement = None
    if shoulder_centers and body_scale:
        reference = (
            statistics.median(point[0] for point in shoulder_centers),
            statistics.median(point[1] for point in shoulder_centers),
        )
        shoulder_movement = round(
            max(math.dist(point, reference) for point in shoulder_centers)
            / body_scale,
            2,
        )

    return {
        "analysis_type": "golf_putt",
        "setup_spine_tilt_degrees": (
            round(statistics.median(spine_tilts), 1) if spine_tilts else None
        ),
        "setup_knee_flexion_degrees": (
            round(statistics.median(knee_flexions), 1) if knee_flexions else None
        ),
        "setup_elbow_angle_degrees": (
            round(statistics.median(elbow_angles), 1) if elbow_angles else None
        ),
        "wrist_path_range_body_scale": wrist_path_range,
        "shoulder_movement_body_scale": shoulder_movement,
        "frames_with_pose": len(detected_samples),
        "measurement_notes": [
            "These are approximate 2D body-pose proxies, not validated putting measurements.",
            "Setup posture uses the first second of the clip; begin recording once you are standing at address.",
            "Wrist path and shoulder movement cover the entire clip and can be affected by walking, camera angle, and framing.",
            "The pose model does not track the putter, ball, club-face alignment, impact, ball start line, or putt distance.",
            "Use a steady side view with the golfer's full body visible. The composite score is an illustrative comparison against broad setup ranges, not a measure of putting performance.",
        ],
    }


def calculate_overhead_action_metrics(
    samples: list[dict[str, Any]], sport: str
) -> dict[str, Any]:
    detected_samples = [
        sample
        for sample in samples
        if sample.get("left") is not None or sample.get("right") is not None
    ]
    if not detected_samples:
        raise HTTPException(
            status_code=422,
            detail=f"No athlete was detected. Use a clear, full-body {sport.lower()} video.",
        )

    arm_candidates: list[tuple[float, str, int, dict[str, Any]]] = []
    for side in ("left", "right"):
        candidates = [
            (index, sample[side])
            for index, sample in enumerate(samples)
            if sample.get(side)
            and all(name in sample[side] for name in ("shoulder", "elbow", "wrist"))
        ]
        if candidates:
            peak_index, peak_arm = max(
                candidates,
                key=lambda candidate: candidate[1]["shoulder"][1]
                - candidate[1]["wrist"][1],
            )
            arm_candidates.append(
                (
                    peak_arm["shoulder"][1] - peak_arm["wrist"][1],
                    side,
                    peak_index,
                    peak_arm,
                )
            )
    if not arm_candidates:
        raise HTTPException(
            status_code=422,
            detail="Could not track an arm. Keep the athlete's shoulder, elbow, and wrist visible.",
        )

    _, active_arm, peak_index, peak_arm = max(arm_candidates, key=lambda item: item[0])
    elbow_angle = calculate_angle(
        peak_arm["shoulder"], peak_arm["elbow"], peak_arm["wrist"]
    )
    shoulder_to_wrist = (
        peak_arm["wrist"][0] - peak_arm["shoulder"][0],
        peak_arm["shoulder"][1] - peak_arm["wrist"][1],
    )
    arm_elevation = math.degrees(
        math.atan2(abs(shoulder_to_wrist[1]), abs(shoulder_to_wrist[0]))
    )

    def center(sample: dict[str, Any], joint: str) -> tuple[float, float] | None:
        points = [
            sample[side][joint]
            for side in ("left", "right")
            if sample.get(side) and joint in sample[side]
        ]
        if not points:
            return None
        return (
            statistics.mean(point[0] for point in points),
            statistics.mean(point[1] for point in points),
        )

    shoulder_widths = [
        math.dist(sample["left"]["shoulder"], sample["right"]["shoulder"])
        for sample in detected_samples
        if sample.get("left")
        and sample.get("right")
        and "shoulder" in sample["left"]
        and "shoulder" in sample["right"]
        and math.dist(sample["left"]["shoulder"], sample["right"]["shoulder"]) > 0
    ]
    body_scale = statistics.median(shoulder_widths) if shoulder_widths else None

    torso_lean: float | None = None
    shoulders = center(samples[peak_index], "shoulder")
    hips = center(samples[peak_index], "hip")
    if shoulders is not None and hips is not None:
        vertical_distance = abs(hips[1] - shoulders[1])
        if vertical_distance > 0:
            torso_lean = round(
                math.degrees(
                    math.atan2(abs(shoulders[0] - hips[0]), vertical_distance)
                ),
                1,
            )

    hip_centers = [
        hip_center
        for sample in detected_samples
        if (hip_center := center(sample, "hip")) is not None
    ]
    hip_displacement: float | None = None
    if len(hip_centers) > 1 and body_scale:
        initial_hip = hip_centers[0]
        hip_displacement = round(
            max(math.dist(initial_hip, hip) for hip in hip_centers) / body_scale,
            2,
        )

    knee_flexions = [
        180
        - calculate_angle(
            sample[side]["hip"],
            sample[side]["knee"],
            sample[side]["ankle"],
        )
        for sample in detected_samples
        for side in ("left", "right")
        if sample.get(side)
        and all(name in sample[side] for name in ("hip", "knee", "ankle"))
        and math.dist(sample[side]["hip"], sample[side]["knee"]) > 0
        and math.dist(sample[side]["ankle"], sample[side]["knee"]) > 0
    ]
    knee_flexion_range = (
        round(max(knee_flexions) - min(knee_flexions), 1)
        if len(knee_flexions) > 1
        else None
    )

    return {
        "analysis_type": "overhead_action",
        "active_arm": active_arm,
        "elbow_angle_at_highest_wrist_degrees": round(elbow_angle, 1),
        "arm_elevation_at_highest_wrist_degrees": round(arm_elevation, 1),
        "torso_lean_at_highest_wrist_degrees": torso_lean,
        "knee_flexion_range_degrees": knee_flexion_range,
        "hip_displacement_body_widths": hip_displacement,
        "frames_with_pose": len(detected_samples),
        "measurement_notes": [
            "These values are approximate 2D pose proxies, not validated measures of serve or pitching performance.",
            "The highest detected wrist position is not confirmed ball contact, release, or the most important phase of the motion.",
            "The pose model does not track the ball, racket, or throwing arm implement; it cannot measure ball speed, spin, contact point, accuracy, or trajectory.",
            "Hip displacement and joint angles depend on camera angle, framing, landmark visibility, and the full movement staying in view.",
            "The composite score compares broad pose proxies only. It is not a measure of serve or pitch quality, and optimal mechanics vary by athlete and sport.",
        ],
    }


def get_coaching_feedback(
    metrics: dict[str, Any], sport: str = "Basketball"
) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured. Set GEMINI_API_KEY in the terminal running the backend.",
        )

    try:
        with genai.Client(api_key=api_key) as client:
            if sport == "Golf":
                request_contents = (
                    "Give brief, constructive golf putting setup and stroke "
                    "feedback based only on the supplied approximate pose "
                    "proxies: setup spine tilt, knee flexion, elbow angle, "
                    "wrist path range, and shoulder movement. Return one short "
                    "summary, at most two strengths, and at most three "
                    "improvements with concise practice drills. Do not state "
                    "that a putt was made or infer ball, putter, club-face, "
                    "impact, start-line, distance, or head movement because "
                    "these are not tracked. Treat broad posture ranges as "
                    "illustrative, not universal coaching standards. "
                    "Use these measurements:\n"
                    f"{json.dumps(metrics)}"
                )
                system_instruction = (
                    "You are a careful golf putting coach. Use only the supplied "
                    "body-pose measurements. Do not claim to have seen the ball "
                    "or putter, measured impact or ball roll, or assessed "
                    "face/path alignment. State uncertainty where relevant. "
                    "Offer practical, safe drills and avoid diagnosing injuries."
                )
            elif sport in ("Tennis", "Volleyball", "Baseball"):
                action = {
                    "Tennis": "tennis serve",
                    "Volleyball": "volleyball serve",
                    "Baseball": "baseball pitch",
                }[sport]
                request_contents = (
                    f"Give brief, constructive {action} feedback using only "
                    "the supplied approximate body-pose metrics: elbow angle "
                    "and arm elevation at the highest detected wrist position, "
                    "torso lean at that frame, knee-flexion range, and hip "
                    "displacement. Return one short summary, at most two "
                    "strengths, and at most three improvements with concise "
                    "practice drills. Do not claim to identify ball contact, "
                    "release, speed, spin, accuracy, or trajectory. Treat the "
                    "highest-wrist frame as a pose reference, not a confirmed "
                    "sport event. Avoid presenting a single ideal technique "
                    "for every athlete. Use these measurements:\n"
                    f"{json.dumps(metrics)}"
                )
                system_instruction = (
                    f"You are a careful {action} coach. Use only the supplied "
                    "pose measurements. Do not claim to see or track the ball, "
                    "racket, or implement, or infer speed, spin, accuracy, "
                    "contact, or release. State uncertainty where relevant. "
                    "Offer practical, safe drills and do not diagnose injuries."
                )
            else:
                request_contents = (
                    "Give brief, constructive basketball shot-form feedback based "
                    "on the measurable mechanics in the supplied data: stance "
                    "width, knee bend and extension, lower-to-upper-body timing, "
                    "elbow angle and alignment proxy, wrist height and motion, "
                    "body drift, and follow-through hold. Mention the most useful "
                    "observations, not every field. Return one short summary, at "
                    "most two short strengths, and at most three improvements "
                    "with concise drills. Treat a knee angle at dip of about "
                    "100-120 degrees as a broad reference only; shot distance "
                    "and player mechanics matter. Do not compare other metrics "
                    "to set-point, release, alignment, or launch-angle targets "
                    "because those events are not measured. "
                    "Use these measurements:\n"
                    f"{json.dumps(metrics)}"
                )
                system_instruction = (
                    "You are a careful basketball shooting-form coach. Use only "
                    "the supplied pose metrics. Do not claim to have seen the "
                    "video or tracked the ball. The wrist release angle is only "
                    "a rough proxy, not the ball's launch angle. The measured "
                    "elbow angle is not confirmed to be at set point or release. "
                    "Avoid declaring a single ideal form for every player. Give practical, safe "
                    "training drills; state when a metric is uncertain. Do not "
                    "diagnose injuries."
                )
            request_config = genai_types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                max_output_tokens=1024,
                response_schema={
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "strengths": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "improvements": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "aspect": {"type": "string"},
                                    "observation": {"type": "string"},
                                    "drill": {"type": "string"},
                                },
                                "required": ["aspect", "observation", "drill"],
                            },
                        },
                    },
                    "required": ["summary", "strengths", "improvements"],
                },
            )
            for attempt in range(1, GEMINI_MAX_ATTEMPTS + 1):
                try:
                    response = client.models.generate_content(
                        model=GEMINI_MODEL,
                        contents=request_contents,
                        config=request_config,
                    )
                    break
                except genai_errors.ServerError as error:
                    if (
                        error.code not in (502, 503, 504)
                        or attempt == GEMINI_MAX_ATTEMPTS
                    ):
                        raise
                    delay_seconds = 2 ** (attempt - 1)
                    logger.warning(
                        "Gemini server error for model %s: HTTP %s (%s); "
                        "retrying attempt %s of %s in %s seconds",
                        GEMINI_MODEL,
                        error.code,
                        error.status,
                        attempt + 1,
                        GEMINI_MAX_ATTEMPTS,
                        delay_seconds,
                    )
                    time.sleep(delay_seconds)
    except genai_errors.ClientError as error:
        logger.warning(
            "Gemini rejected request for model %s: HTTP %s (%s): %s",
            GEMINI_MODEL,
            error.code,
            error.status,
            error.message,
        )
        if error.code in (401, 403):
            detail = (
                "Gemini rejected the API key. Check GEMINI_API_KEY and ensure "
                "the key has Gemini API access."
            )
        elif error.code == 429:
            detail = "Gemini quota or rate limit reached. Check your Google AI Studio usage and billing."
        elif error.code == 400:
            detail = (
                "Gemini rejected the request: "
                f"{error.message or 'invalid model or request configuration'}"
            )
        else:
            detail = f"Gemini rejected the request (HTTP {error.code}). Check the Gemini model and API key configuration."
        raise HTTPException(status_code=502, detail=detail) from error
    except genai_errors.ServerError as error:
        logger.warning(
            "Gemini server error after %s attempts for model %s: HTTP %s (%s)",
            GEMINI_MAX_ATTEMPTS,
            GEMINI_MODEL,
            error.code,
            error.status,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                f"Gemini is temporarily unavailable (HTTP {error.code}, "
                f"{error.status}). Try again in a moment."
            ),
        ) from error
    except genai_errors.APIError as error:
        raise HTTPException(
            status_code=502,
            detail="The Gemini coaching request failed. Check the backend logs for details.",
        ) from error

    finish_reasons = [
        candidate.finish_reason for candidate in (response.candidates or [])
    ]
    if any(reason == genai_types.FinishReason.MAX_TOKENS for reason in finish_reasons):
        logger.warning(
            "Gemini reached the output token limit for model %s (limit: %s)",
            GEMINI_MODEL,
            1024,
        )
        raise HTTPException(
            status_code=502,
            detail="Gemini cut off its coaching response. Try again; if it continues, check that the selected model supports this response format.",
        )

    feedback = response.parsed
    if feedback is not None and not isinstance(feedback, dict):
        model_dump = getattr(feedback, "model_dump", None)
        if callable(model_dump):
            feedback = model_dump()
        else:
            feedback = None

    if feedback is None:
        content = response.text
        if not content:
            raise HTTPException(
                status_code=502, detail="Gemini returned an empty coaching response."
            )

        try:
            feedback = json.loads(content)
        except json.JSONDecodeError as error:
            finish_reasons = [
                str(candidate.finish_reason)
                for candidate in (response.candidates or [])
            ]
            logger.warning(
                "Gemini returned non-JSON coaching output for model %s "
                "(finish reasons: %s, response length: %s)",
                GEMINI_MODEL,
                ", ".join(finish_reasons) or "unknown",
                len(content),
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "Gemini did not return structured coaching feedback. "
                    "Try again or check the backend logs."
                ),
            ) from error

    if (
        not isinstance(feedback, dict)
        or not isinstance(feedback.get("summary"), str)
        or not isinstance(feedback.get("strengths"), list)
        or not all(isinstance(item, str) for item in feedback["strengths"])
        or not isinstance(feedback.get("improvements"), list)
        or not all(
            isinstance(item, dict)
            and all(
                isinstance(item.get(field), str)
                for field in ("aspect", "observation", "drill")
            )
            for item in feedback["improvements"]
        )
    ):
        raise HTTPException(
            status_code=502, detail="Gemini returned malformed coaching feedback."
        )
    return feedback


def render_pose_video(
    video_path: Path, output_path: Path, sport: str
) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise HTTPException(status_code=400, detail="Could not read this video.")

    writer: cv2.VideoWriter | None = None
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not math.isfinite(fps) or fps <= 0 or frame_count <= 0:
            raise HTTPException(
                status_code=400, detail="The video does not contain readable frames."
            )
        if width <= 0 or height <= 0:
            raise HTTPException(status_code=400, detail="Could not read video dimensions.")
        if frame_count / fps > MAX_VIDEO_SECONDS:
            raise HTTPException(
                status_code=413,
                detail=f"Videos must be {MAX_VIDEO_SECONDS} seconds or shorter.",
            )

        max_frame_count = int(MAX_VIDEO_SECONDS * fps)
        frame_index = 0
        pose_samples: list[dict[str, Any]] = []

        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*"avc1"),
            fps,
            (width, height),
        )
        if not writer.isOpened():
            raise HTTPException(
                status_code=500, detail="Could not create the annotated video."
            )

        with mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            while True:
                success, frame = capture.read()
                if not success:
                    break
                if frame_index >= max_frame_count:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Videos must be {MAX_VIDEO_SECONDS} seconds or shorter.",
                    )

                result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                landmarks: dict[str, Any] = {}
                frame_sample: dict[str, Any] = {
                    "timestamp_seconds": frame_index / fps,
                    "left": None,
                    "right": None,
                }
                if result.pose_landmarks:
                    landmarks = {
                        mp_pose_name(index): landmark
                        for index, landmark in enumerate(
                            result.pose_landmarks.landmark
                        )
                        if (
                            landmark.visibility >= MIN_LANDMARK_VISIBILITY
                            and mp_pose_name(index) in BODY_LANDMARK_NAMES
                        )
                    }
                    for side in ("left", "right"):
                        side_joints = {
                            joint: (
                                landmarks[f"{side}_{joint}"].x * width,
                                landmarks[f"{side}_{joint}"].y * height,
                            )
                            for joint in (
                                "shoulder",
                                "elbow",
                                "wrist",
                                "hip",
                                "knee",
                                "ankle",
                            )
                            if f"{side}_{joint}" in landmarks
                        }
                        if side_joints:
                            frame_sample[side] = side_joints

                    for start_name, end_name in POSE_CONNECTIONS:
                        start = landmarks.get(start_name)
                        end = landmarks.get(end_name)
                        if start is None or end is None:
                            continue
                        start_point = (int(start.x * width), int(start.y * height))
                        end_point = (int(end.x * width), int(end.y * height))
                        cv2.line(
                            frame,
                            start_point,
                            end_point,
                            (255, 211, 34),
                            3,
                            cv2.LINE_AA,
                        )

                    for landmark in landmarks.values():
                        point = (int(landmark.x * width), int(landmark.y * height))
                        cv2.circle(frame, point, 5, (45, 65, 245), -1, cv2.LINE_AA)
                        cv2.circle(frame, point, 5, (255, 255, 255), 1, cv2.LINE_AA)

                pose_samples.append(frame_sample)
                writer.write(frame)
                frame_index += 1
    finally:
        capture.release()
        if writer is not None:
            writer.release()
    if sport == "Golf":
        return calculate_golf_putt_metrics(pose_samples)
    if sport in ("Tennis", "Volleyball", "Baseball"):
        return calculate_overhead_action_metrics(pose_samples, sport)
    return calculate_shot_metrics(pose_samples)


def mp_pose_name(index: int) -> str:
    return mp.solutions.pose.PoseLandmark(index).name.lower()


@app.post("/api/pose")
def detect_pose(
    video: UploadFile = File(...), sport: str = Form(...)
) -> dict[str, Any]:
    if sport not in ("Basketball", "Golf", "Tennis", "Volleyball", "Baseball"):
        raise HTTPException(
            status_code=422,
            detail="Video analysis is currently available for Basketball, Golf putting, Tennis serves, Volleyball serves, and Baseball pitches.",
        )
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured. Set GEMINI_API_KEY in the terminal running the backend.",
        )

    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported video format. Use one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    try:
        with tempfile.TemporaryDirectory() as temporary_directory:
            video_path = Path(temporary_directory) / f"upload{suffix}"
            total_bytes = 0
            with video_path.open("wb") as destination:
                while chunk := video.file.read(1024 * 1024):
                    total_bytes += len(chunk)
                    if total_bytes > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail="Video files must be 100 MB or smaller.",
                        )
                    destination.write(chunk)

            if total_bytes == 0:
                raise HTTPException(status_code=400, detail="The uploaded video is empty.")

            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as output_file:
                output_path = Path(output_file.name)

            try:
                metrics = render_pose_video(video_path, output_path, sport)
                feedback = get_coaching_feedback(metrics, sport)
            except Exception:
                output_path.unlink(missing_ok=True)
                raise

            video_id = uuid4().hex
            cleanup_expired_videos()
            with ANNOTATED_VIDEOS_LOCK:
                ANNOTATED_VIDEOS[video_id] = (
                    output_path,
                    time.monotonic() + ANNOTATED_VIDEO_TTL_SECONDS,
                )
            return {
                "sport": sport,
                "metrics": metrics,
                "feedback": feedback,
                "video_url": f"/api/pose/video/{video_id}",
            }
    finally:
        video.file.close()


def cleanup_expired_videos() -> None:
    now = time.monotonic()
    with ANNOTATED_VIDEOS_LOCK:
        expired_ids = [
            video_id
            for video_id, (_, expires_at) in ANNOTATED_VIDEOS.items()
            if expires_at <= now
        ]
        for video_id in expired_ids:
            path, _ = ANNOTATED_VIDEOS.pop(video_id)
            path.unlink(missing_ok=True)


@app.get("/api/pose/video/{video_id}")
def get_annotated_video(video_id: str) -> FileResponse:
    cleanup_expired_videos()
    with ANNOTATED_VIDEOS_LOCK:
        video = ANNOTATED_VIDEOS.pop(video_id, None)
    if video is None:
        raise HTTPException(status_code=404, detail="Annotated video not found or expired.")

    output_path, _ = video
    return FileResponse(
        output_path,
        media_type="video/mp4",
        background=BackgroundTask(os.unlink, output_path),
    )
