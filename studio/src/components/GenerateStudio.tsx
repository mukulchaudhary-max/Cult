"use client";

import { useEffect, useRef, useState } from "react";
import PromptComposer from "./PromptComposer";
import ReelGrid from "./ReelGrid";
import Lightbox from "./Lightbox";
import { createGeneration, runGeneration } from "@/lib/generation";
import { useReel } from "@/lib/useReel";
import type { Generation, GenerationRequest, GenreId, CameraMoveId, AspectRatioId } from "@/lib/types";

const DEFAULT_REQUEST: GenerationRequest = {
  prompt: "",
  genre: "grindhouse",
  cameraMove: "static",
  aspectRatio: "2.39:1",
  duration: 4,
  mediaType: "still",
};

export default function GenerateStudio({
  initialPrompt,
  initialGenre,
  initialCameraMove,
  initialAspectRatio,
}: {
  initialPrompt?: string;
  initialGenre?: string;
  initialCameraMove?: string;
  initialAspectRatio?: string;
}) {
  const [request, setRequest] = useState<GenerationRequest>({
    ...DEFAULT_REQUEST,
    prompt: initialPrompt ?? DEFAULT_REQUEST.prompt,
    genre: (initialGenre as GenreId) ?? DEFAULT_REQUEST.genre,
    cameraMove: (initialCameraMove as CameraMoveId) ?? DEFAULT_REQUEST.cameraMove,
    aspectRatio: (initialAspectRatio as AspectRatioId) ?? DEFAULT_REQUEST.aspectRatio,
  });
  const [queue, setQueue] = useState<Generation[]>([]);
  const [viewing, setViewing] = useState<Generation | null>(null);
  const cleanupsRef = useRef<Map<string, () => void>>(new Map());
  const { save, remove, isSaved } = useReel();

  useEffect(() => {
    const cleanups = cleanupsRef.current;
    return () => {
      cleanups.forEach((cancel) => cancel());
    };
  }, []);

  function patchRequest(patch: Partial<GenerationRequest>) {
    setRequest((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmit() {
    const generation = createGeneration(request);
    setQueue((prev) => [generation, ...prev]);

    const cancel = runGeneration(generation, (patch) => {
      setQueue((prev) =>
        prev.map((g) => (g.id === generation.id ? { ...g, ...patch } : g))
      );
    });
    cleanupsRef.current.set(generation.id, cancel);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 grid gap-10 lg:grid-cols-[340px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start rounded-sm border border-line bg-marquee-raised p-5">
        <h1 className="font-display text-3xl mb-1">Shot Sheet</h1>
        <p className="text-xs text-cream-dim mb-6">
          Block the scene, pick the film stock, call action.
        </p>
        <PromptComposer
          request={request}
          onChange={patchRequest}
          onSubmit={handleSubmit}
          submitting={false}
        />
      </aside>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">Dailies</h2>
          <span className="text-xs text-cream-dim uppercase tracking-wider">
            {queue.length} render{queue.length === 1 ? "" : "s"} this session
          </span>
        </div>

        {queue.length === 0 ? (
          <div className="rounded-sm border border-dashed border-line p-10 text-center text-cream-dim">
            <p className="font-display text-xl text-cream mb-2">The reel is empty.</p>
            <p className="text-sm max-w-sm mx-auto">
              Write a scene on the left and hit <span className="text-gold">Action!</span> —
              renders show up here as they come off the line.
            </p>
          </div>
        ) : (
          <ReelGrid
            generations={queue}
            onOpen={setViewing}
            onSave={save}
            isSaved={isSaved}
          />
        )}
      </section>

      {viewing && (
        <Lightbox
          generation={viewing}
          onClose={() => setViewing(null)}
          footer={
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => save(viewing)}
                disabled={isSaved(viewing.id)}
                className="flex-1 rounded-sm border border-line px-3 py-2 text-xs uppercase tracking-wider text-cream-dim hover:border-gold hover:text-gold disabled:opacity-50 transition-colors"
              >
                {isSaved(viewing.id) ? "Saved to Reel ✓" : "Save to My Reel"}
              </button>
              <button
                type="button"
                onClick={() => remove(viewing.id)}
                className="rounded-sm border border-line px-3 py-2 text-xs uppercase tracking-wider text-cream-dim hover:border-red-hot hover:text-red-hot transition-colors"
              >
                Discard
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
