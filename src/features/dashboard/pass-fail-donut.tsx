// Same "no charting library" reasoning as performance-chart.tsx — a ring is just two
// concentric SVG circles, one full (the "failed" base) and one arced via strokeDasharray for
// the "passed" fraction, rotated -90deg so it starts at 12 o'clock like a normal progress ring.
const SIZE = 200;
const STROKE = 28;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PassFailDonut({
  passed,
  failed,
}: {
  passed: number;
  failed: number;
}) {
  const total = passed + failed;
  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">No finished attempts yet.</p>
    );
  }

  const passFraction = passed / total;
  const passLength = passFraction * CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-48"
        role="img"
        aria-label={`${Math.round(passFraction * 100)}% passed, ${passed} of ${total} attempts`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          className="stroke-destructive/70"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          className="stroke-primary"
          strokeWidth={STROKE}
          strokeDasharray={`${passLength} ${CIRCUMFERENCE - passLength}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <text
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground text-2xl font-bold"
        >
          {Math.round(passFraction * 100)}%
        </text>
      </svg>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary inline-block size-2.5 rounded-full" />
          Passed ({passed})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-destructive/70 inline-block size-2.5 rounded-full" />
          Failed ({failed})
        </span>
      </div>
    </div>
  );
}
