"use client";

import { useEffect } from "react";
import PosterCanvas from "./PosterCanvas";
import { genreById, cameraMoveById, aspectRatioById } from "@/lib/presets";
import type { Generation } from "@/lib/types";

export default function Lightbox({
  generation,
  onClose,
  footer,
}: {
  generation: Generation;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const genre = genreById(generation.request.genre);
  const camera = cameraMoveById(generation.request.cameraMove);
  const aspect = aspectRatioById(generation.request.aspectRatio);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-w-3xl w-full grid gap-0 rounded-sm border border-line bg-marquee-raised md:grid-cols-[1.3fr_1fr] overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-black flex items-center justify-center">
          <PosterCanvas seed={generation.seed} request={generation.request} />
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-2xl leading-tight">{genre.label}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-cream-dim hover:text-cream text-sm uppercase tracking-wider"
            >
              Close ✕
            </button>
          </div>
          <p className="text-sm text-cream leading-relaxed">{generation.request.prompt}</p>
          <dl className="text-xs text-cream-dim space-y-1.5">
            <div className="flex justify-between border-b border-line pb-1.5">
              <dt className="uppercase tracking-wider">Camera</dt>
              <dd className="text-cream">{camera.label}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-1.5">
              <dt className="uppercase tracking-wider">Aspect</dt>
              <dd className="text-cream">{aspect.label}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-1.5">
              <dt className="uppercase tracking-wider">Format</dt>
              <dd className="text-cream capitalize">{generation.request.mediaType}</dd>
            </div>
            {generation.request.mediaType === "clip" && (
              <div className="flex justify-between border-b border-line pb-1.5">
                <dt className="uppercase tracking-wider">Duration</dt>
                <dd className="text-cream">{generation.request.duration}s</dd>
              </div>
            )}
          </dl>
          {footer}
        </div>
      </div>
    </div>
  );
}
