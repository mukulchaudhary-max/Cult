"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PosterCanvas from "./PosterCanvas";
import Lightbox from "./Lightbox";
import OptionChips from "./OptionChips";
import { GENRES, NOW_SHOWING, genreById } from "@/lib/presets";
import type { Generation } from "@/lib/types";

const ITEMS: Generation[] = NOW_SHOWING.map((item, i) => ({
  id: `now-showing-${i}`,
  seed: item.seed,
  createdAt: Date.now(),
  status: "ready",
  progress: 100,
  request: {
    prompt: item.prompt,
    genre: item.genre as Generation["request"]["genre"],
    cameraMove: item.cameraMove as Generation["request"]["cameraMove"],
    aspectRatio: item.aspectRatio as Generation["request"]["aspectRatio"],
    duration: 4,
    mediaType: "still",
  },
}));

export default function NowShowingBoard() {
  const [filter, setFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<Generation | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? ITEMS : ITEMS.filter((i) => i.request.genre === filter)),
    [filter]
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl mb-2">Now Showing</h1>
        <p className="text-cream-dim text-sm max-w-xl">
          A sample of what comes out of the studio. Nothing here is a real
          film — every frame is generated procedurally as a demo. Like a
          look? Hit remix to load its exact settings into the Shot Sheet.
        </p>
      </div>

      <div className="mb-6 overflow-x-auto">
        <OptionChips
          options={[{ id: "all", label: "All Genres" }, ...GENRES.map((g) => ({ id: g.id, label: g.label }))]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
        {filtered.map((item) => {
          const genre = genreById(item.request.genre);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setViewing(item)}
              className="group text-left rounded-sm border border-line bg-marquee-raised overflow-hidden hover:border-gold/60 transition-colors"
            >
              <PosterCanvas seed={item.seed} request={item.request} />
              <div className="p-3">
                <p className="text-xs text-cream line-clamp-2 leading-snug">{item.request.prompt}</p>
                <span className="mt-2 inline-block text-[10px] uppercase tracking-wider text-gold">
                  {genre.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {viewing && (
        <Lightbox
          generation={viewing}
          onClose={() => setViewing(null)}
          footer={
            <Link
              href={`/generate?prompt=${encodeURIComponent(viewing.request.prompt)}&genre=${viewing.request.genre}&cameraMove=${viewing.request.cameraMove}&aspectRatio=${encodeURIComponent(viewing.request.aspectRatio)}`}
              className="block text-center rounded-sm bg-red px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-cream hover:bg-red-hot transition-colors"
            >
              Remix This Shot
            </Link>
          }
        />
      )}
    </div>
  );
}
