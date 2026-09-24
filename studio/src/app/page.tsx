import Link from "next/link";
import LandingPreviewStrip from "@/components/LandingPreviewStrip";
import { GENRES } from "@/lib/presets";

const STEPS = [
  {
    n: "01",
    title: "Write the scene",
    body: "One or two sentences. Cult Studio doesn't need a screenplay — a location, a mood, a beat is plenty.",
  },
  {
    n: "02",
    title: "Pick the film stock",
    body: "Genre sets the palette and grain. Camera move sets how the frame behaves. Aspect ratio sets the theater.",
  },
  {
    n: "03",
    title: "Call action",
    body: "Renders queue up on the Dailies board. Save the keepers to your reel, discard the rest.",
  },
];

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-14 md:pt-24 md:pb-20">
          <div className="max-w-2xl">
            <span className="inline-block mb-4 rounded-sm border border-line px-3 py-1 text-[11px] uppercase tracking-wider text-gold">
              Now booking generations
            </span>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-[0.95] text-shadow-marquee">
              Every prompt gets its <span className="text-red-hot">own genre.</span>
            </h1>
            <p className="mt-6 text-cream-dim text-base max-w-lg">
              Cult Studio is a director&apos;s desk for AI images and clips. Instead
              of one flavor of &quot;photoreal,&quot; you block a shot — genre, camera
              move, aspect ratio — and every render comes back looking like it
              belongs on a scratched print at a midnight screening.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/generate"
                className="rounded-sm bg-red px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-cream hover:bg-red-hot transition-colors"
              >
                Roll Camera
              </Link>
              <Link
                href="/now-showing"
                className="rounded-sm border border-line px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-cream hover:border-gold hover:text-gold transition-colors"
              >
                See Now Showing
              </Link>
            </div>
          </div>
        </div>
        <div className="pb-16 md:pb-20">
          <LandingPreviewStrip />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <h2 className="font-display text-3xl mb-10 text-center">How a screening comes together</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="border-t-2 border-red pt-4">
              <span className="font-display text-4xl text-cream-dim">{step.n}</span>
              <h3 className="font-display text-2xl mt-2 mb-2">{step.title}</h3>
              <p className="text-sm text-cream-dim leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-marquee-raised">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <h2 className="font-display text-3xl mb-2">Seven ways to see the same idea</h2>
          <p className="text-cream-dim text-sm mb-10 max-w-xl">
            Genre isn&apos;t a filter slapped on afterward — it changes the palette,
            the grain, the vignette, and how motion reads before a single frame renders.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GENRES.map((genre) => (
              <Link
                key={genre.id}
                href={`/generate?genre=${genre.id}`}
                className="group rounded-sm border border-line p-5 hover:border-gold/60 transition-colors"
                style={{
                  background: `linear-gradient(135deg, ${genre.palette[2]} 0%, ${genre.palette[0]}22 100%)`,
                }}
              >
                <h3 className="font-display text-xl mb-1 group-hover:text-gold transition-colors">
                  {genre.label}
                </h3>
                <p className="text-xs text-cream-dim">{genre.tagline}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20 text-center">
        <h2 className="font-display text-4xl mb-4">Ready for your close-up?</h2>
        <p className="text-cream-dim text-sm max-w-md mx-auto mb-8">
          No card required to start. Fifteen renders a month, on the house.
        </p>
        <Link
          href="/generate"
          className="inline-block rounded-sm bg-red px-8 py-4 text-sm font-bold uppercase tracking-widest text-cream hover:bg-red-hot transition-colors"
        >
          Enter the Studio
        </Link>
      </section>
    </div>
  );
}
