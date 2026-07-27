import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MODULE_GROUPS, catalogToGroups, type ModuleGroup } from "@/lib/modules";

/**
 * Service pricing and document checklists come from the admin catalog
 * (`services` + `document_types`). Fees are only returned to signed-in users, so
 * `professionalFee` & co. are absent for anonymous visitors.
 */
export type CatalogService = {
  slug: string;
  title: string;
  short: string;
  authority: string;
  form: string;
  description: string;
  documents: string[];
  whoCanApply: string;
  actsRules: string;
  /** Tabs the admin configured for this service page, hidden ones already dropped. */
  tabs: ServiceTab[];
  /** Downloadable attachments shown on the Acts and Rules tab. */
  actsRulesPdfs: ActsRulePdf[];
  /** Custom fee lines authored by the admin. Empty means "use the standard three". */
  feeLines: FeeLine[];
  professionalFee?: number;
  govtFee?: number;
  gstPercent?: number;
};

/** A tab on the service page, as stored in `services.tabs`. */
export type ServiceTab = {
  /** `about` | `who` | `documents` | `acts` for the built-ins, `custom_*` otherwise. */
  id: string;
  title: string;
  content: string;
  visible: boolean;
  isCustom?: boolean;
};

export type ActsRulePdf = { name: string; url: string };

/** The four tabs every service starts with, seeded from the service's own fields. */
export function defaultTabs(s: {
  description?: string;
  whoCanApply?: string;
  actsRules?: string;
}): ServiceTab[] {
  return [
    { id: "about", title: "About", content: s.description ?? "", visible: true },
    { id: "who", title: "Who can Apply", content: s.whoCanApply ?? "", visible: true },
    { id: "documents", title: "Documents", content: "", visible: true },
    { id: "acts", title: "Acts and Rules", content: s.actsRules ?? "", visible: true },
  ];
}

/** Tolerant JSON parse for the text columns that hold serialised arrays. */
function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const BACKEND = () => import.meta.env.VITE_BACKEND_URL || "";

/** `GET /api/services/slug/:slug` response — the raw table rows, not the view model. */
type ServiceBySlugResponse = {
  service: {
    slug: string | null;
    name: string;
    shortTitle: string | null;
    authority: string | null;
    formNo: string | null;
    description: string | null;
    whoCanApply: string | null;
    actsRules: string | null;
    tabs: string | null;
    actsRulesPdfs: string | null;
    feeLines?: string | null;
    // `decimal` columns come back from pg as strings, and are absent entirely
    // for signed-out visitors.
    professionalFee?: string | number | null;
    govtFee?: string | number | null;
    gstPercent?: string | number | null;
  };
  documents: { name: string }[];
};

/** `decimal` columns arrive as strings; anything unparseable means "not priced". */
function toFee(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Flatten the API's `{ service, documents, form, fields }` envelope into the
 * shape the wizards consume. `documents` in particular arrives as document_type
 * rows — pass those through as objects and React refuses to render them.
 */
function toCatalogService(data: ServiceBySlugResponse, slug: string): CatalogService {
  const s = data.service;
  const stored = parseJsonArray<ServiceTab>(s.tabs);
  const tabs = (stored.length > 0 ? stored : defaultTabs(s as any)).filter((t) => t.visible);

  return {
    slug: s.slug ?? slug,
    title: s.name,
    short: s.shortTitle ?? s.name,
    authority: s.authority ?? "",
    form: s.formNo ?? "",
    description: s.description ?? "",
    whoCanApply: s.whoCanApply ?? "",
    actsRules: s.actsRules ?? "",
    tabs,
    actsRulesPdfs: parseJsonArray<ActsRulePdf>(s.actsRulesPdfs),
    feeLines: parseJsonArray<FeeLine>(s.feeLines),
    documents: (data.documents ?? []).map((d) => d.name).filter(Boolean),
    professionalFee: toFee(s.professionalFee),
    govtFee: toFee(s.govtFee),
    gstPercent: toFee(s.gstPercent),
  };
}

/**
 * The published catalog, grouped by category, for the sidebar and the home page
 * services grid. Anything an admin adds appears here as soon as it has a slug
 * and is active. The built-in MODULE_GROUPS are only a fallback for when the
 * API is unreachable, so the page never renders an empty catalog.
 */
export function useCatalogGroups() {
  // Cached via React Query with a shared client, so the catalog is fetched once
  // and reused across every screen instead of being re-fetched on each
  // navigation (the AppShell mounts on every route, and the home page uses this
  // too — previously that meant a serverless + DB round-trip per screen).
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-groups"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND()}/api/services/catalog`);
      if (!res.ok) return [] as unknown[];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const groups = useMemo<ModuleGroup[]>(
    () => (data && data.length > 0 ? catalogToGroups(data) : MODULE_GROUPS),
    [data],
  );

  return { groups, loaded: !isLoading };
}

export async function fetchService(slug: string): Promise<CatalogService | null> {
  try {
    const res = await fetch(`${BACKEND()}/api/services/slug/${encodeURIComponent(slug)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ServiceBySlugResponse;
    if (!data?.service) return null;
    return toCatalogService(data, slug);
  } catch {
    return null;
  }
}

/**
 * Resolve the first slug that exists in the catalog. Wizards pass a
 * variant-specific slug first (e.g. `company-pvt`) and the base service second
 * (`company`), so an admin can price individual entity types without having to.
 */
export function useCatalogService(slugs: string[]) {
  const key = slugs.join("|");
  // Cached per slug set so revisiting a wizard doesn't re-hit the backend.
  // `undefined` = still loading, `null` = not in the catalog.
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-service", key],
    queryFn: async () => {
      for (const slug of slugs) {
        if (!slug) continue;
        const found = await fetchService(slug);
        if (found) return found;
      }
      return null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { service: isLoading ? undefined : data ?? null, loading: isLoading };
}

export type FeeLine = { label: string; amount: number };

export type ResolvedFees = {
  lines: FeeLine[];
  total: number;
  /** False when the numbers came from a local fallback rather than the catalog. */
  fromCatalog: boolean;
};

/**
 * Build the fee breakdown from a catalog service. GST applies to the
 * professional fee only — government fees aren't taxable.
 */
export function resolveFees(
  service: CatalogService | null | undefined,
  authority: string,
  fallback: { professional: number; govt: number; gstPercent: number }
): ResolvedFees {
  // Admin-authored fee lines win outright — they're the explicit pricing for
  // this service, so they replace the standard professional/govt/GST split.
  const custom = (service?.feeLines ?? []).filter((l) => l.label?.trim());
  if (custom.length > 0) {
    const lines = custom.map((l) => ({ label: l.label, amount: Number(l.amount) || 0 }));
    return {
      lines,
      total: lines.reduce((sum, l) => sum + l.amount, 0),
      fromCatalog: true,
    };
  }

  const fromCatalog =
    !!service && typeof service.professionalFee === "number" && typeof service.govtFee === "number";

  const professional = fromCatalog ? Number(service!.professionalFee) : fallback.professional;
  const govt = fromCatalog ? Number(service!.govtFee) : fallback.govt;
  const gstPercent = fromCatalog ? Number(service!.gstPercent ?? 0) : fallback.gstPercent;
  const gst = Math.round((professional * gstPercent) / 100);

  return {
    lines: [
      { label: "Professional Fee", amount: professional },
      { label: `${authority} Government Fee`, amount: govt },
      { label: `GST @ ${gstPercent}% (on professional fee)`, amount: gst },
    ],
    total: professional + govt + gst,
    fromCatalog,
  };
}

/** Catalog checklist when the admin has configured one, otherwise the built-in list. */
export function resolveDocuments(
  service: CatalogService | null | undefined,
  fallback: string[]
): { documents: string[]; fromCatalog: boolean } {
  if (service?.documents?.length) return { documents: service.documents, fromCatalog: true };
  return { documents: fallback, fromCatalog: false };
}
