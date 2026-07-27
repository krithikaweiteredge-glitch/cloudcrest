import logo from "@/assets/cloudcrest-logo.png";

/**
 * Company-branded loading indicator: the Cloudcrest mark on a soft disc,
 * wrapped by a spinning brand ring. Use `fullscreen` for route transitions and
 * the inline variant (default) for section-level loading states.
 */
export function BrandLoader({
  label = "Loading…",
  fullscreen = false,
}: {
  label?: string | null;
  fullscreen?: boolean;
}) {
  const wrapper = fullscreen
    ? "fixed inset-0 z-[100] grid place-items-center bg-background/90"
    : "grid place-items-center py-20";

  return (
    <div className={wrapper} role="status" aria-live="polite" aria-busy="true">
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid size-24 place-items-center">
          {/* Spinning brand ring */}
          <span className="brand-loader-ring absolute inset-0 rounded-full" />
          {/* Inner disc the mark rests on */}
          <span className="absolute inset-[7px] rounded-full bg-surface shadow-elev" />
          <img
            src={logo}
            alt="Cloudcrest"
            className="brand-loader-mark relative size-11 object-contain"
          />
        </div>
        {label && (
          <div className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
        )}
      </div>
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
