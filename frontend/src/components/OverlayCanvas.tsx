/**
 * OverlayCanvas.tsx
 * Canvas drawn on top of the camera feed.
 * Renders:
 *  - Index finger dots for each hand
 *  - The bounding square (cyan → green when stable)
 *  - "Hold to Capture" progress arc
 *  - Pinch flash effect
 */
"use client";

import { useEffect, useRef } from "react";

export interface TrackingData {
  square: { x: number; y: number; size: number } | null;
  is_stable: boolean;
  stable_progress: number;
  left_index: { x: number; y: number } | null;
  right_index: { x: number; y: number } | null;
  left_pinch: boolean;
  right_pinch: boolean;
  frame_w: number;
  frame_h: number;
}

interface Props {
  tracking: TrackingData | null;
  canvasWidth: number;
  canvasHeight: number;
}

const FRAME_W = 640;
const FRAME_H = 360;

function scale(
  val: number,
  fromMax: number,
  toMax: number,
): number {
  return (val / fromMax) * toMax;
}

export default function OverlayCanvas({ tracking, canvasWidth, canvasHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!tracking) return;

    const sx = (v: number) => scale(v, FRAME_W, canvasWidth);
    const sy = (v: number) => scale(v, FRAME_H, canvasHeight);

    // ── Draw square ROI ───────────────────────────────────────────────────────
    if (tracking.square) {
      const { x, y, size } = tracking.square;
      const rx = sx(x);
      const ry = sy(y);
      const rs = sx(size);

      const isStable = tracking.is_stable;
      const progress = tracking.stable_progress;

      // Glow shadow
      ctx.shadowBlur = isStable ? 24 : 12;
      ctx.shadowColor = isStable ? "rgba(0,230,118,0.6)" : "rgba(0,229,255,0.35)";

      // Box
      ctx.strokeStyle = isStable ? "#00e676" : "#00e5ff";
      ctx.lineWidth = isStable ? 3 : 2;
      ctx.setLineDash(isStable ? [] : [10, 6]);
      ctx.strokeRect(rx, ry, rs, rs);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Corner accents
      const cLen = 20;
      ctx.strokeStyle = isStable ? "#00e676" : "#00e5ff";
      ctx.lineWidth = 3;
      const corners: [number, number, number, number][] = [
        [rx, ry, cLen, cLen],
        [rx + rs - cLen, ry, cLen, cLen],
        [rx, ry + rs - cLen, cLen, cLen],
        [rx + rs - cLen, ry + rs - cLen, cLen, cLen],
      ];
      for (const [cx, cy, cw, ch] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + ch);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + cw, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + cw, cy + ch - ch);
        ctx.lineTo(cx + cw, cy + ch);
        ctx.lineTo(cx, cy + ch);
        ctx.stroke();
      }

      // Progress arc in top-right corner
      if (progress > 0) {
        const arcR = 18;
        const arcX = rx + rs - arcR - 6;
        const arcY = ry + arcR + 6;
        ctx.strokeStyle = isStable ? "#00e676" : "#00e5ff";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(arcX, arcY, arcR, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
        ctx.stroke();
        ctx.lineCap = "butt";

        // bg arc
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(arcX, arcY, arcR, -Math.PI / 2 + 2 * Math.PI * progress, -Math.PI / 2 + 2 * Math.PI);
        ctx.stroke();

        // Label
        if (!isStable) {
          ctx.fillStyle = "#00e5ff";
          ctx.font = "bold 11px system-ui";
          ctx.textAlign = "center";
          ctx.fillText("HOLD", arcX, arcY + 4);
        }
      }

      // Stable flash
      if (isStable) {
        ctx.fillStyle = "rgba(0,230,118,0.06)";
        ctx.fillRect(rx, ry, rs, rs);
        ctx.fillStyle = "#00e676";
        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("✓ STABLE", rx + rs / 2, ry + rs + 18);
      }
    }

    // ── Finger dots ───────────────────────────────────────────────────────────
    const drawDot = (pt: { x: number; y: number }, color: string, pinch: boolean) => {
      const px = sx(pt.x);
      const py = sy(pt.y);
      const r = pinch ? 10 : 7;

      ctx.shadowBlur = pinch ? 20 : 8;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.stroke();
    };

    if (tracking.left_index) {
      drawDot(tracking.left_index, "#00e5ff", tracking.left_pinch);
    }
    if (tracking.right_index) {
      drawDot(tracking.right_index, "#e040fb", tracking.right_pinch);
    }

    // ── "Raise both hands" hint when no tracking ──────────────────────────────
    if (!tracking.left_index && !tracking.right_index) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("✋ Raise both index fingers ✋", canvasWidth / 2, canvasHeight / 2);
    }
  }, [tracking, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      className="camera-canvas"
      aria-hidden="true"
    />
  );
}
