"""
server.py
FastAPI WebSocket server for the gesture-controlled puzzle.

Protocol (JSON messages over WebSocket):

Client → Server:
  { "type": "frame", "data": "<base64 JPEG>" }
  { "type": "ping" }

Server → Client:
  { "type": "tracking", "square": {...}, "is_stable": bool,
    "stable_progress": float, "left_index": {...}, "right_index": {...} }
  { "type": "capture", "image": "<base64 JPEG>", "size": 400 }
  { "type": "error", "message": "..." }
  { "type": "pong" }
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Any, Dict

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from hand_tracker import HandTracker, SquareROI

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
log = logging.getLogger("puzzle-server")

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Live Puzzle Hand Tracking Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate limiting ─────────────────────────────────────────────────────────────

MAX_FPS = 20
FRAME_INTERVAL = 1.0 / MAX_FPS

# Maximum incoming frame size (5 MB after base64-decode)
MAX_FRAME_BYTES = 5 * 1024 * 1024


# ── WebSocket handler ─────────────────────────────────────────────────────────

@app.websocket("/ws/track")
async def track_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    tracker = HandTracker()
    last_processed = 0.0
    log.info("Client connected: %s", ws.client)

    try:
        while True:
            raw = await ws.receive_text()

            # Parse message
            try:
                msg: Dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(ws, "Invalid JSON")
                continue

            msg_type = msg.get("type")

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
                continue

            if msg_type != "frame":
                await _send_error(ws, f"Unknown message type: {msg_type}")
                continue

            # Rate limiting
            now = time.monotonic()
            if now - last_processed < FRAME_INTERVAL:
                continue
            last_processed = now

            # Decode frame
            frame = _decode_frame(msg.get("data", ""))
            if frame is None:
                await _send_error(ws, "Invalid frame data")
                continue

            # Run hand tracking in thread pool (CPU-bound)
            result = await asyncio.get_event_loop().run_in_executor(
                None, tracker.process_frame, frame
            )

            # Build tracking payload
            tracking_payload: Dict[str, Any] = {
                "type": "tracking",
                "is_stable": result.is_stable,
                "stable_progress": round(result.stable_progress, 3),
                "square": result.square.to_dict() if result.square else None,
                "left_index": (
                    {"x": int(result.left_index.x), "y": int(result.left_index.y)}
                    if result.left_index else None
                ),
                "right_index": (
                    {"x": int(result.right_index.x), "y": int(result.right_index.y)}
                    if result.right_index else None
                ),
                "left_pinch": result.left_pinch,
                "right_pinch": result.right_pinch,
            }
            await ws.send_text(json.dumps(tracking_payload))

            # Fire capture event if triggered
            if result.triggered and result.square:
                log.info("Capture triggered – extracting ROI")
                roi_b64 = await asyncio.get_event_loop().run_in_executor(
                    None, tracker.extract_roi, frame, result.square
                )
                if roi_b64:
                    capture_payload = {
                        "type": "capture",
                        "image": roi_b64,
                        "size": 400,
                    }
                    await ws.send_text(json.dumps(capture_payload))
                    log.info("ROI sent to client (%d bytes)", len(roi_b64))

    except WebSocketDisconnect:
        log.info("Client disconnected: %s", ws.client)
    except Exception as exc:
        log.exception("Unhandled error in WebSocket handler: %s", exc)
    finally:
        tracker.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode_frame(b64_data: str) -> np.ndarray | None:
    """Decode a base64 JPEG string into a BGR numpy array."""
    if not isinstance(b64_data, str) or not b64_data:
        return None

    # Strip data URL prefix if present
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]

    try:
        raw = base64.b64decode(b64_data)
    except Exception:
        return None

    if len(raw) > MAX_FRAME_BYTES:
        return None

    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return frame  # None if decode failed


async def _send_error(ws: WebSocket, message: str) -> None:
    try:
        await ws.send_text(json.dumps({"type": "error", "message": message}))
    except Exception:
        pass


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
