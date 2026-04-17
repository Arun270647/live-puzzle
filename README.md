# Live Puzzle 🧩✋

A production-ready **gesture-controlled photo puzzle** built with:
- **Frontend**: Next.js 15 (App Router) + Vanilla CSS
- **Backend**: Python FastAPI + WebSocket + OpenCV + MediaPipe Hands

---

## Architecture

```
browser
  │  WebSocket (ws://localhost:8000/ws/track)
  ▼
FastAPI server (backend/server.py)
  │  frames → MediaPipe → landmarks → square + trigger events
  ▼
hand_tracker.py  ←  OpenCV  ←  MediaPipe
```

---

## Quick Start

### 1 — Backend

```powershell
# From project root (live-puzzle/)
python -m venv venv
.\venv\Scripts\pip install -r backend\requirements.txt
cd backend
..\venv\Scripts\uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Or use the convenience script:
```powershell
python start_backend.py
```

### 2 — Frontend

```powershell
cd frontend
npm install      # already done if scaffold succeeded
npm run dev      # http://localhost:3000
```

---

## Gesture Guide

| Action | Effect |
|--------|--------|
| Raise both index fingers | Activates tracking |
| Spread apart | Define square ROI |
| Hold still 1.5 s | Auto-capture |
| Pinch (thumb + index) | Instant capture |

---

## Puzzle Interaction

| Action | Effect |
|--------|--------|
| Drag tile | Swap with drop target |
| Click tile | Select; click another to swap |
| Keyboard Enter/Space | Select/swap for accessibility |

---

## File Map

```
live-puzzle/
├── backend/
│   ├── hand_tracker.py     ← MediaPipe + stabilization + ROI extraction
│   ├── server.py           ← FastAPI WebSocket server
│   └── requirements.txt
├── frontend/src/
│   ├── app/
│   │   ├── layout.tsx      ← Root layout + SEO
│   │   ├── globals.css     ← Design system (dark, glassmorphism)
│   │   └── page.tsx        ← Landing / Camera / Puzzle phase controller
│   ├── components/
│   │   ├── OverlayCanvas.tsx  ← Canvas overlay (square, dots, progress arc)
│   │   ├── PuzzleGrid.tsx     ← N×N drag-and-swap grid
│   │   └── WinOverlay.tsx     ← Win celebration dialog
│   └── hooks/
│       ├── useCamera.ts       ← getUserMedia + frame capture
│       ├── useWebSocket.ts    ← WS with auto-reconnect + keepalive
│       └── usePuzzle.ts       ← Tile state, shuffle, swap, win detection
├── start_backend.py
└── README.md
```

---

## Performance

- Frames capped at **20 FPS** on both send and process sides
- Frames downscaled to **640×360** before sending
- MediaPipe `model_complexity=0` (fastest model)
- Backend uses `asyncio.run_in_executor` so frame processing never blocks the event loop

## Security

- Maximum frame size validated (5 MB)
- Data URL prefix stripped before decode
- CORS locked to `localhost:3000`
- No client-provided coordinates used server-side
