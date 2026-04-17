"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { useWebSocket } from "@/hooks/useWebSocket";
import { usePuzzle, GridSize } from "@/hooks/usePuzzle";
import OverlayCanvas, { TrackingData } from "@/components/OverlayCanvas";
import PuzzleGrid from "@/components/PuzzleGrid";
import WinOverlay from "@/components/WinOverlay";

const WS_URL = "ws://localhost:8000/ws/track";
const FRAME_INTERVAL_MS = 50; // ~20 FPS

type AppPhase = "landing" | "camera" | "puzzle";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("landing");
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [gridSize, setGridSize] = useState<GridSize>(3);
  const [moveCount, setMoveCount] = useState(0);
  const [captureFlash, setCaptureFlash] = useState(false);

  const cameraWrapperRef = useRef<HTMLDivElement>(null);
  const [overlaySize, setOverlaySize] = useState({ w: 800, h: 450 });

  const { videoRef, status: camStatus, startCamera, stopCamera, captureFrame } = useCamera();
  const { tiles, isSolved, imageDataUrl, tileSize, startPuzzle, swapTiles, reset } = usePuzzle();

  // ── WebSocket callbacks — stable refs ─────────────────────────────────────
  const gridSizeRef = useRef(gridSize);
  useEffect(() => {
    gridSizeRef.current = gridSize;
  }, [gridSize]);

  const handleGoToPuzzle = useCallback(
    (imgData: string) => {
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 600);
      startPuzzle(imgData, gridSizeRef.current);
      setPhase("puzzle");
      setMoveCount(0);
    },
    [startPuzzle],
  );

  const handleWsMessage = useCallback(
    (raw: string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "tracking") {
        setTracking(msg as unknown as TrackingData);
      } else if (msg.type === "capture") {
        const imgData = msg.image as string;
        if (imgData) handleGoToPuzzle(imgData);
      }
    },
    [handleGoToPuzzle],
  );

  // Single WS instance — autoConnect=false, we call `connect` manually
  const { status: wsStatus, sendMessage, connect: wsConnect } = useWebSocket({
    url: WS_URL,
    onMessage: handleWsMessage,
    autoConnect: false,
  });

  // ── Connect WS when entering camera phase ─────────────────────────────────
  useEffect(() => {
    if (phase === "camera") wsConnect();
  }, [phase, wsConnect]);

  // ── Frame sender loop ──────────────────────────────────────────────────────
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const active = phase === "camera" && camStatus === "active" && wsStatus === "connected";
    if (active) {
      frameTimerRef.current = setInterval(() => {
        const frame = captureFrame();
        if (frame) sendMessage(JSON.stringify({ type: "frame", data: frame }));
      }, FRAME_INTERVAL_MS);
    }
    return () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    };
  }, [phase, camStatus, wsStatus, captureFrame, sendMessage]);

  // ── Overlay resize observer ────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraWrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries)
        setOverlaySize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    obs.observe(cameraWrapperRef.current);
    return () => obs.disconnect();
  }, [phase]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setPhase("camera");
    await startCamera();
  };

  const handleNewPuzzle = () => {
    setPhase("camera");
    setTracking(null);
    startCamera();
  };

  const handleSwap = (posA: number, posB: number) => {
    swapTiles(posA, posB);
    setMoveCount((c) => c + 1);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-bg" aria-hidden="true" />

      {/* ────────────────────────── LANDING ────────────────────────────── */}
      {phase === "landing" && (
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            gap: "2.5rem",
          }}
        >
          <header className="flex-col flex-center gap-4 text-center">
            <div style={{ fontSize: "3.5rem" }} aria-hidden="true">✋</div>
            <h1>
              <span className="gradient-text">Live Puzzle</span>
            </h1>
            <p style={{ maxWidth: "480px", fontSize: "1.05rem" }}>
              Use your hands to frame any scene — pinch to capture it, then solve the{" "}
              <strong style={{ color: "var(--accent-cyan)" }}>gesture-powered</strong> sliding
              puzzle.
            </p>
          </header>

          <div
            className="glass-card"
            style={{ padding: "2rem 2.5rem", maxWidth: "420px", width: "100%" }}
          >
            <h3 style={{ marginBottom: "1rem", color: "var(--text-primary)" }}>Configuration</h3>
            <label
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              Grid size
            </label>
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {([3, 4] as GridSize[]).map((g) => (
                <button
                  key={g}
                  id={`btn-grid-${g}`}
                  onClick={() => setGridSize(g)}
                  className="btn"
                  style={{
                    flex: 1,
                    background:
                      gridSize === g
                        ? "linear-gradient(135deg, var(--accent-violet), var(--accent-cyan))"
                        : "var(--bg-glass)",
                    color: "#fff",
                    border: `1px solid ${gridSize === g ? "transparent" : "var(--border-subtle)"}`,
                    boxShadow:
                      gridSize === g ? "0 4px 20px rgba(124,58,237,0.35)" : "none",
                  }}
                >
                  {g}×{g}
                </button>
              ))}
            </div>

            <div className="divider" style={{ marginBottom: "1.5rem" }} />

            <ol
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                lineHeight: 1.8,
                paddingLeft: "1.25rem",
              }}
            >
              <li>Allow camera access</li>
              <li>Raise both index fingers</li>
              <li>Frame the region you want</li>
              <li>Pinch OR hold steady → capture!</li>
              <li>Solve the puzzle 🧩</li>
            </ol>
          </div>

          <button
            id="btn-start"
            className="btn btn-primary"
            style={{ fontSize: "1rem", padding: "0.8rem 2.5rem" }}
            onClick={handleStart}
          >
            📸 Start Camera
          </button>

          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Make sure the Python backend is running on{" "}
            <code style={{ color: "var(--accent-cyan)", fontFamily: "monospace" }}>
              localhost:8000
            </code>
          </p>
        </main>
      )}

      {/* ────────────────────────── CAMERA ─────────────────────────────── */}
      {phase === "camera" && (
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            gap: "1.5rem",
          }}
        >
          <header className="flex-col flex-center gap-2 text-center">
            <h1 style={{ fontSize: "1.6rem" }}>
              <span className="gradient-text">Live Puzzle</span>
            </h1>
            <p style={{ fontSize: "0.875rem" }}>
              Frame a region with both index fingers — pinch or hold to capture
            </p>
          </header>

          {/* Status */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <StatusBadge cam={camStatus} ws={wsStatus} tracking={tracking} />
          </div>

          {/* Camera wrapper */}
          <div
            ref={cameraWrapperRef}
            className="camera-wrapper"
            style={{
              outline: captureFlash ? "3px solid var(--accent-green)" : undefined,
              transition: "outline 0.3s ease",
            }}
          >
            <video
              id="puzzle-camera-video"
              ref={videoRef}
              className="camera-video"
              playsInline
              muted
              autoPlay
            />
            <OverlayCanvas
              tracking={tracking}
              canvasWidth={overlaySize.w}
              canvasHeight={overlaySize.h}
            />

            {camStatus === "denied" && (
              <div
                className="flex-center"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(5,7,15,0.85)",
                  flexDirection: "column",
                  gap: "1rem",
                  padding: "2rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "2.5rem" }}>🚫</span>
                <p>Camera access denied. Please allow camera in browser settings.</p>
              </div>
            )}

            {wsStatus !== "connected" && (
              <div
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  left: "0.75rem",
                  background: "rgba(5,7,15,0.75)",
                  borderRadius: "0.5rem",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                ⚡ Connecting to backend…
              </div>
            )}
          </div>

          {/* Controls */}
          <div
            style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {([3, 4] as GridSize[]).map((g) => (
                <button
                  key={g}
                  id={`btn-cam-grid-${g}`}
                  onClick={() => setGridSize(g)}
                  className="btn btn-ghost"
                  style={{
                    background:
                      gridSize === g ? "rgba(124,58,237,0.25)" : undefined,
                    borderColor:
                      gridSize === g ? "var(--accent-violet)" : undefined,
                  }}
                >
                  {g}×{g}
                </button>
              ))}
            </div>
            <button
              id="btn-back-landing"
              className="btn btn-ghost"
              onClick={() => {
                stopCamera();
                setPhase("landing");
                setTracking(null);
              }}
            >
              ← Back
            </button>
          </div>
        </main>
      )}

      {/* ────────────────────────── PUZZLE ─────────────────────────────── */}
      {phase === "puzzle" && imageDataUrl && (
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            gap: "1.5rem",
          }}
        >
          <header className="flex-col flex-center gap-2 text-center">
            <h1 style={{ fontSize: "1.6rem" }}>
              <span className="gradient-text">Live Puzzle</span>
            </h1>
            <p style={{ fontSize: "0.85rem" }}>
              Drag or click tiles to swap — get them back in order!
            </p>
          </header>

          {/* Stats */}
          <div
            style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", justifyContent: "center" }}
          >
            <StatChip label="Grid" value={`${gridSize}×${gridSize}`} />
            <StatChip label="Swaps" value={String(moveCount)} />
            <StatChip
              label="Wrong"
              value={String(tiles.filter((t) => t.id !== t.currentPos).length)}
            />
          </div>

          <PuzzleGrid
            tiles={tiles}
            gridSize={gridSize}
            imageDataUrl={imageDataUrl}
            tileSize={tileSize}
            onSwap={handleSwap}
            displaySize={480}
          />

          <div
            style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}
          >
            <button
              id="btn-shuffle"
              className="btn btn-ghost"
              onClick={() => {
                reset();
                setMoveCount(0);
              }}
            >
              🔀 Shuffle
            </button>
            <button id="btn-new-capture" className="btn btn-primary" onClick={handleNewPuzzle}>
              📸 New Capture
            </button>
          </div>

          {isSolved && (
            <WinOverlay
              onPlayAgain={() => {
                reset();
                setMoveCount(0);
              }}
              onNewPuzzle={handleNewPuzzle}
              moveCount={moveCount}
            />
          )}
        </main>
      )}
    </>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function StatusBadge({
  cam,
  ws,
  tracking,
}: {
  cam: string;
  ws: string;
  tracking: TrackingData | null;
}) {
  const hasHands = tracking?.left_index || tracking?.right_index;
  const isStable = tracking?.is_stable;

  if (isStable)
    return (
      <span className="status-badge badge-stable">
        <span className="dot dot-pulse" />
        Stable — Capturing…
      </span>
    );
  if (hasHands)
    return (
      <span className="status-badge badge-detect">
        <span className="dot dot-pulse" />
        Hands Detected
      </span>
    );
  if (ws === "connected" && cam === "active")
    return (
      <span className="status-badge badge-idle">
        <span className="dot" />
        Waiting for hands…
      </span>
    );
  if (cam === "requesting")
    return (
      <span className="status-badge badge-idle">
        <span className="dot dot-pulse" />
        Requesting camera…
      </span>
    );
  return (
    <span className="status-badge badge-idle">
      <span className="dot" />
      {ws === "connecting" ? "Connecting to backend…" : "Initialising…"}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card" style={{ padding: "0.5rem 1rem", textAlign: "center", minWidth: "80px" }}>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-cyan)" }}>{value}</div>
      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </div>
  );
}
