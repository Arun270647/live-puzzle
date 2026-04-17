"""
hand_tracker.py
Core hand tracking module using MediaPipe Hands.
Responsibilities:
  - Detect both hands and extract index-finger tips (landmark 8)
  - Form a forced-square ROI from the two finger tips
  - Smooth coordinates with exponential moving average
  - Detect pinch gesture for capture trigger
  - Extract and encode the ROI as a base64 JPEG
"""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass, field
from typing import Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np

# ── Constants ────────────────────────────────────────────────────────────────

INDEX_TIP = 8          # landmark id – index finger tip
THUMB_TIP = 4          # landmark id – thumb tip

SMOOTHING_ALPHA = 0.3  # EMA weight for new sample (0.7 for previous)
MIN_HAND_DISTANCE = 60  # px – ignore hands that are too close together
JITTER_THRESHOLD = 8    # px – changes smaller than this are discarded
PINCH_THRESHOLD = 0.06  # normalised units – index-thumb distance for pinch
STABLE_DURATION = 1.5   # seconds – sustained stability needed for auto-trigger
ROI_SIZE = 400          # output ROI pixel size (square)


# ── Data types ───────────────────────────────────────────────────────────────

@dataclass
class Point:
    x: float
    y: float

    def distance_to(self, other: "Point") -> float:
        return float(np.hypot(self.x - other.x, self.y - other.y))


@dataclass
class SquareROI:
    top_left: Point
    size: float            # side length in pixels
    normalised: bool = False  # coords are normalised [0,1] when True

    @property
    def bottom_right(self) -> Point:
        return Point(self.top_left.x + self.size, self.top_left.y + self.size)

    def clamped(self, frame_w: int, frame_h: int) -> "SquareROI":
        """Clamp ROI so it stays inside the frame."""
        x = max(0.0, min(self.top_left.x, frame_w - self.size))
        y = max(0.0, min(self.top_left.y, frame_h - self.size))
        max_size = float(min(frame_w - x, frame_h - y))
        size = min(self.size, max_size)
        return SquareROI(Point(x, y), size)

    def to_dict(self) -> dict:
        return {
            "x": int(self.top_left.x),
            "y": int(self.top_left.y),
            "size": int(self.size),
        }


@dataclass
class HandTrackingResult:
    square: Optional[SquareROI] = None
    is_stable: bool = False
    stable_progress: float = 0.0   # 0.0 – 1.0 fill for UI indicator
    triggered: bool = False        # capture trigger fired this frame
    left_pinch: bool = False
    right_pinch: bool = False
    left_index: Optional[Point] = None
    right_index: Optional[Point] = None
    frame_w: int = 0
    frame_h: int = 0


# ── Tracker class ─────────────────────────────────────────────────────────────

class HandTracker:
    def __init__(self) -> None:
        self._mp_hands = mp.solutions.hands
        self._hands = self._mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.6,
            model_complexity=0,  # fastest model
        )

        # Smoothed points (pixel coords)
        self._smooth_left: Optional[Point] = None
        self._smooth_right: Optional[Point] = None

        # Stability tracking
        self._stable_since: Optional[float] = None
        self._prev_size: Optional[float] = None
        self._triggered_at: Optional[float] = None  # cooldown

    # ── Public API ────────────────────────────────────────────────────────────

    def process_frame(self, bgr_frame: np.ndarray) -> HandTrackingResult:
        """Run hand tracking on a single BGR frame."""
        h, w = bgr_frame.shape[:2]
        result = HandTrackingResult(frame_w=w, frame_h=h)

        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        detection = self._hands.process(rgb)

        if not detection.multi_hand_landmarks or len(detection.multi_hand_landmarks) < 2:
            # Reset stability when hands disappear
            self._stable_since = None
            return result

        # Classify which hand is which
        left_lm, right_lm = self._classify_hands(
            detection.multi_hand_landmarks,
            detection.multi_handedness,
        )

        if left_lm is None or right_lm is None:
            self._stable_since = None
            return result

        # Extract index tips (normalised → pixel)
        left_idx = self._landmark_to_pixel(left_lm.landmark[INDEX_TIP], w, h)
        right_idx = self._landmark_to_pixel(right_lm.landmark[INDEX_TIP], w, h)
        left_thumb = self._landmark_to_pixel(left_lm.landmark[THUMB_TIP], w, h)
        right_thumb = self._landmark_to_pixel(right_lm.landmark[THUMB_TIP], w, h)

        # Jitter + smoothing
        left_idx = self._smooth("left", left_idx)
        right_idx = self._smooth("right", right_idx)

        # Too close → ignore
        dist = left_idx.distance_to(right_idx)
        if dist < MIN_HAND_DISTANCE:
            self._stable_since = None
            return result

        result.left_index = left_idx
        result.right_index = right_idx

        # Pinch detection (normalised units for threshold independence)
        result.left_pinch = self._is_pinch(left_lm, INDEX_TIP, THUMB_TIP)
        result.right_pinch = self._is_pinch(right_lm, INDEX_TIP, THUMB_TIP)

        # Build square ROI
        square = self._build_square(left_idx, right_idx, w, h)
        result.square = square

        # Stability
        stable, progress = self._update_stability(square.size)
        result.is_stable = stable
        result.stable_progress = progress

        # Trigger logic: pinch on either hand OR sustained stability
        triggered = self._check_trigger(stable, result.left_pinch or result.right_pinch)
        result.triggered = triggered

        return result

    def extract_roi(
        self, bgr_frame: np.ndarray, square: SquareROI
    ) -> Optional[str]:
        """
        Crop the square ROI from the frame, resize to ROI_SIZE×ROI_SIZE,
        and return as a base64-encoded JPEG string.
        """
        clamped = square.clamped(bgr_frame.shape[1], bgr_frame.shape[0])
        x, y, s = int(clamped.top_left.x), int(clamped.top_left.y), int(clamped.size)
        if s < 10:
            return None

        crop = bgr_frame[y : y + s, x : x + s]
        if crop.size == 0:
            return None

        resized = cv2.resize(crop, (ROI_SIZE, ROI_SIZE), interpolation=cv2.INTER_LINEAR)
        # Flip horizontally so image matches mirrored camera view
        resized = cv2.flip(resized, 1)
        ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not ok:
            return None

        return base64.b64encode(buf.tobytes()).decode("ascii")

    def close(self) -> None:
        self._hands.close()

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _classify_hands(
        multi_lm, multi_handedness
    ) -> Tuple[Optional[object], Optional[object]]:
        """Return (left_lm, right_lm) — MediaPipe labels are mirrored."""
        left_lm = right_lm = None
        for lm, hand_info in zip(multi_lm, multi_handedness):
            label = hand_info.classification[0].label  # "Left" or "Right"
            # MediaPipe labels are from the model's perspective (mirrored selfie)
            if label == "Right":
                left_lm = lm   # user's left hand appears as MediaPipe "Right"
            else:
                right_lm = lm
        return left_lm, right_lm

    @staticmethod
    def _landmark_to_pixel(lm, w: int, h: int) -> Point:
        return Point(lm.x * w, lm.y * h)

    def _smooth(self, side: str, new_pt: Point) -> Point:
        attr = f"_smooth_{side}"
        prev: Optional[Point] = getattr(self, attr)

        if prev is None:
            setattr(self, attr, new_pt)
            return new_pt

        dx = abs(new_pt.x - prev.x)
        dy = abs(new_pt.y - prev.y)
        # Discard huge jumps (likely tracking glitch)
        if dx > 200 or dy > 200:
            return prev

        # EMA smoothing
        alpha = SMOOTHING_ALPHA
        smoothed = Point(
            prev.x * (1 - alpha) + new_pt.x * alpha,
            prev.y * (1 - alpha) + new_pt.y * alpha,
        )

        # Ignore sub-jitter movement
        if dx < JITTER_THRESHOLD and dy < JITTER_THRESHOLD:
            return prev

        setattr(self, attr, smoothed)
        return smoothed

    @staticmethod
    def _build_square(left: Point, right: Point, w: int, h: int) -> SquareROI:
        width = abs(right.x - left.x)
        top_left_x = min(left.x, right.x)
        top_left_y = min(left.y, right.y) - width * 0.1  # slight upward offset
        return SquareROI(Point(top_left_x, top_left_y), width)

    def _update_stability(self, size: float) -> Tuple[bool, float]:
        if self._prev_size is None:
            self._prev_size = size
            return False, 0.0

        size_delta = abs(size - self._prev_size)
        self._prev_size = size

        if size_delta > JITTER_THRESHOLD:
            self._stable_since = None
            return False, 0.0

        now = time.monotonic()
        if self._stable_since is None:
            self._stable_since = now

        elapsed = now - self._stable_since
        progress = min(elapsed / STABLE_DURATION, 1.0)
        return elapsed >= STABLE_DURATION, progress

    def _check_trigger(self, stable: bool, pinch: bool) -> bool:
        now = time.monotonic()
        # 3-second cooldown between triggers
        if self._triggered_at and (now - self._triggered_at) < 3.0:
            return False

        if stable or pinch:
            self._triggered_at = now
            # Reset stability so user must re-stabilise for next capture
            self._stable_since = None
            return True

        return False

    @staticmethod
    def _is_pinch(hand_lm, index_id: int, thumb_id: int) -> bool:
        idx = hand_lm.landmark[index_id]
        thumb = hand_lm.landmark[thumb_id]
        dist = np.hypot(idx.x - thumb.x, idx.y - thumb.y)
        return float(dist) < PINCH_THRESHOLD
