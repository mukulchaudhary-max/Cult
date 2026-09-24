import type { Generation, GenerationRequest } from "./types";
import { seedFor } from "./poster";

let counter = 0;
function nextId() {
  counter += 1;
  return `gen-${Date.now().toString(36)}-${counter}`;
}

export function createGeneration(request: GenerationRequest): Generation {
  return {
    id: nextId(),
    seed: seedFor(request, nextId()),
    createdAt: Date.now(),
    status: "queued",
    progress: 0,
    request,
  };
}

/**
 * Simulates a render job: queued → rendering (progress ticks) → ready.
 * Calls `onUpdate` with a patch each tick and returns a cleanup function
 * to cancel the simulated job (e.g. if the component unmounts).
 *
 * This is the single seam you'd replace with a real provider call
 * (poll a job id from Replicate / fal / Runway / your own inference
 * service) — everything else in the app only depends on the
 * `Generation` shape, not on how it gets produced.
 */
export function runGeneration(
  generation: Generation,
  onUpdate: (patch: Partial<Generation>) => void
): () => void {
  let cancelled = false;
  const totalMs = 2200 + generation.request.duration * 220;
  const startedAt = Date.now();

  onUpdate({ status: "rendering", progress: 4 });

  const tick = () => {
    if (cancelled) return;
    const elapsed = Date.now() - startedAt;
    const progress = Math.min(99, Math.round((elapsed / totalMs) * 100));
    onUpdate({ status: "rendering", progress });
    if (elapsed >= totalMs) {
      onUpdate({ status: "ready", progress: 100 });
      return;
    }
    timeout = setTimeout(tick, 160);
  };

  let timeout = setTimeout(tick, 160);

  return () => {
    cancelled = true;
    clearTimeout(timeout);
  };
}
