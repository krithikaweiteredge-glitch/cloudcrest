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

export type LlpFeeContext = { kind: "llp"; contribution: number };

export type FeeContext = CompanyFeeContext | LlpFeeContext;

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
