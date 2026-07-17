import { Check } from "lucide-react";

export type Step = { key: string; label: string };

export function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: Step[];
  current: number;
  onGo?: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onGo?.(i)}
              className={
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] mono transition-all " +
                (active
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : done
                  ? "text-foreground hover:bg-muted"
                  : "text-muted-foreground hover:bg-muted/60")
              }
            >
              <span
                className={
                  "size-5 rounded-full grid place-items-center text-[10px] font-semibold transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground shadow-brand"
                    : done
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground")
                }
              >
                {done ? <Check className="size-3" /> : String(i + 1).padStart(2, "0")}
              </span>
              <span className="uppercase tracking-wider text-[10px] font-semibold">
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className={"text-muted-foreground/40 text-[10px] " + (done ? "text-success/50" : "")}>
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
