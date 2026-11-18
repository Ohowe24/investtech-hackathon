"use client";

// Graphics Jarvis puts up while it talks. Each kind answers one kind of question, and every figure in it is
// read from the dataset and formatted the way the rest of the site formats it: Claude picks what to show
// (and a one-line title, number-checked on the server), never the numbers.

import type { CheckResult, Company, Dataset, MetricDef } from "@contract/types";
import { formatValue, recStyle, verdictStyle } from "@/lib/format";
import { ordinal, ranking } from "@/lib/rank";
import { defOf, findCompany, formatSeries, seriesLabel, tested, yearValue } from "@/lib/jarvis/data";

export type GraphicSpec =
  | { kind: "verdict"; ticker: string; title?: string }
  | { kind: "check"; metricId: string; ticker?: string; title?: string }
  | { kind: "versus"; a: string; b: string; title?: string }
  | { kind: "trend"; ticker: string; series: string; title?: string }
  | { kind: "picks"; title?: string }
  | { kind: "funnel"; title?: string };

/** The growth metric that goes with a yearly series, to annotate the trend. */
const SERIES_GROWTH: Record<string, string> = { fcfPerShare: "fcfPerShareCagr", revenue: "revenueCagr", dilutedShares: "shareCountChange" };

/** Turns a cue's attributes into a spec. null when the cue doesn't name something real. */
export function toSpec(ds: Dataset, a: Record<string, string>): GraphicSpec | null {
  const title = a.title || undefined;
  const c = a.ticker ? findCompany(ds, a.ticker) : undefined;
  switch (a.kind) {
    case "verdict":
      return c?.model ? { kind: "verdict", ticker: c.ticker, title } : null;
    case "check": {
      const def = defOf(ds, a.metric) ?? ds.metricDefs.find((d) => d.label.toLowerCase() === (a.metric ?? "").toLowerCase());
      return def ? { kind: "check", metricId: def.id, ticker: c?.ticker, title } : null;
    }
    case "versus": {
      const [x, y] = (a.tickers ?? "").split(",").map((t) => findCompany(ds, t.trim()));
      return x?.model && y?.model && x !== y ? { kind: "versus", a: x.ticker, b: y.ticker, title } : null;
    }
    case "trend": {
      const series = a.series || "fcfPerShare";
      return c?.history?.some((r) => yearValue(r, series) != null) ? { kind: "trend", ticker: c.ticker, series, title } : null;
    }
    case "picks":
      return ds.companies.some((x) => x.verdict === "add") ? { kind: "picks", title } : null;
    case "funnel":
      return { kind: "funnel", title };
  }
  return null;
}

export default function Graphic({ spec, dataset }: { spec: GraphicSpec; dataset: Dataset }) {
  return (
    <div className="jarvis-graphic relative w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-[22px] border border-white/10 bg-[#070a0a]/92 text-white shadow-[0_40px_100px_-24px_rgba(0,0,0,0.95),0_0_0_1px_rgba(61,220,108,0.08),0_0_60px_-20px_rgba(61,220,108,0.25)] backdrop-blur-2xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent" />
      {spec.kind === "verdict" && <Verdict spec={spec} ds={dataset} />}
      {spec.kind === "check" && <Check spec={spec} ds={dataset} />}
      {spec.kind === "versus" && <Versus spec={spec} ds={dataset} />}
      {spec.kind === "trend" && <Trend spec={spec} ds={dataset} />}
      {spec.kind === "picks" && <Picks spec={spec} ds={dataset} />}
      {spec.kind === "funnel" && <Funnel spec={spec} ds={dataset} />}
    </div>
  );
}

// ───────────────────────── Pieces ─────────────────────────

function Head({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-6 pb-4 pt-5">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal/80">{kicker}</div>
        <div className="mt-1 text-[19px] font-semibold leading-tight tracking-tight">{title}</div>
      </div>
      {right}
    </div>
  );
}

const VERDICT_TONE: Record<string, string> = {
  add: "border-signal/40 bg-signal/15 text-signal",
  watch: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  reject: "border-red-400/40 bg-red-500/15 text-red-300",
  existing: "border-white/20 bg-white/[0.06] text-white/70",
};

function Pill({ c }: { c: Company }) {
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${VERDICT_TONE[c.verdict]}`}>{verdictStyle[c.verdict].label}</span>;
}

function Tick({ pass }: { pass: boolean | null }) {
  if (pass == null) return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/20 text-[10px] text-white/40">–</span>;
  return pass
    ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-signal/50 bg-signal/15 text-[11px] text-signal">✓</span>
    : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-red-400/50 bg-red-500/15 text-[11px] text-red-300">✕</span>;
}

/** Where a value sits on a scale that covers every tested company's value and the pass line. */
function scaleFor(ds: Dataset, def: MetricDef, check?: CheckResult) {
  const vals = tested(ds).map((c) => c.metrics[def.id]?.value).filter((v): v is number => v != null).sort((x, y) => x - y);
  // Trim the extreme 5% each side so one outlier doesn't flatten everyone else.
  const lo = Math.min(vals[Math.floor(vals.length * 0.05)] ?? 0, check?.threshold ?? Infinity, 0);
  const hi = Math.max(vals[Math.ceil(vals.length * 0.95) - 1] ?? 1, check?.threshold ?? -Infinity);
  const span = hi - lo || 1;
  return (v: number) => Math.max(0, Math.min(1, (v - lo) / span));
}

function Ring({ passed, total }: { passed: number; total: number }) {
  const r = 26, c = 2 * Math.PI * r, f = total ? passed / total : 0;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-label={`${passed} of ${total} checks pass`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={f === 1 ? "#3ddc6c" : f >= 0.5 ? "#e0b341" : "#f87171"} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 32 32)" className="jarvis-ring-draw" style={{ ["--len" as string]: `${c}` }} />
      <text x="32" y="36" textAnchor="middle" className="fill-white font-mono text-[13px] font-semibold">{passed}/{total}</text>
    </svg>
  );
}

// ───────────────────────── Kinds ─────────────────────────

function Verdict({ spec, ds }: { spec: Extract<GraphicSpec, { kind: "verdict" }>; ds: Dataset }) {
  const c = findCompany(ds, spec.ticker)!;
  const m = c.model!;
  return (
    <>
      <Head kicker={`${c.ticker} · ${recStyle[m.recommendation].label} · rank ${m.rank} of ${tested(ds).length}`} title={spec.title ?? c.name}
        right={<Ring passed={m.checks.filter((k) => k.pass === true).length} total={m.checks.filter((k) => k.pass != null).length} />} />
      <div className="flex items-center gap-2 px-6 pb-3"><Pill c={c} />{c.reason && <span className="truncate text-[12.5px] text-white/60">{c.reason}</span>}</div>
      <ul className="space-y-3 border-t border-white/[0.06] px-6 py-4">
        {m.checks.map((k, i) => {
          const def = defOf(ds, k.metricId);
          const v = c.metrics[k.metricId]?.value;
          const at = def ? scaleFor(ds, def, k) : () => 0;
          return (
            <li key={k.id} className="jarvis-in" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <div className="flex items-center gap-2.5">
                <Tick pass={k.pass} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{k.label}{k.kind === "gate" && <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-amber-200/70">must pass</span>}</span>
                <span className={`font-mono text-[13px] tabular-nums ${k.pass === false ? "text-red-300" : k.pass ? "text-signal" : "text-white/50"}`}>{def ? formatValue(v, def.unit) : "Missing"}</span>
              </div>
              {def && v != null && (
                <div className="relative ml-[30px] mt-1.5 h-1.5 rounded-full bg-white/[0.07]">
                  {k.threshold != null && (
                    <span className="absolute -top-1 h-3.5 w-px bg-white/60" style={{ left: `${at(k.threshold) * 100}%` }} title={`Pass line ${k.target ?? ""}`} />
                  )}
                  <span className={`jarvis-bar absolute inset-y-0 left-0 rounded-full ${k.pass === false ? "bg-red-400/80" : "bg-signal/80"}`} style={{ width: `${Math.max(2, at(v) * 100)}%`, animationDelay: `${160 + i * 70}ms` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Foot>White tick = the pass line · bar = where {c.ticker} sits among every company tested</Foot>
    </>
  );
}

function Check({ spec, ds }: { spec: Extract<GraphicSpec, { kind: "check" }>; ds: Dataset }) {
  const def = defOf(ds, spec.metricId)!;
  const check = tested(ds).find((c) => c.model?.checks.some((k) => k.metricId === def.id))?.model?.checks.find((k) => k.metricId === def.id);
  const all = ranking(tested(ds), def).filter((c) => c.metrics[def.id]?.value != null);
  const hotAt = spec.ticker ? all.findIndex((c) => c.ticker === spec.ticker) : -1;
  // Short list: everyone. Long list: the top, the highlighted company and its neighbours, and the bottom,
  // so the pass line visibly splits passes from fails.
  const keep = new Set<number>();
  if (all.length <= 13) all.forEach((_, i) => keep.add(i));
  else {
    for (let i = 0; i < 4; i++) keep.add(i);
    if (hotAt >= 0) for (let i = hotAt - 2; i <= hotAt + 2; i++) if (i >= 0 && i < all.length) keep.add(i);
    for (let i = all.length - 4; i < all.length; i++) keep.add(i);
  }
  const idx = [...keep].sort((a, b) => a - b);
  const vals = idx.map((i) => all[i].metrics[def.id]!.value!);
  // Scale to what's shown. One runaway value is capped (and marked) so it doesn't flatten the rest.
  const sorted = [...vals].sort((a, b) => b - a);
  const cap = sorted.length > 2 && sorted[0] > 2 * Math.max(sorted[1], 1e-9) && sorted[1] > 0 ? sorted[1] * 1.25 : sorted[0];
  const lo = Math.min(0, ...vals, check?.threshold ?? 0);
  const hi = Math.max(cap, check?.threshold ?? -Infinity, lo + 1e-9);
  const at = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const line = check?.threshold != null ? at(check.threshold) : null;
  const hot = hotAt >= 0 ? all[hotAt] : undefined;
  return (
    <>
      <Head kicker={check ? `Check · ${check.label}` : def.label} title={spec.title ?? (hot ? `${hot.name}: ${ordinal(hotAt + 1)} of ${all.length}` : def.label)} />
      <div className="relative px-6 pb-2">
        {line != null && (
          <div className="pointer-events-none absolute bottom-2 top-0 z-10" style={{ left: `calc(100px + (100% - 212px) * ${line})` }}>
            <div className="h-full w-px border-l border-dashed border-white/60" />
            <div className="absolute -top-0.5 left-1.5 whitespace-nowrap rounded bg-black/60 px-1 font-mono text-[10px] text-white/80">pass line {check?.target}</div>
          </div>
        )}
        <ul className="space-y-1 pt-5">
          {idx.map((i, n) => {
            const c = all[i];
            const v = vals[n];
            const isHot = i === hotAt;
            const pass = c.model?.checks.find((k) => k.metricId === def.id)?.pass;
            const gap = n > 0 && i - idx[n - 1] > 1;
            return (
              <li key={c.ticker}>
                {gap && <div className="py-0.5 pl-1.5 font-mono text-[10px] tracking-widest text-white/25">· · · {i - idx[n - 1] - 1} more</div>}
                <div className={`jarvis-in flex items-center gap-2 rounded-md py-0.5 ${isHot ? "bg-signal/[0.08] ring-1 ring-signal/40" : ""}`} style={{ animationDelay: `${n * 40}ms` }}>
                  <span className={`w-[68px] shrink-0 truncate pl-1.5 font-mono text-[11.5px] font-semibold ${isHot ? "text-white" : "text-white/55"}`}>{c.ticker}</span>
                  <span className="relative h-3 flex-1">
                    <span className={`jarvis-bar absolute inset-y-0 left-0 rounded-sm ${pass === false ? "bg-red-400/75" : isHot ? "bg-signal shadow-[0_0_14px_rgba(61,220,108,0.8)]" : "bg-signal/40"}`}
                      style={{ width: `${Math.max(1.5, at(v) * 100)}%`, animationDelay: `${n * 40}ms` }} />
                    {v > hi && <span className="absolute -right-1 top-1/2 -translate-y-1/2 font-mono text-[11px] text-white/70">»</span>}
                  </span>
                  <span className={`w-[80px] shrink-0 pr-1.5 text-right font-mono text-[12px] tabular-nums ${isHot ? "text-white" : pass === false ? "text-red-300/90" : "text-white/60"}`}>{formatValue(v, def.unit)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <Foot>{def.higherIsBetter === false ? "Lower is better" : def.higherIsBetter ? "Higher is better" : "Ranked high to low"} · green passes, red fails · {all.length} companies with data{vals.some((v) => v > hi) ? " · » = off the scale" : ""}</Foot>
    </>
  );
}

function Versus({ spec, ds }: { spec: Extract<GraphicSpec, { kind: "versus" }>; ds: Dataset }) {
  const a = findCompany(ds, spec.a)!, b = findCompany(ds, spec.b)!;
  const checks = a.model!.checks;
  const side = (c: Company) => (
    <div className="min-w-0 flex-1">
      <div className="font-mono text-[12px] font-semibold text-white/60">{c.ticker}</div>
      <div className="truncate text-[15px] font-semibold">{c.name}</div>
      <div className="mt-1.5 flex items-center gap-2"><Pill c={c} /><span className="font-mono text-[11px] text-white/50">rank {c.model!.rank}</span></div>
    </div>
  );
  return (
    <>
      <Head kicker="Head to head" title={spec.title ?? `${a.name} vs ${b.name}`} />
      <div className="flex gap-4 px-6 pb-3">{side(a)}<div className="text-right">{side(b)}</div></div>
      <ul className="border-t border-white/[0.06] px-6 py-2">
        {checks.map((k, i) => {
          const def = defOf(ds, k.metricId);
          const kb = b.model?.checks.find((x) => x.metricId === k.metricId);
          const va = a.metrics[k.metricId]?.value, vb = b.metrics[k.metricId]?.value;
          const better = va == null || vb == null || va === vb || def?.higherIsBetter == null ? null : (va > vb) === def.higherIsBetter ? "a" : "b";
          return (
            <li key={k.id} className="jarvis-in grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.04] py-2.5 last:border-0" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="flex items-center gap-2">
                <Tick pass={k.pass} />
                <span className={`font-mono text-[14px] tabular-nums ${better === "a" ? "font-semibold text-white" : "text-white/60"}`}>{def ? formatValue(va, def.unit) : "Missing"}</span>
              </span>
              <span className="text-center">
                <span className="block text-[12px] text-white/75">{def?.short ?? k.label}</span>
                <span className="block font-mono text-[10px] text-white/40">bar {k.target}</span>
              </span>
              <span className="flex items-center justify-end gap-2">
                <span className={`font-mono text-[14px] tabular-nums ${better === "b" ? "font-semibold text-white" : "text-white/60"}`}>{def ? formatValue(vb, def.unit) : "Missing"}</span>
                <Tick pass={kb?.pass ?? null} />
              </span>
            </li>
          );
        })}
      </ul>
      <Foot>Bold = the better of the two on that check</Foot>
    </>
  );
}

function Trend({ spec, ds }: { spec: Extract<GraphicSpec, { kind: "trend" }>; ds: Dataset }) {
  const c = findCompany(ds, spec.ticker)!;
  const rows = [...(c.history ?? [])].sort((x, y) => x.fiscalYear - y.fiscalYear).map((r) => ({ y: r.fiscalYear, v: yearValue(r, spec.series) }));
  const nums = rows.map((r) => r.v).filter((v): v is number => v != null);
  const max = Math.max(...nums.map(Math.abs), 1e-9);
  const growthDef = defOf(ds, SERIES_GROWTH[spec.series]);
  const growth = growthDef ? c.metrics[growthDef.id]?.value : null;
  const W = 432, H = 170, top = 26, base = H - 4;
  const bw = W / rows.length;
  const yOf = (v: number) => base - (Math.abs(v) / max) * (base - top);
  const pts = rows.map((r, i) => (r.v == null ? null : `${i * bw + bw / 2},${yOf(r.v)}`)).filter(Boolean).join(" ");
  return (
    <>
      <Head kicker={`${c.ticker} · yearly · ${c.reportingCurrency ?? ds.currency}`} title={spec.title ?? `${c.name}: ${seriesLabel(spec.series)}`}
        right={growthDef && growth != null ? (
          <div className="rounded-xl border border-signal/30 bg-signal/10 px-3 py-1.5 text-right">
            <div className="font-mono text-[18px] font-semibold text-signal">{formatValue(growth, growthDef.unit)}</div>
            <div className="max-w-[130px] text-[10px] leading-tight text-white/55">{growthDef.label}</div>
          </div>
        ) : undefined} />
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="block w-full px-6 pb-2" role="img" aria-label={`${seriesLabel(spec.series)} by year`}>
        <defs>
          <linearGradient id="jv-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5eead4" stopOpacity="0.55" /><stop offset="1" stopColor="#5eead4" stopOpacity="0.08" /></linearGradient>
          <linearGradient id="jv-bar-hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ddc6c" /><stop offset="1" stopColor="#3ddc6c" stopOpacity="0.2" /></linearGradient>
        </defs>
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          const y = r.v == null ? base : yOf(r.v);
          return (
            <g key={r.y} className="jarvis-in" style={{ animationDelay: `${i * 90}ms` }}>
              <rect x={i * bw + bw * 0.2} y={y} width={bw * 0.6} height={base - y} rx={5} fill={r.v != null && r.v < 0 ? "#f87171" : last ? "url(#jv-bar-hot)" : "url(#jv-bar)"} />
              <text x={i * bw + bw / 2} y={y - 8} textAnchor="middle" className={`font-mono text-[11px] ${last ? "fill-white" : "fill-white/65"}`}>{formatSeries(spec.series, r.v)}</text>
              <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" className="fill-white/45 font-mono text-[10.5px]">FY{r.y}</text>
            </g>
          );
        })}
        {pts && <polyline points={pts} fill="none" stroke="#3ddc6c" strokeWidth="1.5" strokeOpacity="0.7" className="jarvis-line" />}
      </svg>
    </>
  );
}

function Picks({ spec, ds }: { spec: Extract<GraphicSpec, { kind: "picks" }>; ds: Dataset }) {
  const cands = tested(ds).filter((c) => !c.inIndex);
  const picks = cands.filter((c) => c.verdict === "add");
  return (
    <>
      <Head kicker={`Recommended · ${picks.length} of ${cands.length} candidates`} title={spec.title ?? "The companies to add"} />
      <ul className="grid grid-cols-2 gap-2 px-6 pb-5">
        {picks.map((c, i) => (
          <li key={c.ticker} className="jarvis-in rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] font-semibold text-signal">{c.ticker}</span>
              <span className="font-mono text-[10.5px] text-white/45">#{c.model!.rank}</span>
            </div>
            <div className="truncate text-[13px] text-white/90">{c.name}</div>
            <div className="mt-1.5 flex gap-0.5">
              {c.model!.checks.map((k) => <span key={k.id} className={`h-1.5 flex-1 rounded-full ${k.pass == null ? "bg-white/15" : k.pass ? "bg-signal/80" : "bg-red-400/80"}`} />)}
            </div>
          </li>
        ))}
      </ul>
      <Foot>Each bar is one check: green passed, red failed, grey no data</Foot>
    </>
  );
}

function Funnel({ spec, ds }: { spec: Extract<GraphicSpec, { kind: "funnel" }>; ds: Dataset }) {
  const all = tested(ds);
  const cands = all.filter((c) => !c.inIndex);
  const gates = cands.filter((c) => c.model!.checks.filter((k) => k.kind === "gate").every((k) => k.pass !== false));
  const bar = cands.filter((c) => c.model!.recommendation === "pass");
  const add = cands.filter((c) => c.verdict === "add");
  const steps = [
    { label: "Candidates tested", sub: "Canadian companies not yet held", n: cands.length },
    { label: "Clear every must-pass check", sub: "a single failure here rules a company out", n: gates.length },
    { label: "Pass the bar", sub: "enough of the scored checks pass", n: bar.length },
    { label: "Recommended", sub: "verdict: Add", n: add.length },
  ];
  const max = Math.max(1, steps[0].n);
  return (
    <>
      <Head kicker="How the engine decides" title={spec.title ?? `From ${cands.length} candidates to ${add.length} picks`} />
      <ol className="space-y-2.5 px-6 pb-5">
        {steps.map((s, i) => (
          <li key={s.label} className="jarvis-in" style={{ animationDelay: `${i * 120}ms` }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-medium text-white/90">{s.label}</span>
              <span className="font-mono text-[18px] font-semibold tabular-nums text-white">{s.n}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`jarvis-bar h-full rounded-full ${i === steps.length - 1 ? "bg-signal shadow-[0_0_14px_rgba(61,220,108,0.7)]" : "bg-teal-300/50"}`} style={{ width: `${(s.n / max) * 100}%`, animationDelay: `${i * 120}ms` }} />
            </div>
            <div className="mt-0.5 text-[11px] text-white/45">{s.sub}</div>
          </li>
        ))}
      </ol>
    </>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-white/[0.06] px-6 py-2.5 text-[10.5px] text-white/40">{children}</div>;
}
