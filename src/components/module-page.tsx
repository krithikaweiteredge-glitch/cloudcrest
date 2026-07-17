import { useState } from "react";
import { getModule, MODULE_GROUPS } from "@/lib/modules";
import { CompanyWizard } from "@/components/company-wizard";
import { RegisterDialog } from "@/components/register-dialog";
import { Link } from "@tanstack/react-router";
import {
  FileText, ShieldCheck, Clock, ArrowRight, CheckCircle2,
  Sparkles, Phone,
} from "lucide-react";

const DEFAULT_DOCS = [
  "PAN card of applicant / entity",
  "Aadhaar of applicant / authorised signatory",
  "Passport-size photograph",
  "Address proof (utility bill < 2 months)",
  "Registered office proof",
  "Rent agreement + NOC (if premises rented)",
  "Board resolution / authorisation letter",
  "Bank account statement (last 3 months)",
];

const DOCS_BY_SLUG: Record<string, string[]> = {
  llp: ["PAN & Aadhaar of designated partners", "Passport-size photos", "Digital Signature (DSC)", "Address proof of office", "Rent agreement + NOC", "LLP agreement draft", "Consent letters (Form 9)"],
  partnership: ["PAN of all partners", "Aadhaar of partners", "Partnership deed", "Address proof of firm", "Rent agreement / ownership proof"],
  "trust-society": ["Trust deed / MoA", "PAN & Aadhaar of trustees / members", "Address proof of office", "Photographs of trustees", "Registered office NOC"],
  huf: ["PAN of Karta", "Aadhaar of Karta and coparceners", "HUF deed on stamp paper", "Bank account proof"],
  gst: ["PAN of business", "Aadhaar of proprietor / partners", "Business address proof", "Rent agreement + NOC", "Bank statement or cancelled cheque", "Board resolution (companies)", "Digital Signature (DSC)"],
  "pan-tan": ["Identity proof (Aadhaar / Passport)", "Address proof", "Date of birth proof", "Passport-size photograph", "Business registration proof (for TAN)"],
  msme: ["Aadhaar of proprietor / signatory", "PAN of business", "Bank account details", "Business address proof", "Investment & turnover details"],
  iec: ["PAN of applicant / entity", "Aadhaar / voter ID of proprietor", "Business address proof", "Cancelled cheque of current account", "Digital photograph"],
  dpiit: ["Certificate of incorporation", "PAN of entity", "Brief write-up on innovation", "Website / pitch deck", "Details of directors / founders"],
  "labour-licence": ["Certificate of incorporation", "PAN of establishment", "Address proof", "List of workers / contract labour", "Consent of principal employer"],
  epf: ["PAN of establishment", "Certificate of incorporation", "Address proof of premises", "List of employees with salary", "Bank account details", "Digital Signature (DSC)"],
  esi: ["PAN of establishment", "Registration certificate under Shops & Estd. / Factories Act", "Address proof", "List of employees & wages", "Bank details", "Cancelled cheque"],
  "shop-establishment": ["PAN & Aadhaar of proprietor", "Address proof of shop", "Rent agreement / ownership proof", "Photograph of shop front", "List of employees"],
  "trade-licence": ["PAN & Aadhaar of applicant", "Property tax receipt / ownership proof", "NOC from landlord", "Layout plan of premises", "Photographs of the premises"],
  "fire-noc": ["Building plan approved by authority", "Ownership / lease deed", "Occupancy certificate", "Details of fire safety measures", "Photographs of installations"],
  fssai: ["PAN & Aadhaar of applicant", "Business address proof", "List of food products", "Layout of processing unit", "Water test report", "Food safety management plan"],
  "pollution-ncb": ["Incorporation certificate", "Site plan & manufacturing process", "Consent application form", "Land documents", "List of hazardous materials"],
  "drug-licence": ["Site plan & key plan of premises", "Qualification certificates of pharmacist", "Affidavit of non-conviction", "Ownership / rent proof", "Cold storage details (if applicable)"],
  trademark: ["Logo / wordmark in JPG/PNG", "Trademark class & description", "Applicant identity proof", "Business registration proof", "User affidavit (if prior use)", "Power of Attorney (TM-48)"],
  patent: ["Detailed invention description", "Drawings / diagrams", "Applicant details", "Priority document (if any)", "Form-1, 2, 3, 5 drafts", "Assignment deed (if applicable)"],
  copyright: ["Copy of the work being registered", "Applicant identity proof", "NOC from author (if different)", "Power of Attorney", "Publisher details (if published)"],
  design: ["Representation of the design (4 views)", "Novelty statement", "Applicant identity proof", "Power of Attorney", "Class of article (Locarno)"],
};

export function ModulePage({ slug }: { slug: string }) {
  const m = getModule(slug);
  if (!m) {
    return (
      <div className="p-10">
        <h1 className="text-xl">Module not found</h1>
      </div>
    );
  }
  if (slug === "company") return <CompanyWizard />;
  return <GenericModule slug={slug} />;
}

function GenericModule({ slug }: { slug: string }) {
  const m = getModule(slug)!;
  const Icon = m.icon;
  const group = MODULE_GROUPS.find((g) => g.items.some((i) => i.slug === slug))!;
  const siblings = group.items.filter((i) => i.slug !== slug).slice(0, 3);
  const docs = DOCS_BY_SLUG[slug] ?? DEFAULT_DOCS;
  const [openReg, setOpenReg] = useState(false);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, oklch(0.7 0.19 45 / 0.45), transparent 40%), radial-gradient(circle at 85% 80%, oklch(0.6 0.18 240 / 0.5), transparent 45%)",
          }}
        />
        <div className="relative px-10 py-10 max-w-5xl">
          <div className="flex items-center gap-2 text-[11px] mono uppercase tracking-widest text-white/70">
            <span>{group.label}</span>
            <span className="text-white/30">/</span>
            <span className="text-primary">{m.short}</span>
          </div>
          <div className="mt-3 flex items-start gap-5">
            <div className="size-14 rounded-xl bg-white/10 border border-white/20 backdrop-blur grid place-items-center shrink-0">
              <Icon className="size-7 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-semibold font-display tracking-tight leading-[1.05]">
                {m.title}
              </h1>
              <p className="text-white/70 mt-2 text-[15px] max-w-2xl">
                End-to-end {m.title.toLowerCase()} handled by Cloudcrest BM associates —
                document verification, filing and post-approval support.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => setOpenReg(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-brand hover:shadow-elev hover:brightness-110 transition-all"
                >
                  Register Now <ArrowRight className="size-4" />
                </button>
                <a href="tel:+918977079433"
                  className="flex items-center gap-2 px-5 py-3 rounded-lg bg-white/10 border border-white/20 backdrop-blur text-sm font-medium hover:bg-white/15 transition-colors">
                  <Phone className="size-4" /> Talk to advisor
                </a>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Chip label={`Authority · ${m.authority}`} />
            <Chip label={`Form · ${m.form ?? "—"}`} />
            <Chip label="TAT · 7–15 days" />
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="px-10 py-10 max-w-6xl mx-auto space-y-8 animate-in-up">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { k: "Filing authority", v: m.authority, i: ShieldCheck },
            { k: "Primary form", v: m.form ?? "—", i: FileText },
            { k: "Typical TAT", v: "7 – 15 days", i: Clock },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-border bg-surface shadow-card p-5 hover-lift">
              <div className="flex items-center gap-2 label-eyebrow mb-2">
                <c.i className="size-3 text-primary" />
                {c.k}
              </div>
              <div className="text-lg font-semibold mono">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface shadow-card p-7">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Workflow Overview</h2>
            </div>
            <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {[
                "Applicant profile & eligibility",
                "Document upload & verification",
                "Draft application preview",
                "Fee estimate & payment",
                "Regulatory filing",
                "Certificate download",
              ].map((s, i) => (
                <li key={s} className="flex items-start gap-3 group">
                  <span className="size-6 rounded-md bg-primary/10 text-primary mono text-[10px] font-semibold grid place-items-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-foreground/85 pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[12px] text-muted-foreground">
                Backed by Cloudcrest BM compliance associates. Advisor call
                included in professional fee.
              </p>
              <button
                onClick={() => setOpenReg(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all self-start sm:self-auto"
              >
                Start {m.short} Application <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface shadow-card p-6">
              <div className="label-eyebrow mb-3 text-primary">Documents required</div>
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[13px]">
                    <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
                    <span className="text-foreground/85">{d}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setOpenReg(true)}
                className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand hover:shadow-elev transition-all"
              >
                Upload documents & register
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="label-eyebrow">Also in {group.label}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {siblings.map((s) => {
              const SIcon = s.icon;
              return (
                <Link
                  key={s.slug}
                  to="/m/$slug"
                  params={{ slug: s.slug }}
                  className="group rounded-xl border border-border bg-surface p-4 hover-lift shadow-card flex items-center gap-3"
                >
                  <div className="size-9 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
                    <SIcon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate mono">
                      {s.authority} · {s.form ?? "—"}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <RegisterDialog
        open={openReg}
        onClose={() => setOpenReg(false)}
        serviceSlug={slug}
        serviceTitle={m.title}
        authority={m.authority}
        form={m.form}
        documents={docs}
      />
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur text-[11px] mono text-white/90">
      {label}
    </span>
  );
}
