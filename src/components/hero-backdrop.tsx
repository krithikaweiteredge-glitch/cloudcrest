/**
 * Ambient motion behind the hero search: document cards drift upward and get
 * stamped approved, echoing what the product actually does — paperwork moving
 * through filing. Decorative only, so the whole layer is aria-hidden and every
 * animation is transform/opacity for compositor-only work.
 *
 * Values are hand-picked rather than random so the composition is stable across
 * renders and the durations stay mutually coprime — the loop never visibly
 * repeats even though each card is on a fixed cycle.
 */

type Doc = {
  /** Horizontal position, % of the hero width. */
  left: number;
  /** Cycle length in seconds. */
  dur: number;
  /** Negative offset so the scene starts mid-flight rather than empty. */
  delay: number;
  scale: number;
  tilt: number;
  /** Horizontal drift across the full rise, in px. */
  drift: number;
  /** Peak opacity — smaller/further cards stay fainter for depth. */
  peak: number;
  /** Whether this card gets the approval stamp. */
  sealed: boolean;
};

const DOCS: Doc[] = [
  { left: 3, dur: 13, delay: -1, scale: 0.95, tilt: -7, drift: 60, peak: 0.85, sealed: true },
  { left: 14, dur: 17, delay: -7, scale: 0.7, tilt: 5, drift: -44, peak: 0.55, sealed: false },
  { left: 25, dur: 11, delay: -9, scale: 1.1, tilt: -4, drift: 72, peak: 0.95, sealed: true },
  { left: 37, dur: 19, delay: -3, scale: 0.62, tilt: 8, drift: -52, peak: 0.45, sealed: false },
  { left: 58, dur: 12, delay: -6, scale: 1.05, tilt: 6, drift: -68, peak: 0.9, sealed: true },
  { left: 70, dur: 16, delay: -13, scale: 0.72, tilt: -9, drift: 50, peak: 0.55, sealed: false },
  { left: 82, dur: 14, delay: -2, scale: 1, tilt: 4, drift: -46, peak: 0.85, sealed: true },
  { left: 93, dur: 18, delay: -10, scale: 0.68, tilt: -6, drift: 38, peak: 0.5, sealed: false },
];

export function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {DOCS.map((d, i) => (
        <div
          key={i}
          className="doc-card"
          style={
            {
              left: `${d.left}%`,
              "--dur": `${d.dur}s`,
              "--delay": `${d.delay}s`,
              "--s": d.scale,
              "--tilt": `${d.tilt}deg`,
              "--drift": `${d.drift}px`,
              "--peak": d.peak,
            } as React.CSSProperties
          }
        >
          <DocumentGlyph sealed={d.sealed} dur={d.dur} delay={d.delay} />
        </div>
      ))}
    </div>
  );
}

/** A stylised filing — page, ruled lines, and optionally an approval seal. */
function DocumentGlyph({
  sealed,
  dur,
  delay,
}: {
  sealed: boolean;
  dur: number;
  delay: number;
}) {
  return (
    <svg width="96" height="124" viewBox="0 0 96 124" fill="none">
      {/* Page with a folded corner */}
      <path
        d="M8 4h56l24 24v92a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"
        fill="rgb(255 255 255 / 0.16)"
        stroke="rgb(255 255 255 / 0.75)"
        strokeWidth="2"
      />
      <path d="M64 4v20a4 4 0 0 0 4 4h20" stroke="rgb(255 255 255 / 0.75)" strokeWidth="2" />

      {/* Ruled content */}
      {[46, 58, 70, 82, 94].map((y, i) => (
        <rect
          key={y}
          x="16"
          y={y}
          width={i % 3 === 2 ? 38 : i % 2 === 0 ? 64 : 52}
          height="4"
          rx="2"
          fill="rgb(255 255 255 / 0.55)"
        />
      ))}

      {/* Scanning pass over the page body */}
      <rect
        className="scan-line"
        x="10"
        y="36"
        width="76"
        height="2"
        rx="1"
        fill="oklch(0.62 0.16 152 / 0.85)"
      />

      {sealed && (
        <g
          className="doc-seal"
          style={{ "--dur": `${dur}s`, "--delay": `${delay}s` } as React.CSSProperties}
          transform="translate(68 96)"
        >
          <circle r="17" fill="oklch(0.7 0.18 152 / 0.4)" stroke="oklch(0.78 0.19 152)" strokeWidth="3" />
          <path
            d="m-7 0 5 5 9-10"
            fill="none"
            stroke="oklch(0.85 0.19 152)"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}
