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
    <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onGo?.(i)}
              className={
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] mono transition-colors " +
                (active
                  ? "bg-brand/10 text-brand ring-1 ring-brand/40"
                  : done
                  ? "text-foreground hover:bg-panel"
                  : "text-muted-foreground hover:bg-panel/60")
              }
            >
              <span
                className={
                  "size-4 rounded-full grid place-items-center text-[9px] font-semibold " +
                  (active
                    ? "bg-brand text-brand-foreground"
                    : done
                    ? "bg-success/20 text-success"
                    : "bg-muted text-muted-foreground")
                }
              >
                {done ? <Check className="size-2.5" /> : String(i + 1).padStart(2, "0")}
              </span>
              <span className="uppercase tracking-wider text-[10px]">
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className="text-muted-foreground/40 text-[10px]">/</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
