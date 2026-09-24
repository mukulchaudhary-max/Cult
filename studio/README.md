# Cult Studio

A director's desk for AI image and clip generation — the same basic
*idea* as tools like Higgsfield's Cinema Studio (write a prompt, pick a
look, get a render), built from scratch with its own concept, design
system and feature set.

Instead of one generic "photoreal" output, every generation is blocked
like a shot: a **genre** (Grindhouse, Midnight Noir, Technicolor Dream,
Found Footage, Neo-Anime, Synth Chase, Verite) sets the palette, grain
and vignette; a **camera move** and **aspect ratio** shape the frame.
The visual identity leans into a cult-cinema / grindhouse-poster
aesthetic — marquee red, film grain, ticket-stub pricing cards — rather
than the clean dark-SaaS look most AI generation tools share.

## What's here

| Route | What it does |
|---|---|
| `/` | Landing page — pitch, genre showcase, a preview strip of sample posters |
| `/generate` | The Studio: a "Shot Sheet" composer (prompt, genre, camera move, aspect ratio, duration) plus a live "Dailies" queue of in-progress and finished renders |
| `/now-showing` | A curated gallery of example generations, filterable by genre, each remixable straight into the Studio with its exact settings |
| `/pricing` | Three ticket-styled tiers |
| `/my-reel` | Generations saved from the Studio, persisted per-browser in `localStorage` |

## How generation works (and how to make it real)

There's no model behind this yet — `src/lib/generation.ts` simulates a
render job (`queued → rendering → ready`, with a progress callback), and
`src/lib/poster.ts` paints a **deterministic** placeholder "poster" onto
a `<canvas>`: a seeded PRNG turns the prompt + genre + camera move into
a reproducible gradient field, silhouette composition, grain/scanline
treatment and vignette, so the same inputs always render the same look.

That's a deliberate seam. To wire in a real provider (Replicate, fal.ai,
Runway, your own inference service):

1. Swap the body of `runGeneration()` in `src/lib/generation.ts` for a
   real job submission + poll loop, calling `onUpdate` as status changes.
2. Replace `paintPoster()` in `src/lib/poster.ts` with code that loads
   the returned image/video URL instead of drawing one.
3. Everything else — the queue UI, the reel, the lightbox, save/remove —
   only depends on the `Generation` type in `src/lib/types.ts`, so it
   keeps working unchanged.

"My Reel" is intentionally account-less: it's a `localStorage`-backed
list (`src/lib/useReel.ts`, via `useSyncExternalStore` so the
server-rendered shell and the client's saved data reconcile without a
hydration mismatch).

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS v4. No backend, no
external image/video APIs, no analytics — everything renders client-side
in the browser.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build && npm run start
```
