import type { AspectRatio, CameraMove, Genre } from "./types";

export const GENRES: Genre[] = [
  {
    id: "grindhouse",
    label: "Grindhouse",
    tagline: "Scratched prints, bad splices, worse lighting.",
    palette: ["#cc3327", "#e2a53c", "#0e0b0a"],
    grain: 0.85,
    vignette: 0.6,
  },
  {
    id: "noir",
    label: "Midnight Noir",
    tagline: "Venetian-blind shadows and a saxophone somewhere.",
    palette: ["#1c2230", "#8a94a6", "#0a0a0c"],
    grain: 0.4,
    vignette: 0.75,
  },
  {
    id: "technicolor",
    label: "Technicolor Dream",
    tagline: "Oversaturated melodrama, matte-painting skies.",
    palette: ["#e8493a", "#e2a53c", "#2f6f8f"],
    grain: 0.15,
    vignette: 0.2,
  },
  {
    id: "found-footage",
    label: "Found Footage",
    tagline: "Timestamp in the corner, camcorder whine, run.",
    palette: ["#6c7a4a", "#c7c29a", "#111308"],
    grain: 0.95,
    vignette: 0.5,
  },
  {
    id: "neo-anime",
    label: "Neo-Anime",
    tagline: "Cel-shaded neon, rain-slicked rooftops.",
    palette: ["#7d5fff", "#3fd0e0", "#100a24"],
    grain: 0.1,
    vignette: 0.15,
  },
  {
    id: "synthwave",
    label: "Synth Chase",
    tagline: "Gridlines to the horizon, chrome and sunset.",
    palette: ["#ff2e88", "#3fd0e0", "#160828"],
    grain: 0.2,
    vignette: 0.3,
  },
  {
    id: "documentary",
    label: "Verite",
    tagline: "Handheld, natural light, unglamorous truth.",
    palette: ["#8a8272", "#cabfa9", "#20201c"],
    grain: 0.3,
    vignette: 0.35,
  },
];

export const CAMERA_MOVES: CameraMove[] = [
  { id: "static", label: "Static Lockoff", description: "Tripod-still, let the frame do the work." },
  { id: "dolly-in", label: "Slow Dolly In", description: "Creeping push toward the subject." },
  { id: "handheld", label: "Handheld", description: "Breathing, imperfect, alive." },
  { id: "crane-rise", label: "Crane Rise", description: "Lift up and away for the reveal." },
  { id: "whip-pan", label: "Whip Pan", description: "Fast blur-cut between two beats." },
  { id: "orbit", label: "Orbit", description: "Circle the subject a quarter turn." },
];

export const ASPECT_RATIOS: AspectRatio[] = [
  { id: "2.39:1", label: "Cinemascope 2.39:1", ratio: 2.39 },
  { id: "16:9", label: "Widescreen 16:9", ratio: 16 / 9 },
  { id: "1:1", label: "Lobby Card 1:1", ratio: 1 },
  { id: "9:16", label: "Trailer Reel 9:16", ratio: 9 / 16 },
];

export const DURATIONS = [4, 8, 12] as const;

export function genreById(id: string): Genre {
  return GENRES.find((g) => g.id === id) ?? GENRES[0];
}

export function cameraMoveById(id: string): CameraMove {
  return CAMERA_MOVES.find((c) => c.id === id) ?? CAMERA_MOVES[0];
}

export function aspectRatioById(id: string): AspectRatio {
  return ASPECT_RATIOS.find((a) => a.id === id) ?? ASPECT_RATIOS[0];
}

/** Curated "Now Showing" board — stand-ins for community/example generations. */
export const NOW_SHOWING: { prompt: string; seed: string; genre: string; cameraMove: string; aspectRatio: string }[] = [
  { prompt: "A gas station at 3am, neon sign flickering, one truck idling", seed: "ns-01", genre: "noir", cameraMove: "static", aspectRatio: "2.39:1" },
  { prompt: "Roller rink disco ball catching one shaft of light", seed: "ns-02", genre: "technicolor", cameraMove: "dolly-in", aspectRatio: "16:9" },
  { prompt: "Static on a motel TV, a figure standing just behind it", seed: "ns-03", genre: "found-footage", cameraMove: "handheld", aspectRatio: "9:16" },
  { prompt: "Chrome motorcycle parked under a highway overpass at dusk", seed: "ns-04", genre: "synthwave", cameraMove: "orbit", aspectRatio: "16:9" },
  { prompt: "A masked wrestler eating alone in a diner booth", seed: "ns-05", genre: "grindhouse", cameraMove: "static", aspectRatio: "2.39:1" },
  { prompt: "Rooftop water tower, city lights bleeding into rain", seed: "ns-06", genre: "neo-anime", cameraMove: "crane-rise", aspectRatio: "16:9" },
  { prompt: "Dock workers loading crates before a storm rolls in", seed: "ns-07", genre: "documentary", cameraMove: "handheld", aspectRatio: "16:9" },
  { prompt: "A phone booth ringing in an empty parking garage", seed: "ns-08", genre: "noir", cameraMove: "whip-pan", aspectRatio: "1:1" },
  { prompt: "Carnival ferris wheel stuck mid-turn, lights still on", seed: "ns-09", genre: "technicolor", cameraMove: "orbit", aspectRatio: "16:9" },
  { prompt: "A VHS tape being rewound by hand, label torn", seed: "ns-10", genre: "found-footage", cameraMove: "static", aspectRatio: "1:1" },
  { prompt: "Two rivals facing off across a foggy football field", seed: "ns-11", genre: "grindhouse", cameraMove: "dolly-in", aspectRatio: "2.39:1" },
  { prompt: "Robot courier weaving through a night market crowd", seed: "ns-12", genre: "synthwave", cameraMove: "handheld", aspectRatio: "9:16" },
];
