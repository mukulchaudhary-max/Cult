export default function FilmReelSpinner({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="animate-reel"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <circle
          key={angle}
          cx={16 + Math.cos((angle * Math.PI) / 180) * 8.5}
          cy={16 + Math.sin((angle * Math.PI) / 180) * 8.5}
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ))}
    </svg>
  );
}
