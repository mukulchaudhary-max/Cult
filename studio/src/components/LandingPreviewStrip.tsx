"use client";

import PosterCanvas from "./PosterCanvas";
import { NOW_SHOWING } from "@/lib/presets";
import type { AspectRatioId, CameraMoveId, GenreId } from "@/lib/types";

const SAMPLE = NOW_SHOWING.slice(0, 6);

export default function LandingPreviewStrip() {
  return (
    <div className="flex items-start gap-3 overflow-x-hidden">
      {SAMPLE.map((item, i) => (
        <div
          key={item.seed}
          className={`shrink-0 w-40 sm:w-48 rounded-sm border border-line overflow-hidden ${
            i % 2 === 0 ? "translate-y-0" : "translate-y-4"
          }`}
        >
          <PosterCanvas
            seed={item.seed}
            request={{
              genre: item.genre as GenreId,
              cameraMove: item.cameraMove as CameraMoveId,
              aspectRatio: item.aspectRatio as AspectRatioId,
            }}
            showSlate={false}
          />
        </div>
      ))}
    </div>
  );
}
