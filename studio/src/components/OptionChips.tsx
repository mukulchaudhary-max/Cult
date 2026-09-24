interface Option {
  id: string;
  label: string;
}

export default function OptionChips({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={`rounded-sm border px-3 py-2 text-xs uppercase tracking-wider transition-colors ${
              active
                ? "border-gold bg-gold/15 text-gold"
                : "border-line text-cream-dim hover:border-cream-dim hover:text-cream"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
