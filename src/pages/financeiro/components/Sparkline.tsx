interface SparklineProps {
  d: string;
  color: string;
  gradientId: string;
}

/**
 * Sparkline — gera o path como linha + área preenchida com gradiente.
 * Recebe um path SVG (string) já formatado para um viewBox 200×36.
 */
export default function Sparkline({ d, color, gradientId }: SparklineProps) {
  const areaPath = `${d} L200 36 L0 36 Z`;

  return (
    <svg
      className="block w-full h-9 mt-2.5 opacity-90"
      viewBox="0 0 200 36"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
