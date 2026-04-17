/**
 * PuzzleGrid.tsx
 * Interactive N×N puzzle grid.
 * - Supports drag-and-drop tile swapping
 * - Shows tile position badges
 * - Highlights correctly placed tiles
 * - Emits onSolved callback
 */
"use client";

import { useCallback, useRef, useState } from "react";
import type { Tile, GridSize } from "@/hooks/usePuzzle";

interface Props {
  tiles: Tile[];
  gridSize: GridSize;
  imageDataUrl: string;
  tileSize: number;   // source tile dimensions in the 400×400 image
  onSwap: (posA: number, posB: number) => void;
  displaySize?: number; // rendered px width (default 480)
}

const IMAGE_SIZE = 400;

export default function PuzzleGrid({
  tiles,
  gridSize,
  imageDataUrl,
  tileSize,
  onSwap,
  displaySize = 480,
}: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const renderedTileSize = displaySize / gridSize;

  // Returns the background-position for a tile given its id (solved position)
  const bgPos = useCallback(
    (tileId: number) => {
      const col = tileId % gridSize;
      const row = Math.floor(tileId / gridSize);
      // Scale from source image size to display size
      const scale = displaySize / IMAGE_SIZE;
      const bx = -col * tileSize * scale;
      const by = -row * tileSize * scale;
      return `${bx}px ${by}px`;
    },
    [gridSize, tileSize, displaySize]
  );

  // Sorted by currentPos for rendering
  const sortedTiles = [...tiles].sort((a, b) => a.currentPos - b.currentPos);

  const handleDragStart = (pos: number) => {
    setDragFrom(pos);
    dragRef.current = pos;
  };

  const handleDrop = (pos: number) => {
    if (dragRef.current !== null && dragRef.current !== pos) {
      onSwap(dragRef.current, pos);
    }
    setDragFrom(null);
    setHoverPos(null);
    dragRef.current = null;
  };

  const handleClick = useCallback(
    (pos: number) => {
      if (dragFrom === null) {
        setDragFrom(pos);
      } else {
        onSwap(dragFrom, pos);
        setDragFrom(null);
      }
    },
    [dragFrom, onSwap]
  );

  return (
    <div
      className="puzzle-grid"
      style={{
        gridTemplateColumns: `repeat(${gridSize}, ${renderedTileSize}px)`,
        gridTemplateRows: `repeat(${gridSize}, ${renderedTileSize}px)`,
        width: displaySize,
        height: displaySize,
        gap: "3px",
      }}
      role="grid"
      aria-label={`${gridSize}×${gridSize} photo puzzle`}
    >
      {sortedTiles.map((tile) => {
        const isCorrect = tile.id === tile.currentPos;
        const isSelected = dragFrom === tile.currentPos;
        const isHover = hoverPos === tile.currentPos;

        return (
          <div
            key={tile.id}
            className={[
              "puzzle-tile",
              isCorrect ? "correct-pos" : "",
              isSelected ? "dragging" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              width: renderedTileSize,
              height: renderedTileSize,
              backgroundImage: `url(${imageDataUrl})`,
              backgroundSize: `${displaySize}px ${displaySize}px`,
              backgroundPosition: bgPos(tile.id),
              backgroundRepeat: "no-repeat",
              outline: isSelected
                ? "2px solid #00e5ff"
                : isHover && dragFrom !== null
                ? "2px dashed rgba(255,255,255,0.4)"
                : "none",
            }}
            draggable
            onDragStart={() => handleDragStart(tile.currentPos)}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverPos(tile.currentPos);
            }}
            onDragLeave={() => setHoverPos(null)}
            onDrop={() => handleDrop(tile.currentPos)}
            onDragEnd={() => {
              setDragFrom(null);
              setHoverPos(null);
              dragRef.current = null;
            }}
            onClick={() => handleClick(tile.currentPos)}
            role="gridcell"
            aria-label={`Tile ${tile.id + 1}`}
            aria-selected={isSelected}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick(tile.currentPos);
              }
            }}
          >
            {/* Tile number in corner */}
            <span className="tile-badge" aria-hidden="true">
              {tile.id + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
