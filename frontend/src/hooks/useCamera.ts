/**
 * useCamera.ts
 * getUserMedia wrapper hook – manages stream lifecycle, video element ref,
 * and exposes a canvas-capture helper for JPEG frame encoding.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "active" | "denied" | "error";

const CAPTURE_WIDTH = 640;   // px – resize before sending to backend
const CAPTURE_HEIGHT = 360;  // maintain 16:9 for preview
const JPEG_QUALITY = 0.7;

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  /** Call this from a user-gesture handler (button/click) */
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  /** Encode current video frame as base64 JPEG data-URL */
  captureFrame: () => string | null;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  // Lazily create off-screen capture canvas
  const getCaptureCanvas = useCallback((): HTMLCanvasElement => {
    if (!captureCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = CAPTURE_WIDTH;
      c.height = CAPTURE_HEIGHT;
      captureCanvasRef.current = c;
    }
    return captureCanvasRef.current;
  }, []);

  const startCamera = useCallback(async () => {
    if (status === "active") return;
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("active");
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      setStatus(name === "NotAllowedError" ? "denied" : "error");
    }
  }, [status]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

    const canvas = getCaptureCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  }, [getCaptureCanvas]);

  // Cleanup on unmount
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  return { videoRef, status, startCamera, stopCamera, captureFrame };
}
