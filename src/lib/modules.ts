import {
  Building2, Handshake, Users, Shield, HomeIcon, Wallet, IdCard,
  Factory, Globe, Rocket, HardHat, Coins, HeartPulse, Store,
  FlameKindling, Leaf, Pill, ShieldCheck, Award, FileBadge2,
  Copyright, Palette,
} from "lucide-react";

export type ModuleItem = {
  slug: string;
  title: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  authority: string;
  form?: string;
};

export type ModuleGroup = {
  label: string;
  items: ModuleItem[];
};

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Entity Registration",
    items: [
      { slug: "company", title: "Company Registration", short: "Company", icon: Building2, authority: "MCA", form: "INC-32" },
      { slug: "llp", title: "LLP Registration", short: "LLP", icon: Handshake, authority: "MCA", form: "FiLLiP" },
      { slug: "partnership", title: "Partnership Firm", short: "Partnership", icon: Users, authority: "Registrar of Firms", form: "Form A" },
      { slug: "huf", title: "HUF", short: "HUF", icon: HomeIcon, authority: "Income Tax", form: "HUF Deed" },
    ],
  },
  {
    label: "Tax Registration",
    items: [
      { slug: "gst", title: "GST Registration", short: "GST", icon: Wallet, authority: "GSTN", form: "REG-01" },
      { slug: "pan-tan", title: "PAN & TAN", short: "PAN / TAN", icon: IdCard, authority: "Income Tax / NSDL", form: "49A / 49B" },
      { slug: "msme", title: "MSME / Udyam", short: "MSME", icon: Factory, authority: "MoMSME", form: "Udyam" },
      { slug: "iec", title: "IEC Import-Export", short: "IEC", icon: Globe, authority: "DGFT", form: "ANF-2A" },
      { slug: "dpiit", title: "Startup India / DPIIT", short: "DPIIT", icon: Rocket, authority: "DPIIT", form: "Recognition" },
    ],
  },
  {
    label: "Labour Law",
    items: [
      { slug: "labour-licence", title: "Labour Licence", short: "Labour Licence", icon: HardHat, authority: "State Labour Dept.", form: "CLRA" },
      { slug: "epf", title: "EPF Registration", short: "EPF", icon: Coins, authority: "EPFO", form: "Form-1" },
      { slug: "esi", title: "ESI Registration", short: "ESI", icon: HeartPulse, authority: "ESIC", form: "Form-01" },
    ],
  },
  {
    label: "Municipal Licences",
    items: [
      { slug: "shop-establishment", title: "Shop & Establishment", short: "Shop & Estd.", icon: Store, authority: "Municipal Corp.", form: "Form-A" },
      { slug: "trade-licence", title: "Trade Licence", short: "Trade", icon: FileBadge2, authority: "Municipal Corp.", form: "Form-1" },
      { slug: "fire-noc", title: "Fire NOC", short: "Fire NOC", icon: FlameKindling, authority: "Fire Dept.", form: "Fire-1" },
    ],
  },
  {
    label: "Industry Licences",
    items: [
      { slug: "fssai", title: "FSSAI Licence", short: "FSSAI", icon: Leaf, authority: "FSSAI", form: "Form A/B" },
      { slug: "pollution-ncb", title: "Pollution Control NOC", short: "PCB Consent", icon: ShieldCheck, authority: "State PCB", form: "Consent" },
      { slug: "drug-licence", title: "Drug Licence", short: "Drug", icon: Pill, authority: "State FDA", form: "Form-19" },
    ],
  },
  {
    label: "Intellectual Property",
    items: [
      { slug: "trademark", title: "Trademark", short: "Trademark", icon: Award, authority: "IP India", form: "TM-A" },
      { slug: "patent", title: "Patent", short: "Patent", icon: FileBadge2, authority: "IP India", form: "Form-1" },
      { slug: "copyright", title: "Copyright", short: "Copyright", icon: Copyright, authority: "Copyright Office", form: "Form-XIV" },
      { slug: "design", title: "Design Registration", short: "Design", icon: Palette, authority: "IP India", form: "Form-1" },
    ],
  },
];

export const ALL_MODULES: ModuleItem[] = MODULE_GROUPS.flatMap((g) => g.items);

export function getModule(slug: string): ModuleItem | undefined {
  return ALL_MODULES.find((m) => m.slug === slug);
}

/** A service published from the admin catalog (DB-driven). */
export type CatalogGroup = {
  label: string;
  items: { slug: string; title: string; short: string; authority: string; form: string; icon?: string }[];
};

/** Icon names stored on `services.icon` -> lucide components. */
const ICON_MAP: Record<string, ModuleItem["icon"]> = {
  Building2, Handshake, Users, Shield, HomeIcon, Wallet, IdCard, Factory, Globe,
  Rocket, HardHat, Coins, HeartPulse, Store, FlameKindling, Leaf, Pill,
  ShieldCheck, Award, FileBadge2, Copyright, Palette,
};

/** Resolve a stored icon name to a component, falling back to a generic badge. */
export function iconFor(name?: string | null): ModuleItem["icon"] {
  return (name && ICON_MAP[name]) || FileBadge2;
}

/**
 * One icon per category, so every service in a category renders the same glyph
 * in the sidebar and home grid instead of a jumble of per-service icons. Keyed
 * by category label; categories not listed here fall back to their first
 * service's own icon (see `catalogToGroups`).
 */
const CATEGORY_ICON: Record<string, string> = {
  "Entity Registration": "Building2",
  "Business Conversion": "Handshake",
  "Business Closure": "Shield",
  "Tax Registration": "Wallet",
  "Other Business Registrations": "IdCard",
  "Labour & Municipal License": "HardHat",
  "Intellectual Property": "Award",
  "Industry Specific Registrations": "FileBadge2",
};

/**
 * Industry-Specific "department" launchers. Each is an active catalog service
 * whose registrations (sub-heads) are its inactive siblings, shown as a picker
 * like GST. Shared by the router, the admin catalog grouping and the admin
 * registrations filter so a department aggregates its sub-heads everywhere.
 */
export const DEPARTMENT_SLUGS = new Set([
  "ind-agri", "ind-dept-agriculture", "ind-dept-commerce", "ind-dept-finance",
  "ind-dept-health", "ind-dept-education", "ind-dept-dpiit", "ind-dept-tourism",
]);

// -----------------------------------------------------------------------------
// Display order — mirrors the client's "New registration additions" document so
// the sidebar and home grid read top-to-bottom in the same sequence. The DB
// returns categories/services in id order; we re-sort here (presentation only,
// no schema change). Anything not listed keeps its original relative position
// and falls to the end of its group.
// -----------------------------------------------------------------------------
const CATEGORY_ORDER = [
  "Entity Registration",
  "Business Conversion",
  "Business Closure",
  "Tax Registration",
  "Other Business Registrations",
  "Labour & Municipal License",
  "Intellectual Property",
  "Industry Specific Registrations",
];

const ITEM_ORDER = [
  // Entity Registrations
  "company", "llp", "partnership", "trust", "society", "huf", "sole-proprietorship",
  // Business Conversions
  "conversion-pvt-to-public", "conversion-llp-to-pvt", "conversion-opc-to-pvt",
  "conversion-proprietorship-to-pvt", "conversion-partnership-to-pvt",
  "conversion-pvt-to-opc", "conversion-partnership-to-llp", "conversion-public-to-pvt",
  // Business Closures
  "closure-pvt", "closure-llp", "closure-opc", "closure-proprietorship",
  "closure-partnership", "closure-nidhi", "closure-sec8", "closure-public",
  "closure-trust", "closure-society",
  // Tax Registrations
  "gst", "lut", "pan-tan", "dpiit", "lower-tax-deduction", "80iac", "12a", "80g",
  "icegate", "form-10a", "non-deduction-declaration", "rcmc",
  // Other Business Registrations (msme/iec live in the Tax category in the DB but
  // are listed here per the document's grouping)
  "msme", "iec", "din", "lei", "ngo-darpan", "rera", "dsc", "iso",
  // Labour & Municipal
  "labour-licence", "epf", "esi", "professional-tax", "trade-licence",
  // Intellectual Property
  "trademark", "patent", "copyright", "design", "layout-design",
  // Industry Specific — licences first, then the 8 department entries. Each
  // department opens a picker of its registrations (its inactive sub-heads).
  "fssai", "factory-licence", "drug-licence",
  "ind-agri", "ind-dept-agriculture", "ind-dept-commerce", "ind-dept-finance",
  "ind-dept-health", "ind-dept-education", "ind-dept-dpiit", "ind-dept-tourism",
];

/** Position of `key` in `order`; unlisted keys sort to the end (stable). */
const rankOf = (order: string[], key: string) => {
  const i = order.indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

/**
 * Convert the backend catalog into sidebar groups. The database is the source of
 * truth for services; the built-in MODULE_GROUPS are only used as a fallback when
 * the catalog is unavailable (offline / API error). Categories and their items
 * are ordered to match the client's document (see CATEGORY_ORDER / ITEM_ORDER).
 */
export function catalogToGroups(groups: CatalogGroup[]): ModuleGroup[] {
  if (!groups || groups.length === 0) return MODULE_GROUPS;

  const mapped: ModuleGroup[] = groups
    .map((g) => {
      // Every item in the category shares one icon. Unlisted (admin-created)
      // categories fall back to the first service's own icon so they are still
      // internally consistent.
      const iconName = CATEGORY_ICON[g.label] ?? g.items.find((i) => i.icon)?.icon ?? null;
      const groupIcon = iconFor(iconName);
      return {
        label: g.label,
        items: g.items
          .filter((i) => !!i.slug)
          .map((i) => ({
            slug: i.slug,
            title: i.title,
            short: i.short || i.title,
            icon: groupIcon,
            authority: i.authority || "—",
            form: i.form || undefined,
          }))
          // Order services within the category to match the document.
          .sort((a, b) => rankOf(ITEM_ORDER, a.slug) - rankOf(ITEM_ORDER, b.slug)),
      };
    })
    .filter((g) => g.items.length > 0)
    // Order the categories themselves to match the document.
    .sort((a, b) => rankOf(CATEGORY_ORDER, a.label) - rankOf(CATEGORY_ORDER, b.label));

  return mapped.length > 0 ? mapped : MODULE_GROUPS;
}
