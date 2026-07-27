import { OTHER_COLOR } from "../lib/chartPalette";
import { useCategoricalPalette } from "../lib/useChartPalette";
import { formatMoney } from "./Money";

/**
 * Expense distribution as a donut with a value legend — the mockup's
 * signature dashboard visual (`.donut-wrap`).
 *
 * Form: part-to-whole across a handful of categories, so a donut is a
 * defensible choice. It stops being one past ~6 slices, which is why
 * everything below `TOP_N` folds into a single "Other" rather than becoming
 * an unreadable fan of thin wedges.
 *
 * Colour: fixed-order assignment from the validated categorical palette,
 * never cycled — a category keeps its colour when the period changes and the
 * set shrinks. "Other" is deliberately a neutral grey, outside the palette,
 * so it never reads as just another category.
 *
 * Identity is never carried by colour alone: every slice is named AND valued
 * in the legend beside it, which is also what makes this readable for anyone
 * with a colour-vision deficiency and in print.
 */

const TOP_N = 6;
const SIZE = 168;
const RADIUS = 62;
const STROKE = 22;

export function DonutChart({ breakdown }: { breakdown: { categoryName: string; total: number }[] }) {
  const palette = useCategoricalPalette();
  const sorted = [...breakdown].filter((b) => b.total > 0).sort((a, b) => b.total - a.total);
  if (sorted.length === 0) return null;

  const head = sorted.slice(0, TOP_N);
  const tail = sorted.slice(TOP_N);
  const slices = [
    ...head.map((b, i) => ({ name: b.categoryName, total: b.total, color: palette[i] })),
    ...(tail.length
      ? [{ name: `Other (${tail.length})`, total: tail.reduce((s, b) => s + b.total, 0), color: OTHER_COLOR }]
      : []),
  ];

  const total = slices.reduce((s, d) => s + d.total, 0);
  const circumference = 2 * Math.PI * RADIUS;
  const center = SIZE / 2;

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="presentation">
          {slices.map((d) => {
            const len = (d.total / total) * circumference;
            const seg = (
              <circle
                key={d.name}
                cx={center}
                cy={center}
                r={RADIUS}
                fill="none"
                stroke={d.color}
                strokeWidth={STROKE}
                // The 2px shortfall is the surface gap between adjacent
                // segments, so touching slices stay visually separate rather
                // than bleeding into one another.
                strokeDasharray={`${Math.max(len - 2, 0)} ${circumference - Math.max(len - 2, 0)}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="figure block text-lg font-bold leading-none text-ink-900">
            {formatMoney(total)}
          </span>
          <span className="mt-1 block text-[11px] text-ink-500">total</span>
        </div>
      </div>

      {/* The legend is the accessible reading of the chart, and doubles as the
          data table — name, value and share for every slice. */}
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {slices.map((d) => (
          <li key={d.name} className="flex items-center gap-2.5 text-[13px]">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate font-medium text-ink-700">{d.name}</span>
            <span className="figure shrink-0 font-semibold text-ink-900">{formatMoney(d.total)}</span>
            <span className="figure w-12 shrink-0 text-right text-xs text-ink-500">
              {((d.total / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
