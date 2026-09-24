"use client";

import PosterCanvas from "./PosterCanvas";
import FilmReelSpinner from "./FilmReelSpinner";
import { genreById, cameraMoveById } from "@/lib/presets";
import type { Generation } from "@/lib/types";

export default function GenerationCard({
  generation,
  onOpen,
  onSave,
  onRemove,
  saved,
}: {
  generation: Generation;
  onOpen?: (g: Generation) => void;
  onSave?: (g: Generation) => void;
  onRemove?: (g: Generation) => void;
  saved?: boolean;
}) {
  const genre = genreById(generation.request.genre);
  const camera = cameraMoveById(generation.request.cameraMove);
  const ready = generation.status === "ready";

  return (
    <div className="group relative rounded-sm border border-line bg-marquee-raised overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={() => ready && onOpen?.(generation)}
        className="relative block w-full"
        disabled={!ready}
      >
        <PosterCanvas seed={generation.seed} request={generation.request} />
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-marquee/70 text-cream">
            <FilmReelSpinner />
            <span className="text-[11px] uppercase tracking-wider">
              {generation.status === "queued" ? "Queued…" : `Rendering ${generation.progress}%`}
            </span>
            <div className="h-0.5 w-2/3 bg-line overflow-hidden">
              <div
                className="h-full bg-gold transition-[width]"
                style={{ width: `${generation.progress}%` }}
              />
            </div>
          </div>
        )}
      </button>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <p className="text-xs text-cream line-clamp-2 leading-snug">{generation.request.prompt}</p>
        <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wider text-cream-dim">
          <span className="rounded-sm border border-line px-1.5 py-0.5">{genre.label}</span>
          <span className="rounded-sm border border-line px-1.5 py-0.5">{camera.label}</span>
          <span className="rounded-sm border border-line px-1.5 py-0.5">{generation.request.aspectRatio}</span>
        </div>
        {ready && (onSave || onRemove) && (
          <div className="mt-auto pt-1 flex gap-2">
            {onSave && (
              <button
                type="button"
                onClick={() => onSave(generation)}
                disabled={saved}
                className="flex-1 rounded-sm border border-line px-2 py-1.5 text-[11px] uppercase tracking-wider text-cream-dim hover:border-gold hover:text-gold disabled:opacity-50 disabled:hover:border-line disabled:hover:text-cream-dim transition-colors"
              >
                {saved ? "Saved ✓" : "Save to Reel"}
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(generation)}
                className="rounded-sm border border-line px-2 py-1.5 text-[11px] uppercase tracking-wider text-cream-dim hover:border-red-hot hover:text-red-hot transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
