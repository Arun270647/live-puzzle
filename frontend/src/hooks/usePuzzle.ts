/**
 * usePuzzle.ts
 * Pure game-logic hook. Handles:
 *  - Splitting an image into N×N tiles
 *  - Shuffling (guaranteed solvable)
 *  - Drag-to-swap / click-to-swap interaction
 *  - Win detection
 */
"use client";

import { useCallback, useState } from "react";

export type GridSize = 3 | 4;

export interface Tile {
  id: number;        // 0-based index into solved order
  currentPos: number; // position in the displayed grid (0-based)
}

export interface UsePuzzleReturn {
  tiles: Tile[];
  gridSize: GridSize;
  isSolved: boolean;
  imageDataUrl: string | null;
  tileSize: number;  // px dimension of each tile in the original image
  /** Load an image (base64 data URL) and start a new puzzle */
  startPuzzle: (dataUrl: string, grid?: GridSize) => void;
  /** Swap two tiles by their currentPos indices */
  swapTiles: (posA: number, posB: number) => void;
  reset: () => void;
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


function makeSolvableShuffle(n: number): number[] {
  const count = n * n;
  let order = Array.from({ length: count }, (_, i) => i);

  // Keep shuffling until we get a solvable permutation
  // (For flat puzzles without a blank tile: any permutation is "solvable"
  //  since we allow arbitrary swaps. We still shuffle at least 3 times to
  //  ensure the puzzle is not trivially solved.)
  order = shuffleArray(order);

  // Guarantee at least some scramble (not identity)
  while (order.every((v, i) => v === i)) {
    order = shuffleArray(order);
  }

  return order;
}

const IMAGE_SIZE = 400; // fixed ROI size from backend

export function usePuzzle(): UsePuzzleReturn {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [gridSize, setGridSize] = useState<GridSize>(3);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isSolved, setIsSolved] = useState(false);

  const tileSize = Math.floor(IMAGE_SIZE / gridSize);

  const startPuzzle = useCallback((dataUrl: string, grid: GridSize = 3) => {
    const fullUrl = dataUrl.startsWith("data:")
      ? dataUrl
      : `data:image/jpeg;base64,${dataUrl}`;

    setImageDataUrl(fullUrl);
    setGridSize(grid);
    setIsSolved(false);

    const order = makeSolvableShuffle(grid);
    const newTiles: Tile[] = order.map((id, currentPos) => ({ id, currentPos }));
    setTiles(newTiles);
  }, []);

  const swapTiles = useCallback((posA: number, posB: number) => {
    if (posA === posB) return;

    setTiles((prev) => {
      const next = [...prev];
      const idxA = next.findIndex((t) => t.currentPos === posA);
      const idxB = next.findIndex((t) => t.currentPos === posB);
      if (idxA === -1 || idxB === -1) return prev;

      next[idxA] = { ...next[idxA], currentPos: posB };
      next[idxB] = { ...next[idxB], currentPos: posA };

      // Check win condition: every tile is in its solved position
      const solved = next.every((t) => t.id === t.currentPos);
      setIsSolved(solved);

      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (!imageDataUrl) return;
    const order = makeSolvableShuffle(gridSize);
    const newTiles: Tile[] = order.map((id, currentPos) => ({ id, currentPos }));
    setTiles(newTiles);
    setIsSolved(false);
  }, [imageDataUrl, gridSize]);

  return { tiles, gridSize, isSolved, imageDataUrl, tileSize, startPuzzle, swapTiles, reset };
}
