import { Link } from "@tanstack/react-router";
import { Building2, BadgeCheck } from "lucide-react";

export type ProfileBusiness = {
  businessName?: string;
  legalName?: string;
  pan?: string;
  gstin?: string;
  cin?: string;
  incorporationDate?: string;
  state?: string;
  city?: string;
  pincode?: string;
  address?: string;
  postalAddress?: string;
};
export type ProfileUser = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
};

const fmtDate = (d?: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB");
};

/** Shared profile header: the gradient company banner with skyline + completion. */
export function ProfileBanner({
  business,
  user,
  completion = 0,
}: {
  business?: ProfileBusiness;
  user?: ProfileUser;
  /** Authoritative completion % from `GET /api/profiles/me`. */
  completion?: number;
}) {
  const isBusiness = !!(business?.cin || business?.businessName);

  const title = isBusiness
    ? (business?.businessName ?? "Your Company").toUpperCase()
    : (user?.email || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Welcome");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border shadow-elev">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/25 via-primary/15 to-primary/25" />
      <Skyline />
      <div className="relative p-6 md:p-8 flex items-start gap-4">
        <div className="size-16 shrink-0 rounded-2xl bg-white/70 backdrop-blur border border-white/60 grid place-items-center text-primary shadow-card">
          <Building2 className="size-8" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-navy truncate">
              {title}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 text-success text-xs font-semibold">
              <BadgeCheck className="size-3.5" />{" "}
              {user?.status === "active" || user?.status == null ? "Active" : user.status}
            </span>
          </div>
          {isBusiness ? (
            <p className="text-[13px] text-navy/70 mt-1.5">
              {business?.incorporationDate && (
                <>
                  Incorporated on{" "}
                  <span className="font-semibold text-navy">{fmtDate(business.incorporationDate)}</span>
                  {business?.cin && "  ·  "}
                </>
              )}
              {business?.cin && (
                <>
                  CIN <span className="font-semibold text-navy mono">{business.cin}</span>
                </>
              )}
            </p>
          ) : (
            <p className="text-[13px] text-navy/70 mt-1.5">Individual account</p>
          )}
        </div>
      </div>

      <div className="relative px-6 md:px-8 pb-6">
        <div className="flex items-center justify-between text-[12px] mb-1.5">
          <span className="font-semibold text-navy">
            {completion}% <span className="font-normal text-navy/60">Profile completed</span>
          </span>
          <Link to="/profile/settings" className="text-primary font-semibold hover:underline">
            Complete profile
          </Link>
        </div>
        <div className="h-2 rounded-full bg-white/50 overflow-hidden">
          <div
            className="h-full rounded-full gradient-brand transition-[width] duration-700 ease-out"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Decorative city skyline that fills the right of the banner, like the NSWS hero. */
function Skyline() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 640 200"
      preserveAspectRatio="xMaxYMax slice"
      className="absolute right-0 bottom-0 h-full w-2/3 pointer-events-none opacity-70"
    >
      <g fill="oklch(0.62 0.16 152 / 0.35)">
        <rect x="360" y="120" width="34" height="80" rx="2" />
        <rect x="470" y="150" width="30" height="50" rx="2" />
        <rect x="560" y="130" width="40" height="70" rx="2" />
      </g>
      <g fill="oklch(0.55 0.20 255 / 0.32)">
        <rect x="400" y="90" width="38" height="110" rx="2" />
        <rect x="510" y="105" width="44" height="95" rx="2" />
        <rect x="600" y="80" width="40" height="120" rx="2" />
      </g>
      <g fill="oklch(0.24 0.06 260 / 0.4)">
        <rect x="446" y="60" width="30" height="140" rx="2" />
        <rect x="336" y="150" width="20" height="50" rx="2" />
      </g>
      <g fill="oklch(1 0 0 / 0.5)">
        {[70, 84, 98, 112, 126, 140, 154].map((y) => (
          <g key={y}>
            <rect x="452" y={y} width="5" height="5" />
            <rect x="462" y={y} width="5" height="5" />
          </g>
        ))}
      </g>
    </svg>
  );
}
