import { useMemo, useState } from "react";
import { Stepper } from "@/components/stepper";
import {
  AlertTriangle, Download, ArrowLeft, ArrowRight, CheckCircle2,
  Circle, FileText, Info,
} from "lucide-react";

const STEPS = [
  { key: "type", label: "Type" },
  { key: "name", label: "Name" },
  { key: "details", label: "Details" },
  { key: "office", label: "Office" },
  { key: "capital", label: "Capital" },
  { key: "fees", label: "Fees" },
  { key: "summary", label: "Summary" },
];

const ENTITY_TYPES = [
  { key: "pvt", title: "Private Limited Company", suffix: "Private Limited", form: "SPICe+ INC-32", tags: ["FDI Friendly", "Min 2 Dir"], pop: true },
  { key: "public", title: "Public Limited Company", suffix: "Limited", form: "SPICe+ INC-32", tags: ["Min 3 Dir · 7 Sh"] },
  { key: "opc", title: "One Person Company (OPC)", suffix: "(OPC) Private Limited", form: "SPICe+ INC-32", tags: ["Single Member"] },
  { key: "sec8", title: "Section 8 Company (Non-Profit)", suffix: "Foundation / Trust / Association", form: "INC-12", tags: ["Tax Exempt"] },
  { key: "guarantee", title: "Company Limited by Guarantee", suffix: "Limited", form: "INC-32", tags: [] },
  { key: "nidhi", title: "Nidhi Company", suffix: "Nidhi Limited", form: "INC-32 · NDH-4", tags: ["Mutual Benefit"] },
  { key: "producer", title: "Producer Company", suffix: "Producer Company Limited", form: "INC-32", tags: ["Agri / Producer"] },
  { key: "foreign", title: "Foreign Company (Branch/Liaison)", suffix: "Branch / Liaison Office", form: "FC-1", tags: ["RBI Approval"] },
];

const FEE_TABLE: Record<string, { professional: number; mca: number; stamp: number }> = {
  pvt: { professional: 7500, mca: 2200, stamp: 500 },
  public: { professional: 14500, mca: 5600, stamp: 1200 },
  opc: { professional: 6500, mca: 1700, stamp: 400 },
  sec8: { professional: 12500, mca: 2000, stamp: 300 },
  guarantee: { professional: 9500, mca: 2400, stamp: 500 },
  nidhi: { professional: 22500, mca: 4200, stamp: 800 },
  producer: { professional: 18500, mca: 3400, stamp: 700 },
  foreign: { professional: 45000, mca: 7500, stamp: 2000 },
};

export function CompanyWizard() {
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState("pvt");
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [state, setState] = useState("Maharashtra");
  const [directors, setDirectors] = useState(2);
  const [shareholders, setShareholders] = useState(2);
  const [capital, setCapital] = useState(100000);
  const [objects, setObjects] = useState("");

  const selected = ENTITY_TYPES.find((e) => e.key === entity)!;
  const fees = FEE_TABLE[entity];
  const dsc = directors * 900;
  const total = fees.professional + fees.mca + fees.stamp + dsc;

  const nameOk = useMemo(() => {
    if (!name1) return null;
    const len = name1.trim().length;
    const bad = /(India|National|Bharat|President|Bank)/i.test(name1);
    if (len < 3) return { ok: false, msg: "Minimum 3 characters" };
    if (bad) return { ok: false, msg: "Contains restricted keyword — needs Central Govt. approval" };
    return { ok: true, msg: "Preliminary check passed — reserve via RUN / SPICe+ Part A" };
  }, [name1]);

  const capitalCategory =
    capital <= 100000 ? "Small" : capital <= 1000000 ? "Standard" : capital <= 10000000 ? "Growth" : "Large";

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Center */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-8">
          {/* Context */}
          <div className="mb-6">
            <div className="label-eyebrow mb-2">
              Company Registration · MCA / SPICe+
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Company Incorporation Wizard
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[62ch]">
              V4-style validations, suffix rules, capital preview and dynamic fee
              logic — governed by the Companies Act, 2013 and MCA e-forms.
            </p>
          </div>

          <Stepper steps={STEPS} current={step} onGo={setStep} />

          <div className="mt-8 rounded-lg border border-border bg-panel/40 p-4 flex gap-3">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Minimum rules · </span>
              Pvt Ltd 2 directors / 2 shareholders · Public 3 / 7 · OPC 1 / 1 +
              nominee · Section 8 for non-profit objects.
            </div>
          </div>

          <div className="mt-8">
            {step === 0 && (
              <div className="grid grid-cols-2 gap-3">
                {ENTITY_TYPES.map((t) => {
                  const active = t.key === entity;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setEntity(t.key)}
                      className={
                        "text-left p-4 rounded-lg bg-panel border transition-all " +
                        (active
                          ? "border-brand ring-1 ring-brand/40"
                          : "border-border hover:border-border-strong")
                      }
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className="text-sm font-medium leading-tight">
                          {t.title}
                        </span>
                        <span className="text-[9px] mono text-muted-foreground shrink-0">
                          {t.form}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mb-3">
                        Suffix: {t.suffix}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.pop && (
                          <span className="px-1.5 py-0.5 rounded bg-brand/15 text-brand text-[9px] mono uppercase tracking-wider">
                            Popular
                          </span>
                        )}
                        {t.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] mono uppercase tracking-wider"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <Field label="Proposed Name 1">
                  <div className="flex gap-2">
                    <Input value={name1} onChange={setName1} placeholder="e.g. ACME TECH SOLUTIONS" />
                    <span className="mono text-xs text-muted-foreground self-center whitespace-nowrap">
                      {selected.suffix}
                    </span>
                  </div>
                  {nameOk && (
                    <div
                      className={
                        "mt-2 text-[11px] flex items-center gap-1.5 " +
                        (nameOk.ok ? "text-success" : "text-destructive")
                      }
                    >
                      {nameOk.ok ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <AlertTriangle className="size-3" />
                      )}
                      {nameOk.msg}
                    </div>
                  )}
                </Field>
                <Field label="Proposed Name 2 (Alternate)">
                  <Input value={name2} onChange={setName2} placeholder="Optional alternate name" />
                </Field>
                <Field label="Object / Industry">
                  <textarea
                    value={objects}
                    onChange={(e) => setObjects(e.target.value)}
                    rows={3}
                    placeholder="Main object of the company (e.g. software development, trading of…)"
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Number of Directors">
                  <NumberInput value={directors} onChange={setDirectors} min={1} max={15} />
                </Field>
                <Field label="Number of Shareholders">
                  <NumberInput value={shareholders} onChange={setShareholders} min={1} max={200} />
                </Field>
                <Field label="Applicant PAN">
                  <Input value="" onChange={() => {}} placeholder="ABCDE1234F" />
                </Field>
                <Field label="Applicant Email">
                  <Input value="" onChange={() => {}} placeholder="applicant@company.in" />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <Field label="Registered Office Address">
                  <textarea
                    rows={3}
                    placeholder="Line 1, Line 2, Locality"
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="State">
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                      {["Maharashtra","Karnataka","Delhi","Tamil Nadu","Gujarat","Telangana","West Bengal","Uttar Pradesh"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="City">
                    <Input value="" onChange={() => {}} placeholder="Mumbai" />
                  </Field>
                  <Field label="PIN Code">
                    <Input value="" onChange={() => {}} placeholder="400001" />
                  </Field>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <Field label={`Authorised Capital (INR)`}>
                  <div className="flex items-center gap-3">
                    <NumberInput value={capital} onChange={setCapital} min={10000} step={10000} />
                    <span className="px-2 py-1 rounded bg-panel border border-border text-[10px] mono uppercase tracking-wider text-muted-foreground">
                      {capitalCategory}
                    </span>
                  </div>
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  {[100000, 1000000, 10000000].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCapital(c)}
                      className="p-3 rounded-md border border-border bg-panel hover:border-brand text-left"
                    >
                      <div className="text-[10px] mono text-muted-foreground uppercase">
                        Preset
                      </div>
                      <div className="mono text-sm mt-1">
                        ₹ {c.toLocaleString("en-IN")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <FeeBreakdown fees={fees} dsc={dsc} total={total} />
            )}

            {step === 6 && (
              <SummaryPreview
                selected={selected}
                name1={name1}
                state={state}
                directors={directors}
                shareholders={shareholders}
                capital={capital}
                total={total}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right live panel */}
      <aside className="w-80 border-l border-border bg-surface/60 overflow-y-auto">
        <div className="p-6">
          <div className="label-eyebrow mb-4">Live Fee Estimate</div>
          <FeeStack fees={fees} dsc={dsc} total={total} />

          <div className="mt-8">
            <div className="label-eyebrow mb-3">Selection</div>
            <div className="rounded-md border border-border bg-panel p-3">
              <div className="text-[11px] text-muted-foreground">Entity Type</div>
              <div className="text-sm font-medium mt-0.5">{selected.title}</div>
              <div className="text-[10px] mono text-muted-foreground mt-2">
                Form · {selected.form}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="label-eyebrow mb-3">Document Checklist</div>
            <ul className="space-y-2.5">
              {[
                ["PAN & Aadhaar (all directors)", true],
                ["Passport-size photograph", true],
                ["Address proof (utility bill < 2 mo)", !!name1],
                ["Rent agreement + NOC of premises", step >= 3],
                ["Digital Signature Certificate (DSC)", step >= 2],
                ["MoA & AoA drafts", step >= 4],
              ].map(([label, done]) => (
                <li key={label as string} className="flex items-start gap-2 text-[11px]">
                  {done ? (
                    <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="size-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
                  )}
                  <span className={done ? "text-foreground" : "text-muted-foreground"}>
                    {label as string}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 rounded-md border border-accent/30 bg-accent/5 p-3 flex gap-2">
            <Info className="size-3.5 text-accent shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground">
              Government fees are indicative and vary with state stamp duty. Final
              quote confirmed on SPICe+ Part A submission.
            </div>
          </div>
        </div>
      </aside>

      {/* Footer bar */}
      <div className="fixed bottom-0 left-72 right-80 h-16 border-t border-border bg-surface px-8 flex items-center justify-between">
        <button
          onClick={back}
          disabled={step === 0}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] mono text-muted-foreground uppercase tracking-wider">
            Total est.
          </span>
          <span className="mono text-sm">₹ {total.toLocaleString("en-IN")}</span>
          <span className="w-px h-6 bg-border mx-2" />
          {step === STEPS.length - 1 ? (
            <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-xs font-semibold hover:bg-brand/90">
              <Download className="size-3.5" /> Download Summary
            </button>
          ) : (
            <button
              onClick={next}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-xs font-semibold hover:bg-brand/90"
            >
              Next · {STEPS[step + 1].label}
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------- primitives -------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}
function Input({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
    />
  );
}
function NumberInput({
  value, onChange, min = 0, max, step = 1,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm mono focus:outline-none focus:ring-1 focus:ring-brand"
    />
  );
}

function FeeStack({
  fees, dsc, total,
}: { fees: { professional: number; mca: number; stamp: number }; dsc: number; total: number }) {
  const rows = [
    ["Professional Fee", fees.professional],
    ["MCA Govt. Filing", fees.mca],
    ["DSC (per director)", dsc],
    ["Stamp Duty (est.)", fees.stamp],
  ] as const;
  return (
    <div className="space-y-2.5">
      {rows.map(([label, amt]) => (
        <div key={label} className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="mono">₹ {amt.toLocaleString("en-IN")}</span>
        </div>
      ))}
      <div className="pt-3 mt-2 border-t border-border flex justify-between items-baseline">
        <span className="text-xs font-medium">Total Estimate</span>
        <span className="mono text-xl text-brand">
          ₹ {total.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

function FeeBreakdown({
  fees, dsc, total,
}: { fees: { professional: number; mca: number; stamp: number }; dsc: number; total: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="size-4 text-brand" />
        <h3 className="text-sm font-semibold">Fee Breakdown</h3>
      </div>
      <FeeStack fees={fees} dsc={dsc} total={total} />
      <div className="mt-6 text-[11px] text-muted-foreground border-t border-border pt-4">
        This estimate covers name reservation, SPICe+ Part A & B, DSC, PAN,
        TAN and INC-33/34. Additional state-specific stamp duty may apply.
      </div>
    </div>
  );
}

function SummaryPreview({
  selected, name1, state, directors, shareholders, capital, total,
}: {
  selected: { title: string; suffix: string; form: string };
  name1: string; state: string; directors: number; shareholders: number;
  capital: number; total: number;
}) {
  const rows = [
    ["Entity", selected.title],
    ["Proposed Name", name1 ? `${name1} ${selected.suffix}` : "—"],
    ["Filing Form", selected.form],
    ["Directors", String(directors)],
    ["Shareholders", String(shareholders)],
    ["Authorised Capital", `₹ ${capital.toLocaleString("en-IN")}`],
    ["Registered State", state],
    ["Total Estimate", `₹ ${total.toLocaleString("en-IN")}`],
  ];
  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="label-eyebrow mb-4">Application Summary · DRAFT</div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-baseline border-b border-border/60 pb-2">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="text-sm font-medium mono">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
