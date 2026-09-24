"use client";

import { useEffect, useRef } from "react";
import { paintPoster } from "@/lib/poster";
import { aspectRatioById } from "@/lib/presets";
import type { GenerationRequest } from "@/lib/types";

export default function PosterCanvas({
  seed,
  request,
  className,
  showSlate = true,
}: {
  seed: string;
  request: Pick<GenerationRequest, "genre" | "cameraMove" | "aspectRatio">;
  className?: string;
  showSlate?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = aspectRatioById(request.aspectRatio);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = 640;
    canvas.width = aspect.ratio >= 1 ? base : Math.round(base * aspect.ratio);
    canvas.height = aspect.ratio >= 1 ? Math.round(base / aspect.ratio) : base;
    paintPoster(canvas, seed, request, { showSlate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, request.genre, request.cameraMove, request.aspectRatio, showSlate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ aspectRatio: aspect.ratio, width: "100%", display: "block" }}
    />
  );
}
