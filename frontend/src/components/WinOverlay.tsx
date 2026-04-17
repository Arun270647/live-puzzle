/**
 * WinOverlay.tsx
 * Displayed when the puzzle is solved.
 */
"use client";

interface Props {
  onPlayAgain: () => void;
  onNewPuzzle: () => void;
  moveCount?: number;
}

export default function WinOverlay({ onPlayAgain, onNewPuzzle, moveCount }: Props) {
  return (
    <div className="win-overlay" role="dialog" aria-label="Puzzle solved!" aria-modal="true">
      <div className="glass-card win-card flex-col flex-center gap-6">
        <div className="confetti-emoji" aria-hidden="true">🎉</div>
        <div className="flex-col flex-center gap-2">
          <h2 className="gradient-text">Puzzle Solved!</h2>
          {moveCount !== undefined && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Completed in&nbsp;<strong style={{ color: "var(--accent-cyan)" }}>{moveCount}</strong>&nbsp;swaps
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button id="btn-play-again" className="btn btn-primary" onClick={onPlayAgain}>
            🔄 Shuffle Again
          </button>
          <button id="btn-new-puzzle" className="btn btn-ghost" onClick={onNewPuzzle}>
            📸 New Capture
          </button>
        </div>
      </div>
    </div>
  );
}
