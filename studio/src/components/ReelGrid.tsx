import type { Generation } from "@/lib/types";
import GenerationCard from "./GenerationCard";

export default function ReelGrid({
  generations,
  onOpen,
  onSave,
  onRemove,
  isSaved,
  emptyState,
}: {
  generations: Generation[];
  onOpen?: (g: Generation) => void;
  onSave?: (g: Generation) => void;
  onRemove?: (g: Generation) => void;
  isSaved?: (id: string) => boolean;
  emptyState?: React.ReactNode;
}) {
  if (generations.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
      {generations.map((g) => (
        <GenerationCard
          key={g.id}
          generation={g}
          onOpen={onOpen}
          onSave={onSave}
          onRemove={onRemove}
          saved={isSaved?.(g.id)}
        />
      ))}
    </div>
  );
}
