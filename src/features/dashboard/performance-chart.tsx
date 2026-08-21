// Hand-rolled SVG, not a charting library — matches the project's existing "no charting
// library" choice for results.service.ts's score-distribution bars (docs/ARCHITECTURE.md —
// Section 13), extended here from CSS bars to a line, since a portfolio-wide trend needs one.
const WIDTH = 600;
const HEIGHT = 220;
const PADDING = { top: 10, right: 12, bottom: 24, left: 32 };
const GRID_LINES = [0, 25, 50, 75, 100];

interface PerformanceChartPoint {
  weekStart: Date;
  averageScorePercent: number;
}

function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PerformanceChart({
  points,
}: {
  points: PerformanceChartPoint[];
}) {
  if (points.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No finished, scored attempts yet.
      </p>
    );
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const xFor = (index: number) =>
    points.length === 1
      ? PADDING.left + plotWidth / 2
      : PADDING.left + (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    PADDING.top +
    plotHeight -
    (Math.max(0, Math.min(100, value)) / 100) * plotHeight;

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.averageScorePercent).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label="Average score percentage by week"
    >
      {GRID_LINES.map((g) => (
        <g key={g}>
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={yFor(g)}
            y2={yFor(g)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={PADDING.left - 8}
            y={yFor(g)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {g}
          </text>
        </g>
      ))}
      <path
        d={linePath}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
      />
      {points.map((p, i) => (
        <circle
          key={p.weekStart.getTime()}
          cx={xFor(i)}
          cy={yFor(p.averageScorePercent)}
          r={3.5}
          className="fill-primary"
        />
      ))}
      {points.map((p, i) => (
        <text
          key={p.weekStart.getTime()}
          x={xFor(i)}
          y={HEIGHT - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {formatWeekLabel(p.weekStart)}
        </text>
      ))}
    </svg>
  );
}
