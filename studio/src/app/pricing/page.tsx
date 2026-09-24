import Link from "next/link";

export const metadata = {
  title: "Pricing — Cult Studio",
};

const TIERS = [
  {
    id: "matinee",
    name: "Matinee",
    price: "$0",
    cadence: "forever",
    description: "Walk-in tickets. Enough to see if the studio's for you.",
    features: [
      "15 renders / month",
      "Lobby card (image) generations",
      "Standard genres",
      "Watermarked exports",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    id: "double-feature",
    name: "Double Feature",
    price: "$19",
    cadence: "/ month",
    description: "For the director who actually finishes the short.",
    features: [
      "300 renders / month",
      "Motion picture (clip) generations",
      "All genres + camera moves",
      "No watermark, 4K stills",
      "Save unlimited reels",
    ],
    cta: "Get Double Feature",
    highlight: true,
  },
  {
    id: "all-access",
    name: "All-Access Pass",
    price: "$49",
    cadence: "/ month",
    description: "Full run of the lot — for small studios and teams.",
    features: [
      "Unlimited renders",
      "Priority render queue",
      "Team reels & shared presets",
      "Early access to new genres",
      "API access",
    ],
    cta: "Get All-Access",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <div className="text-center mb-12">
        <h1 className="font-display text-5xl mb-3">Box Office</h1>
        <p className="text-cream-dim text-sm max-w-lg mx-auto">
          Every tier is a ticket, not a subscription trap. Cancel between
          screenings, keep everything you&apos;ve saved to your reel.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`ticket-notch relative flex flex-col rounded-sm border p-6 ${
              tier.highlight
                ? "border-gold bg-gold/10 md:-translate-y-3"
                : "border-line bg-marquee-raised"
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sm bg-gold px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-marquee">
                Most Popular
              </span>
            )}
            <h2 className="font-display text-2xl">{tier.name}</h2>
            <p className="text-xs text-cream-dim mt-1 mb-5 min-h-[2rem]">{tier.description}</p>
            <div className="mb-6">
              <span className="font-display text-4xl">{tier.price}</span>
              <span className="text-cream-dim text-xs ml-1">{tier.cadence}</span>
            </div>
            <ul className="flex-1 space-y-2.5 mb-6 text-sm">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-cream-dim">
                  <span className="text-gold mt-0.5">✦</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/generate"
              className={`text-center rounded-sm px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                tier.highlight
                  ? "bg-red text-cream hover:bg-red-hot"
                  : "border border-line text-cream hover:border-gold hover:text-gold"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-cream-dim mt-10">
        This is a design concept — buttons lead straight to the Studio, no checkout attached.
      </p>
    </div>
  );
}
