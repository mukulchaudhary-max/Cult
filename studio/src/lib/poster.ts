import { aspectRatioById, genreById } from "./presets";
import type { GenerationRequest } from "./types";

/**
 * Deterministic placeholder-art renderer.
 *
 * Cult Studio has no real image/video model behind it here, but the
 * generation *flow* (queue → render → ready, seeded reproducibility,
 * genre-driven look) is built the way a real integration would sit
 * behind it: swap `paintPoster` for a call to your model provider and
 * everything above it (queueing, the gallery, saved reels) keeps working.
 */

// Small deterministic PRNG (mulberry32) seeded from a string hash so the
// same prompt+options always paints the same "render".
function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))}, ${Math.round(lerp(c1[1], c2[1], t))}, ${Math.round(lerp(c1[2], c2[2], t))})`;
}

export function seedFor(request: GenerationRequest, salt = ""): string {
  return `${request.prompt}::${request.genre}::${request.cameraMove}::${request.aspectRatio}::${request.mediaType}::${salt}`;
}

/**
 * Paints a deterministic "poster" for a generation onto the given canvas:
 * a genre-tinted gradient field, procedural shapes standing in for
 * composition, grain/scanline treatment per genre, a vignette, and a
 * title card with the genre + camera move (like a slugline burned into
 * the frame).
 */
export function paintPoster(
  canvas: HTMLCanvasElement,
  seed: string,
  request: Pick<GenerationRequest, "genre" | "cameraMove" | "aspectRatio">,
  options: { showSlate?: boolean } = {}
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const genre = genreById(request.genre);
  const aspect = aspectRatioById(request.aspectRatio);
  const rand = mulberry32(hashString(seed));

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const [c1, c2, c3] = genre.palette.map(hexToRgb);

  // Base diagonal gradient field between two of the genre's palette colors.
  const angle = rand() * Math.PI * 2;
  const x0 = width / 2 - Math.cos(angle) * width;
  const y0 = height / 2 - Math.sin(angle) * height;
  const x1 = width / 2 + Math.cos(angle) * width;
  const y1 = height / 2 + Math.sin(angle) * height;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, lerpColor(c3, c1, 0.35));
  grad.addColorStop(0.55, lerpColor(c1, c2, 0.5));
  grad.addColorStop(1, lerpColor(c2, c3, 0.4));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Procedural "composition": a horizon band plus a handful of soft
  // silhouette shapes, positioned by the seed, standing in for a scene.
  const horizonY = height * lerp(0.45, 0.7, rand());
  ctx.fillStyle = `rgba(${c3[0]}, ${c3[1]}, ${c3[2]}, 0.45)`;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  const shapeCount = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < shapeCount; i++) {
    const sw = width * lerp(0.06, 0.22, rand());
    const sh = height * lerp(0.15, 0.5, rand());
    const sx = rand() * width - sw / 2;
    const sy = horizonY - sh * lerp(0.3, 1, rand());
    ctx.fillStyle = `rgba(${c3[0] * 0.4}, ${c3[1] * 0.4}, ${c3[2] * 0.4}, ${lerp(0.35, 0.7, rand())})`;
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.fill();
  }

  // A soft glow / "key light" source.
  const lightX = width * lerp(0.2, 0.8, rand());
  const lightY = horizonY * lerp(0.2, 0.6, rand());
  const glow = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, width * 0.35);
  glow.addColorStop(0, `rgba(${c2[0]}, ${c2[1]}, ${c2[2]}, 0.55)`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Camera-move cue: a directional blur streak hinting at motion.
  if (request.cameraMove === "whip-pan" || request.cameraMove === "handheld") {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 6; i++) {
      const yy = rand() * height;
      ctx.fillRect(0, yy, width, 2 + rand() * 3);
    }
    ctx.restore();
  }

  // Vignette.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.25,
    width / 2,
    height / 2,
    height * 0.85
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${genre.vignette})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Scanlines for the noisier genres (found footage, grindhouse).
  if (genre.grain > 0.5) {
    ctx.save();
    ctx.globalAlpha = genre.grain * 0.18;
    ctx.fillStyle = "#000";
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
  }

  // Grain: scattered translucent pixels, density from genre.grain.
  const grainCount = Math.floor(width * height * 0.012 * genre.grain);
  ctx.save();
  for (let i = 0; i < grainCount; i++) {
    const gx = rand() * width;
    const gy = rand() * height;
    const v = rand();
    ctx.fillStyle = v > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(gx, gy, 1, 1);
  }
  ctx.restore();

  // Frame border matching the aspect ratio's "cinema" feel.
  ctx.strokeStyle = "rgba(243, 233, 214, 0.5)";
  ctx.lineWidth = Math.max(1, width * 0.004);
  ctx.strokeRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth
  );

  if (options.showSlate !== false) {
    const pad = width * 0.035;
    const barH = Math.max(22, height * 0.09);
    ctx.fillStyle = "rgba(14, 11, 10, 0.72)";
    ctx.fillRect(0, height - barH, width, barH);
    ctx.fillStyle = "#f3e9d6";
    const fontSize = Math.max(10, barH * 0.38);
    ctx.font = `${fontSize}px var(--font-mono), monospace`;
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${genre.label.toUpperCase()} · ${aspect.id}`,
      pad,
      height - barH / 2
    );
  }
}
