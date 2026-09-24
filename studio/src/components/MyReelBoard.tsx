"use client";

import { useState } from "react";
import Link from "next/link";
import ReelGrid from "./ReelGrid";
import Lightbox from "./Lightbox";
import { useReel } from "@/lib/useReel";
import type { Generation } from "@/lib/types";

export default function MyReelBoard() {
  const { reel, remove } = useReel();
  const [viewing, setViewing] = useState<Generation | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl mb-2">My Reel</h1>
        <p className="text-cream-dim text-sm max-w-xl">
          Saved from the Studio, kept in this browser. Clear your site data
          and it clears too — there&apos;s no account behind it.
        </p>
      </div>

      {reel.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line p-10 text-center text-cream-dim">
          <p className="font-display text-xl text-cream mb-2">Nothing saved yet.</p>
          <p className="text-sm max-w-sm mx-auto mb-4">
            Generate something in the Studio and hit &quot;Save to Reel&quot; to keep it here.
          </p>
          <Link
            href="/generate"
            className="inline-block rounded-sm bg-red px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-cream hover:bg-red-hot transition-colors"
          >
            Go to Studio
          </Link>
        </div>
      ) : (
        <ReelGrid generations={reel} onOpen={setViewing} onRemove={(g) => remove(g.id)} />
      )}

      {viewing && (
        <Lightbox
          generation={viewing}
          onClose={() => setViewing(null)}
          footer={
            <button
              type="button"
              onClick={() => {
                remove(viewing.id);
                setViewing(null);
              }}
              className="w-full rounded-sm border border-line px-3 py-2.5 text-xs uppercase tracking-wider text-cream-dim hover:border-red-hot hover:text-red-hot transition-colors"
            >
              Remove from Reel
            </button>
          }
        />
      )}
    </div>
  );
}
