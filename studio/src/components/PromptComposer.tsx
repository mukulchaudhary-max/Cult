"use client";

import { ASPECT_RATIOS, CAMERA_MOVES, DURATIONS, GENRES } from "@/lib/presets";
import type { GenerationRequest } from "@/lib/types";
import OptionChips from "./OptionChips";

export default function PromptComposer({
  request,
  onChange,
  onSubmit,
  submitting,
}: {
  request: GenerationRequest;
  onChange: (patch: Partial<GenerationRequest>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const canSubmit = request.prompt.trim().length > 3 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <div>
        <label htmlFor="prompt" className="block text-xs uppercase tracking-wider text-cream-dim mb-2">
          Scene description
        </label>
        <textarea
          id="prompt"
          value={request.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="A drive-in movie screen glowing over an empty gravel lot, fog rolling in…"
          rows={4}
          className="w-full resize-none rounded-sm border border-line bg-marquee px-3 py-2.5 text-sm text-cream placeholder:text-cream-dim/60 focus:border-gold focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["still", "clip"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange({ mediaType: type })}
            className={`rounded-sm border px-3 py-2.5 text-xs uppercase tracking-wider transition-colors ${
              request.mediaType === type
                ? "border-red bg-red/15 text-red-hot"
                : "border-line text-cream-dim hover:text-cream"
            }`}
          >
            {type === "still" ? "Lobby Card (Image)" : "Motion Picture (Clip)"}
          </button>
        ))}
      </div>

      <div>
        <span className="block text-xs uppercase tracking-wider text-cream-dim mb-2">Genre / Look</span>
        <OptionChips
          options={GENRES.map((g) => ({ id: g.id, label: g.label }))}
          value={request.genre}
          onChange={(id) => onChange({ genre: id as GenerationRequest["genre"] })}
        />
      </div>

      <div>
        <span className="block text-xs uppercase tracking-wider text-cream-dim mb-2">Camera move</span>
        <OptionChips
          options={CAMERA_MOVES.map((c) => ({ id: c.id, label: c.label }))}
          value={request.cameraMove}
          onChange={(id) => onChange({ cameraMove: id as GenerationRequest["cameraMove"] })}
        />
      </div>

      <div>
        <span className="block text-xs uppercase tracking-wider text-cream-dim mb-2">Aspect ratio</span>
        <OptionChips
          options={ASPECT_RATIOS.map((a) => ({ id: a.id, label: a.label }))}
          value={request.aspectRatio}
          onChange={(id) => onChange({ aspectRatio: id as GenerationRequest["aspectRatio"] })}
        />
      </div>

      {request.mediaType === "clip" && (
        <div>
          <span className="block text-xs uppercase tracking-wider text-cream-dim mb-2">Duration</span>
          <OptionChips
            options={DURATIONS.map((d) => ({ id: String(d), label: `${d}s` }))}
            value={String(request.duration)}
            onChange={(id) => onChange({ duration: Number(id) })}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-2 rounded-sm bg-red px-4 py-3 text-sm font-bold uppercase tracking-widest text-cream hover:bg-red-hot disabled:opacity-40 disabled:hover:bg-red transition-colors"
      >
        {submitting ? "Rolling…" : "Action! Generate"}
      </button>
    </form>
  );
}
