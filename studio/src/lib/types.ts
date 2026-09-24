export type MediaType = "clip" | "still";

export type GenreId =
  | "grindhouse"
  | "noir"
  | "technicolor"
  | "found-footage"
  | "neo-anime"
  | "synthwave"
  | "documentary";

export type CameraMoveId =
  | "static"
  | "dolly-in"
  | "handheld"
  | "crane-rise"
  | "whip-pan"
  | "orbit";

export type AspectRatioId = "16:9" | "2.39:1" | "9:16" | "1:1";

export interface Genre {
  id: GenreId;
  label: string;
  tagline: string;
  palette: [string, string, string];
  grain: number; // 0-1, how heavy the film grain / scanline treatment is
  vignette: number; // 0-1
}

export interface CameraMove {
  id: CameraMoveId;
  label: string;
  description: string;
}

export interface AspectRatio {
  id: AspectRatioId;
  label: string;
  ratio: number; // width / height
}

export interface GenerationRequest {
  prompt: string;
  genre: GenreId;
  cameraMove: CameraMoveId;
  aspectRatio: AspectRatioId;
  duration: number; // seconds, only meaningful for "clip"
  mediaType: MediaType;
}

export type GenerationStatus = "queued" | "rendering" | "ready" | "failed";

export interface Generation {
  id: string;
  seed: string;
  createdAt: number;
  status: GenerationStatus;
  progress: number; // 0-100
  request: GenerationRequest;
}
