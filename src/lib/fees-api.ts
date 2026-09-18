import { useQuery } from "@tanstack/react-query";
import type { FeeLine, ResolvedFees } from "@/lib/service-catalog";

/**
 * Fee estimates come from the backend, which owns the statutory fee engine
 * (`backend/src/config/statutoryFees.ts`) — the single source of truth. The
 * wizards no longer compute fees locally; they describe the incorporation with a
 * `FeeContext` and ask the backend for the breakdown. The same context is sent
 * with the application so the backend recomputes and stores an authoritative
 * figure at submission time.
 */

const BACKEND = () => import.meta.env.VITE_BACKEND_URL || "";

export type CompanyFeeContext = {
  kind: "company";
  /** Short entity key (pvt, opc, sec8, …). */
  entity: string;
  entityClass?: "private" | "public" | null;
  /**
   * "guarantee" = company limited by guarantee (no share capital) → the backend
   * prices it off the number of members instead of authorised capital. Defaults
   * to "shares" when absent.
   */
  liability?: "shares" | "guarantee" | null;
  capital: number;
  /** Paid-up capital — the backend derives the small-company concession from it. */
  paidCapital: number;
  /** Number of members — sent only on the guarantee (no-share-capital) path. */
  members?: number;
  /** Number of directors — adds DIN (₹500 each) + DSC (₹1,500 each) lines. */
  directors?: number;
  state: string;
};

export type LlpFeeContext = {
  kind: "llp";
  contribution: number;
  /** Number of partners — drives DSC fee (₹1,500 each). */
  partners?: number;
  /** Indian LLP (FiLLiP) vs Foreign LLP (FC) — each is priced on its own catalog row. */
  jurisdiction?: "indian" | "foreign";
};

/**
 * A Business Conversion. The backend prices it from the conversion's catalog
 * fee lines plus the government fee it computes from these figures (per-form
 * filing slab, new-company or new-LLP registration fees — whichever applies).
 */
export type ConversionFeeContext = {
  kind: "conversion";
  slug: string;
  /** Authorised share capital. */
  capital: number;
  paidCapital: number;
  /** Partner contribution — Partnership → LLP. */
  contribution: number;
  directors: number;
  partners: number;
  state: string;
};

/**
 * A Business Closure. The backend prices it from the closure's catalog fee
 * lines, plus MGT-14 on the authorised-capital slab for the company closures.
 */
export type ClosureFeeContext = {
  kind: "closure";
  slug: string;
  /** Existing authorised share capital — 0 for closures that don't ask for it. */
  capital: number;
};

/**
 * A Labour Licence in one state. The backend prices it from the state row's
 * catalog fee lines plus the state's registration-fee slab on the head count.
 */
export type LabourFeeContext = {
  kind: "labour";
  /** The state row, `labour-licence-<state>`. */
  slug: string;
  state: string;
  /** Total persons employed. */
  employees: number;
};

/**
 * A Professional Tax registration in one state. The client's document names no
 * government fee, so the backend simply returns the state row's own catalog fee
 * lines — there is nothing computed to send figures for.
 */
export type ProfessionalTaxFeeContext = {
  kind: "professional-tax";
  /** The state row, `professional-tax-<state>`. */
  slug: string;
  state: string;
};

/**
 * A Trade Licence in one state. The backend prices it from the state row's
 * catalog fee lines plus the Govt Fee: area × the row's per-sq.ft. rate for
 * the road width.
 */
export type TradeLicenceFeeContext = {
  kind: "trade-licence";
  /** The state row, `trade-licence-<state>`. */
  slug: string;
  state: string;
  /** single / double / multiple / star — "" until picked. */
  roadWidth: string;
  /** Premises area in sq.ft. */
  area: number;
};

/**
 * An EPF or ESI registration. The client's document names no government fee,
 * so the backend returns the row's own catalog fee lines.
 */
export type EmployerRegistrationFeeContext = {
  kind: "employer-registration";
  slug: "epf" | "esi";
};

/**
 * A GST registration of one taxpayer type. The client's document prices every
 * registration at a Professional Fee plus GST and names no government fee, so
 * the backend returns the `gst-<type>` row's own catalog fee lines — whatever
 * the admin published — falling back to the base `gst` row when the type row
 * isn't priced yet. State and constitution ride along for the record.
 */
export type GstFeeContext = {
  kind: "gst";
  /** The type row, `gst-<type>`. */
  slug: string;
  state: string;
  constitution: string;
};

/**
 * A Letter of Undertaking. The client's document names no fee, so the backend
 * returns the `lut` row's own catalog fee lines — whatever the admin published.
 */
export type LutFeeContext = {
  kind: "lut";
  slug: "lut";
  financialYear: string;
};

/**
 * A PAN or TAN application. The client prices both at a flat professional fee
 * plus GST, so the backend returns the `pan-tan-pan` / `pan-tan-tan` row's own
 * catalog fee lines, falling back to the shared `pan-tan` launcher row.
 */
export type PanTanFeeContext = {
  kind: "pan-tan";
  slug: string;
  /** "pan" or "tan". */
  service: string;
  /** Applicant category (PAN) or deductor category (TAN). */
  category: string;
};

export type FeeContext =
  | CompanyFeeContext
  | LlpFeeContext
  | ConversionFeeContext
  | ClosureFeeContext
  | LabourFeeContext
  | ProfessionalTaxFeeContext
  | TradeLicenceFeeContext
  | EmployerRegistrationFeeContext
  | GstFeeContext
  | LutFeeContext
  | PanTanFeeContext;

type EstimateResponse = {
  lines: FeeLine[];
  total: number;
  gst: number;
  stateKnown: boolean;
  fromCatalog: boolean;
  smallCompany?: boolean;
};

export type FeeEstimate = ResolvedFees & {
  /** False when the selected state has no stamp-duty rate on file. */
  stateKnown: boolean;
  /** Company only: whether the concessional small-company MoA slab was applied. */
  smallCompany?: boolean;
  loading: boolean;
};

/**
 * Live fee breakdown for a fee context. Cached per distinct context, so changing
 * capital/state/class refetches once and reuses the result thereafter. Pass
 * `enabled = false` (e.g. when signed out) to skip the request — the endpoint is
 * auth-gated because the breakdown includes the professional fee.
 */
export function useFeeEstimate(ctx: FeeContext, enabled = true): FeeEstimate {
  const body = JSON.stringify(ctx);
  const { data, isLoading } = useQuery({
    queryKey: ["fee-estimate", body],
    queryFn: async () => {
      const res = await fetch(`${BACKEND()}/api/fees/estimate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error("Failed to fetch fee estimate");
      return (await res.json()) as EstimateResponse;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    lines: data?.lines ?? [],
    total: data?.total ?? 0,
    fromCatalog: data?.fromCatalog ?? false,
    stateKnown: data?.stateKnown ?? true,
    smallCompany: data?.smallCompany,
    loading: enabled && isLoading,
  };
}
