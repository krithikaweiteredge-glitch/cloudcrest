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
 * Convert the backend catalog into sidebar groups. The database is the source of
 * truth for services; the built-in MODULE_GROUPS are only used as a fallback when
 * the catalog is unavailable (offline / API error).
 */
export function catalogToGroups(groups: CatalogGroup[]): ModuleGroup[] {
  if (!groups || groups.length === 0) return MODULE_GROUPS;

  const mapped: ModuleGroup[] = groups
    .map((g) => ({
      label: g.label,
      items: g.items
        .filter((i) => !!i.slug)
        .map((i) => ({
          slug: i.slug,
          title: i.title,
          short: i.short || i.title,
          icon: iconFor(i.icon),
          authority: i.authority || "—",
          form: i.form || undefined,
        })),
    }))
    .filter((g) => g.items.length > 0);

  return mapped.length > 0 ? mapped : MODULE_GROUPS;
}
