import { Check } from "lucide-react";

export type Step = { key: string; label: string };

/**
 * Wizard progress rail. A single track runs behind the nodes and fills up to
 * the current step, so progress reads at a glance instead of having to compare
 * pill colours. Completed steps stay clickable; future ones don't.
 */
export function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: Step[];
  current: number;
  onGo?: (i: number) => void;
}) {
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;

  return (
    <div className="relative">
      {/* pt-2 gives the scaled/haloed active circle room so overflow-x-auto
          (which also clips vertically) doesn't cut off its top. The track sits
          at the circle centre: 8px top padding + 18px half-height = 26px. */}
      <div className="relative flex items-start justify-between gap-1 overflow-x-auto pt-2 pb-1">
        {/* Track + fill, pinned to the centre of the node row. */}
        <div className="absolute left-0 right-0 top-[26px] h-[3px] rounded-full bg-border/70" />
        <div
          className="absolute left-0 top-[26px] h-[3px] rounded-full gradient-brand transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />

        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= current;

          return (
            <button
              key={s.key}
              type="button"
              onClick={() => reachable && onGo?.(i)}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              className={
                "relative z-10 flex flex-col items-center gap-2 shrink-0 px-1 min-w-[68px] group " +
                (reachable ? "cursor-pointer" : "cursor-default")
              }
            >
              <span
                className={
                  "size-9 rounded-full grid place-items-center text-[11px] font-semibold mono " +
                  "border-2 transition-all duration-300 " +
                  (active
                    ? "gradient-brand text-white border-transparent shadow-brand scale-110"
                    : done
                      ? "bg-success text-white border-transparent group-hover:scale-105"
                      : "bg-surface text-muted-foreground border-border")
                }
              >
                {done ? <Check className="size-4" /> : String(i + 1).padStart(2, "0")}
              </span>

              <span
                className={
                  "text-[10px] font-semibold uppercase tracking-wider text-center leading-tight transition-colors " +
                  (active
                    ? "text-primary"
                    : done
                      ? "text-foreground/70 group-hover:text-foreground"
                      : "text-muted-foreground/60")
                }
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
