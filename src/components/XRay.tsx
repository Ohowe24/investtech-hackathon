"use client";

// X-RAY: the engine, re-run in the browser. Every figure on this page is recomputed by the
// engine's own code (engine/proof.ts calling engine/metrics.ts) from the yearly figures in
// data/companies.json, then compared with what the engine stored. A mismatch shows in red.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CheckResult, Company, Dataset, IndexSnapshot, MetricDef, Unit } from "@contract/types";
import { formatValue, recStyle, verdictStyle } from "@/lib/format";
import { getIndustry } from "../../engine/industries";
import { proveCompany, proveEngine, type CheckProof, type CompanyProof, type InputUnit, type Reproduction } from "../../engine/proof";
import { Decode, prefersReducedMotion } from "./live/motion";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  ticker: string | null;
  onPick: (ticker: string) => void;
  onOpen: (ticker: string) => void;
}

const PASS = "#3ddc6c";
const FAIL = "#ff6b5e";
const HOLD = "#e8b931";

const label = "font-mono text-[10px] uppercase tracking-[0.16em] text-white/45";
const recTone = (r: "pass" | "mixed" | "fail") => (r === "pass" ? PASS : r === "fail" ? FAIL : HOLD);

/** A gap to a pass line, in the metric's own terms: "13.6 pts" or "0.22×". */
function gapText(gap: number, unit: Unit): string {
  const a = Math.abs(gap);
  if (unit === "multiple") return `${a >= 0.05 ? a.toFixed(1) : a.toFixed(2)}×`;
  const pts = a * 100;
  return `${pts >= 0.05 ? pts.toFixed(1) : pts.toFixed(2)} pts`;
}

/** The value with two more decimals, for when rounding makes it look equal to the pass line. */
function precise(v: number, unit: Unit): string {
  return unit === "multiple" ? `${v.toFixed(2)}×` : `${(v * 100).toFixed(2)}%`;
}

function fmtInput(v: number | null, unit: InputUnit): string {
  if (v == null) return "—";
  if (unit === "money" || unit === "shares") return formatValue(v, "money");
  if (unit === "perShare") return v.toFixed(2);
  if (unit === "years") return String(v);
  return formatValue(v, unit);
}

const raw = (v: number | null) => (v == null ? "null" : Number(v.toPrecision(6)).toString());

export default function XRay({ dataset, snapshot, ticker, onPick, onOpen }: Props) {
  const tested = useMemo(() => dataset.companies.filter((c) => c.model).sort((a, b) => a.model!.rank - b.model!.rank), [dataset]);
  const engine = useMemo(() => proveEngine(dataset), [dataset]);
  const company = tested.find((c) => c.ticker === ticker)
    ?? tested.find((c) => !c.inIndex && c.verdict === "add")
    ?? tested[0];
  const index = snapshot.indexes.find((i) => i.name === dataset.indexName) ?? snapshot.indexes[0];
  const indexCountry = index?.positions.find((p) => p.ticker === company?.ticker)?.countryCode;
  const proof = useMemo(() => (company ? proveCompany(dataset, company, indexCountry) : null), [dataset, company, indexCountry]);

  if (!company || !proof) return null;
  return (
    <div className="space-y-5">
      <Hero dataset={dataset} engine={engine} tested={tested} current={company.ticker} onPick={onPick} />
      <Proof key={company.ticker} dataset={dataset} company={company} proof={proof} onOpen={onOpen} />
    </div>
  );
}

// ───────────── the engine as a whole ─────────────

function Film({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/70 text-white shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md ${className}`}>
      <div className="run-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative">{children}</div>
    </section>
  );
}

function Hero({ dataset, engine, tested, current, onPick }: {
  dataset: Dataset;
  engine: ReturnType<typeof proveEngine>;
  tested: Company[];
  current: string;
  onPick: (t: string) => void;
}) {
  const counters: [string, { matched: number; total: number }][] = [
    ["Metrics re-run", engine.metrics],
    ["Checks re-applied", engine.checks],
    ["Results re-tallied", engine.results],
    ["Rules match config", engine.rules],
  ];
  const all = counters.every(([, c]) => c.matched === c.total);
  const candidates = tested.filter((c) => !c.inIndex);
  const holdings = tested.filter((c) => c.inIndex);
  return (
    <Film className="scan-once">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(61,220,108,0.16),transparent_65%)] blur-2xl" />
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 md:px-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="logo-scan grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-ink">X</span>
            <span className={label}>X-ray · engine/proof.ts</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-[28px]">
            <Decode text="The engine, re-run in your browser" letters duration={900} />
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/60">
            Every figure below is recomputed by the engine&apos;s own code from the yearly figures it published, then compared with what it stored.
            Nothing is typed in. If a number didn&apos;t match, it would show in red.
          </p>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] ${all ? "border-signal/40 bg-signal/10 text-signal" : "border-[#ff6b5e]/40 bg-[#ff6b5e]/10 text-[#ff6b5e]"}`}>
          <span className="live-dot" style={all ? undefined : { background: FAIL }} />
          {all ? "All reproduced" : "Mismatch found"} · {engine.companies} companies
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px border-y border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
        {counters.map(([name, c], i) => {
          const ok = c.matched === c.total;
          return (
            <div key={name} className="bg-black/70 px-5 py-3">
              <div className={label}>{name}</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                <Decode text={`${c.matched}/${c.total}`} delay={200 + i * 120} duration={700} className="text-2xl font-semibold" />
                <span className="text-sm" style={{ color: ok ? PASS : FAIL }}>{ok ? "✓" : "✕"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2.5 px-5 py-4 md:px-6">
        <PickRow title="Candidates" list={candidates} current={current} onPick={onPick} big />
        <PickRow title="Index holdings" list={holdings} current={current} onPick={onPick} />
      </div>
      {dataset.isFake && <div className="bg-red-600 px-4 py-1 text-center text-xs font-semibold">FAKE SAMPLE DATA</div>}
    </Film>
  );
}

function PickRow({ title, list, current, onPick, big = false }: { title: string; list: Company[]; current: string; onPick: (t: string) => void; big?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${label} mr-2 w-28 shrink-0`}>{title}</span>
      {list.map((c) => {
        const on = c.ticker === current;
        return (
          <button key={c.ticker} type="button" onClick={() => onPick(c.ticker)} aria-pressed={on} title={c.name}
            className={`flex items-center gap-1.5 rounded-md border font-mono font-semibold transition-colors ${big ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]"} ${on ? "border-white bg-white text-ink" : "border-white/15 text-white/75 hover:border-white/40 hover:text-white"}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: recTone(c.model!.recommendation) }} />
            {c.ticker}
          </button>
        );
      })}
    </div>
  );
}

// ───────────── one company ─────────────

function Proof({ dataset, company: c, proof, onOpen }: { dataset: Dataset; company: Company; proof: CompanyProof; onOpen: (t: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const resultNode = useRef<HTMLDivElement>(null);
  const pathBox = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const targets = [
    ...proof.deciding.map((id) => ({ id, tone: FAIL })),
    ...proof.loadBearing.map((id) => ({ id, tone: HOLD })),
  ];
  const paths = useConnectors(wrap, resultNode, pathBox, cards, targets);
  const reps = proof.reproductions.filter((r) => r.method !== "none");

  return (
    <div ref={wrap} className="relative space-y-5">
      <div ref={pathBox}>
        <DecisionPath dataset={dataset} c={c} proof={proof} resultRef={resultNode} reproduced={reps.filter((r) => r.match).length} total={reps.length} onOpen={onOpen} />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-[13px] font-semibold text-white">The six checks, against their pass lines</h2>
          <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: FAIL }} /> decides the result</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: HOLD }} /> holds it up</span>
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {proof.checks.map((k, i) => (
            <CheckCard key={k.check.id} dataset={dataset} c={c} k={k} i={i}
              role={proof.deciding.includes(k.check.id) ? "deciding" : proof.loadBearing.includes(k.check.id) ? "holding" : null}
              cardRef={(el) => { if (el) cards.current.set(k.check.id, el); else cards.current.delete(k.check.id); }} />
          ))}
        </div>
      </div>

      <Rerun dataset={dataset} c={c} reps={proof.reproductions} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Safeguards proof={proof} />
        <Sources dataset={dataset} c={c} />
      </div>

      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" aria-hidden>
        {paths[0] && <circle cx={paths[0].start[0]} cy={paths[0].start[1]} r={4} fill="#000" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />}
        {paths.map((p) => (
          <g key={p.id}>
            <path d={p.d} fill="none" stroke={p.tone} strokeOpacity={0.18} strokeWidth={6} />
            <path d={p.d} fill="none" stroke={p.tone} strokeWidth={1.5} strokeDasharray="4 6" className="xray-flow" />
            <circle cx={p.end[0]} cy={p.end[1]} r={3.5} fill={p.tone} />
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Curved lines from below the result node to the check cards it depends on. Re-measured on resize. */
function useConnectors(
  wrap: React.RefObject<HTMLDivElement | null>,
  from: React.RefObject<HTMLDivElement | null>,
  below: React.RefObject<HTMLDivElement | null>,
  cards: React.RefObject<Map<string, HTMLElement>>,
  targets: { id: string; tone: string }[],
) {
  const [paths, setPaths] = useState<{ id: string; tone: string; d: string; start: [number, number]; end: [number, number] }[]>([]);
  const key = targets.map((t) => t.id).join(",");
  useLayoutEffect(() => {
    const measure = () => {
      const w = wrap.current?.getBoundingClientRect();
      const a = from.current?.getBoundingClientRect();
      const box = below.current?.getBoundingClientRect();
      if (!w || !a || !box) return;
      // Start at the bottom edge of the decision-path panel, under the result, so no text is crossed.
      const x1 = a.left + a.width / 2 - w.left;
      const y1 = box.bottom - w.top;
      setPaths(targets.flatMap((t) => {
        const b = cards.current?.get(t.id)?.getBoundingClientRect();
        if (!b) return [];
        const x2 = b.left + b.width / 2 - w.left;
        const y2 = b.top - w.top;
        const my = y1 + (y2 - y1) * 0.55;
        return [{ id: t.id, tone: t.tone, d: `M${x1},${y1} C${x1},${my} ${x2},${my - 10} ${x2},${y2}`, start: [x1, y1] as [number, number], end: [x2, y2] as [number, number] }];
      }));
    };
    measure();
    // Cards rise into place, so measure again once they have landed.
    const timers = [300, 900, 1600].map((ms) => setTimeout(measure, ms));
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    window.addEventListener("resize", measure);
    return () => { timers.forEach(clearTimeout); ro.disconnect(); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return paths;
}

function DecisionPath({ dataset, c, proof, resultRef, reproduced, total, onOpen }: {
  dataset: Dataset;
  c: Company;
  proof: CompanyProof;
  resultRef: React.RefObject<HTMLDivElement | null>;
  reproduced: number;
  total: number;
  onOpen: (t: string) => void;
}) {
  const years = (c.history ?? []).map((h) => h.fiscalYear).sort((a, b) => a - b);
  const filings = new Set([...(c.history ?? []).flatMap((h) => h.sourceIds), ...Object.values(c.metrics).flatMap((m) => m.sourceIds)].filter((id) => dataset.sources.some((s) => s.id === id)));
  const gates = proof.checks.filter((k) => k.check.kind === "gate");
  const gatesOk = gates.filter((k) => k.check.pass === true).length;
  const rec = proof.result.rerun;
  const v = proof.verdict;
  const { scoring } = getIndustry(dataset.industryId);
  const share = proof.result.available ? proof.result.passed / proof.result.available : 0;
  const scoredTone = share >= scoring.passShare ? PASS : share < scoring.mixedShare ? FAIL : HOLD;
  const nodes: { key: string; title: string; main: ReactNode; sub: ReactNode; tone: string; ok: boolean; ref?: React.RefObject<HTMLDivElement | null> }[] = [
    { key: "in", title: "Filings", main: `${years.length} years`, sub: years.length ? `FY${years[0]}–FY${years[years.length - 1]} · ${filings.size} sources` : "no history", tone: "#fff", ok: true },
    { key: "m", title: "Metrics", main: `${reproduced}/${total}`, sub: "re-run from yearly figures", tone: reproduced === total ? PASS : FAIL, ok: reproduced === total },
    { key: "g", title: "Must-pass", main: `${gatesOk}/${gates.length}`, sub: gatesOk === gates.length ? "both pass" : gates.filter((k) => k.check.pass === false).map((k) => k.check.label).join("; "), tone: gatesOk === gates.length ? PASS : FAIL, ok: gatesOk === gates.length },
    { key: "s", title: "Scored", main: `${proof.result.passed}/${proof.result.available}`, sub: `pass needs ${scoring.passShare * 100}% with ${scoring.minAvailable}+ known`, tone: scoredTone, ok: true },
    { key: "r", title: "Result", main: recStyle[rec].label, sub: proof.result.match ? "re-tallied ✓" : "differs from stored ✕", tone: recTone(rec), ok: proof.result.match, ref: resultRef },
    {
      key: "v", title: "Verdict",
      main: c.inIndex ? "Held" : verdictStyle[v.stored].label,
      sub: c.inIndex ? "already in the index" : v.source === "human" ? "set by a person" : "from the result ✓",
      tone: c.inIndex ? "#fff" : v.stored === "add" ? PASS : v.stored === "reject" ? FAIL : HOLD, ok: v.match,
    },
  ];

  return (
    <Film>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <span className="logo-scan grid h-10 w-14 place-items-center rounded-lg bg-white font-mono text-[12px] font-semibold text-ink">{c.ticker}</span>
          <div>
            <div className="text-[17px] font-semibold tracking-tight"><Decode text={c.name} letters duration={600} /></div>
            <div className="text-[12px] text-white/50">{[c.subSector, `HQ ${c.hqCountry}`, c.inIndex ? "Index holding" : "Candidate", c.model ? `Rank ${c.model.rank} of ${dataset.companies.filter((x) => x.model).length}` : null].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <button type="button" onClick={() => onOpen(c.ticker)} className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white">
          Company page →
        </button>
      </div>

      <div className="px-5 py-5 md:px-6">
        <div className={label}>Decision path</div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0">
          {nodes.map((n, i) => (
            <li key={n.key} className="a-rise relative flex lg:items-center" style={{ animationDelay: `${150 + i * 140}ms` }}>
              <div ref={n.ref} className="relative z-[1] min-w-0 flex-1 rounded-lg border bg-black/60 px-3 py-2.5"
                style={{ borderColor: `color-mix(in srgb, ${n.tone} 45%, transparent)`, boxShadow: n.key === "r" ? `0 0 24px -6px ${n.tone}` : undefined }}>
                <div className="flex items-center justify-between gap-2">
                  <span className={label}>{n.title}</span>
                  <span className="text-[11px]" style={{ color: n.ok ? PASS : FAIL }}>{n.ok ? "✓" : "✕"}</span>
                </div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums" style={{ color: n.tone }}>{n.main}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/50" title={typeof n.sub === "string" ? n.sub : undefined}>{n.sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <svg className="hidden h-3 w-5 shrink-0 lg:block" viewBox="0 0 20 12" aria-hidden>
                  <path d="M0 6 H16" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="3 3" className="xray-flow" />
                  <path d="M13 2 L18 6 L13 10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
                </svg>
              )}
            </li>
          ))}
        </ol>
        <Verdict c={c} proof={proof} />
      </div>
    </Film>
  );
}

/** One plain sentence on what the result rests on, from flipping each check in turn through tally(). */
function Verdict({ c, proof }: { c: Company; proof: CompanyProof }) {
  const byId = (id: string) => proof.checks.find((k) => k.check.id === id)!;
  const recName = (r: string | null) => (r ? recStyle[r as "pass" | "mixed" | "fail"].label : "");
  const rec = proof.result.rerun;
  const scoredHolding = proof.loadBearing.filter((id) => byId(id).check.kind === "score");
  let text: ReactNode;
  if (proof.deciding.length === 1) {
    const k = byId(proof.deciding[0]);
    text = <>One check decides this result: <b className="text-white">{k.check.label}</b>. If that one check passed, {c.ticker} would get <b style={{ color: recTone(k.flipsTo!) }}>{recName(k.flipsTo)}</b>.</>;
  } else if (proof.deciding.length > 1) {
    text = <>{proof.deciding.length} checks each decide this result: if any one of {proof.deciding.map((id) => byId(id).check.label).join(" or ")} passed, {c.ticker} would get <b style={{ color: recTone(byId(proof.deciding[0]).flipsTo!) }}>{recName(byId(proof.deciding[0]).flipsTo)}</b>.</>;
  } else if (rec !== "pass") {
    text = <>No single check decides it: even if any one failed check passed, {c.ticker} would still get <b style={{ color: recTone(rec) }}>{recName(rec)}</b>.</>;
  } else if (scoredHolding.length === 0) {
    text = <>A robust pass. Only the must-pass checks hold this result up: any one scored check could fail and {c.ticker} would still pass.</>;
  } else {
    text = <>A pass at the minimum. If any one of {scoredHolding.map((id) => byId(id).check.label).join(", ")} failed, {c.ticker} would drop to <b style={{ color: HOLD }}>{recName(byId(scoredHolding[0]).flipsTo)}</b>.</>;
  }
  return (
    <div className="a-rise mt-4 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-white/75" style={{ animationDelay: "1000ms" }}>
      <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal">What it rests on</span>
      <p className="min-w-0 flex-1">{text}</p>
    </div>
  );
}

// ───────────── checks ─────────────

function CheckCard({ dataset, c, k, i, role, cardRef }: {
  dataset: Dataset;
  c: Company;
  k: CheckProof;
  i: number;
  role: "deciding" | "holding" | null;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const def = dataset.metricDefs.find((d) => d.id === k.check.metricId);
  const unit = def?.unit ?? "pct";
  const pass = k.check.pass;
  const tone = pass === null ? "rgba(255,255,255,0.4)" : pass ? PASS : FAIL;
  const roleTone = role === "deciding" ? FAIL : role === "holding" ? HOLD : null;
  const hidden = k.value != null && k.check.threshold != null && formatValue(k.value, unit) === formatValue(k.check.threshold, unit);
  return (
    <section ref={cardRef} className="a-rise relative flex flex-col overflow-hidden rounded-xl border bg-black/70 text-white backdrop-blur-md"
      style={{ animationDelay: `${300 + i * 90}ms`, borderColor: roleTone ? `color-mix(in srgb, ${roleTone} 55%, transparent)` : "rgba(255,255,255,0.1)", boxShadow: roleTone ? `0 0 30px -12px ${roleTone}` : undefined }}>
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${k.check.kind === "gate" ? "bg-white/10 text-white/70" : "bg-white/[0.05] text-white/50"}`}>
          {k.check.kind === "gate" ? "Must pass" : "Scored"}
        </span>
        {roleTone && (
          <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider" style={{ color: roleTone, background: `color-mix(in srgb, ${roleTone} 14%, transparent)` }}>
            {role === "deciding" ? "Decides the result" : "Holds it up"}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] font-semibold" style={{ color: tone }}>{pass === null ? "NO DATA" : pass ? "PASS" : "FAIL"}</span>
      </div>
      <h3 className="px-4 pt-2 text-[14px] font-semibold leading-snug">{k.check.label}</h3>

      <div className="px-4 pt-4">
        <Gauge dataset={dataset} c={c} metricId={k.check.metricId} value={k.value} threshold={k.check.threshold ?? 0} op={k.check.op ?? ">="} target={k.check.target ?? ""} unit={unit} tone={tone} />
      </div>

      <div className="px-4 pt-3 text-[12px] leading-snug">
        {k.headroom == null ? (
          <span className="text-white/55">{c.metrics[k.check.metricId]?.note ?? "No data"}. Not counted as a fail.</span>
        ) : k.headroom >= 0 ? (
          <span className="text-white/70">Clears the line by <b style={{ color: PASS }}>{gapText(k.headroom, unit)}</b></span>
        ) : (
          <span className="text-white/70">Misses the line by <b style={{ color: FAIL }}>{gapText(k.headroom, unit)}</b></span>
        )}
        {hidden && k.value != null && <span className="mt-1 block text-[11px] text-white/45">Shown as {formatValue(k.value, unit)}; unrounded it is {precise(k.value, unit)}.</span>}
      </div>

      <div className="mt-auto">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="mt-3 flex w-full items-center justify-between border-t border-white/10 px-4 py-2 text-left text-[11px] text-white/55 transition-colors hover:text-white">
          Why this line? <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </button>
        {open && def && <WhyLine def={def} check={k.check} />}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-4 py-2 font-mono text-[10px] text-white/45">
          <span className="truncate">passes({raw(k.value)}, &quot;{k.check.op}&quot;, {k.check.threshold}) → {String(k.rerun)}</span>
          <span style={{ color: k.match && k.ruleMatch ? PASS : FAIL }}>{k.match && k.ruleMatch ? "✓ matches" : "✕ differs"}</span>
        </div>
      </div>
    </section>
  );
}

function WhyLine({ def, check }: { def: MetricDef; check: CheckResult }) {
  return (
    <div className="space-y-2 px-4 pb-3 text-[12px] leading-relaxed text-white/70">
      <p className="text-white/50">{check.rule}.</p>
      {def.why && <p>{def.why}</p>}
      {def.facts && (
        <ul className="space-y-1 border-l border-signal/40 pl-3 text-[11px] text-white/60">
          {def.facts.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </div>
  );
}

/** The pass line, every tested company as a tick, and this company as the bright dot. */
function Gauge({ dataset, c, metricId, value, threshold, op, target, unit, tone }: {
  dataset: Dataset;
  c: Company;
  metricId: string;
  value: number | null;
  threshold: number;
  op: ">=" | "<=";
  target: string;
  unit: Unit;
  tone: string;
}) {
  const others = dataset.companies.filter((x) => x.model && x.ticker !== c.ticker && x.metrics[metricId]?.value != null)
    .map((x) => ({ t: x.ticker, v: x.metrics[metricId].value as number }));
  const sorted = others.map((o) => o.v).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] ?? threshold;
  // A window, not data: the middle of the field plus the line and this company; outliers pin to the edge.
  let lo = Math.min(q(0.1), threshold, value ?? threshold);
  let hi = Math.max(q(0.9), threshold, value ?? threshold);
  const pad = (hi - lo) * 0.14 || Math.abs(threshold) * 0.5 || 0.1;
  lo -= pad;
  hi += pad;
  const x = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const tx = x(threshold);
  return (
    <div className="relative h-14 select-none">
      <div className="absolute inset-x-0 top-7 h-px bg-white/15" />
      <div className="absolute top-[22px] h-[11px] rounded-sm bg-signal/[0.12]" style={op === ">=" ? { left: `${tx}%`, right: 0 } : { left: 0, width: `${tx}%` }} />
      <div className="absolute top-3 h-8 w-px bg-white/60" style={{ left: `${tx}%` }} />
      <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-white/70" style={{ left: `${tx}%` }}>{target}</div>
      {others.map((o) => {
        const pinned = o.v < lo || o.v > hi;
        return (
          <span key={o.t} title={`${o.t} · ${formatValue(o.v, unit)}`}
            className={`absolute top-[24px] w-px ${pinned ? "h-[7px] bg-white/45" : "h-[7px] bg-white/25"}`} style={{ left: `${x(o.v)}%` }} />
        );
      })}
      {value != null && (
        <div className="xray-dot absolute top-7 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x(value)}%` }}>
          <span className="block h-3 w-3 rounded-full ring-2 ring-black" style={{ background: tone, boxShadow: `0 0 12px ${tone}` }} />
          <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-semibold" style={{ color: tone }}>
            {c.ticker} {formatValue(value, unit)}
          </span>
        </div>
      )}
    </div>
  );
}

// ───────────── re-run the math ─────────────

function Rerun({ dataset, c, reps }: { dataset: Dataset; c: Company; reps: Reproduction[] }) {
  const shown = reps.filter((r) => r.method !== "none" || r.stored != null);
  const [done, setDone] = useState(0);
  const [runs, setRuns] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setDone(shown.length));
      return () => cancelAnimationFrame(id);
    }
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setDone(n);
      if (n >= shown.length) clearInterval(id);
    }, 260);
    return () => clearInterval(id);
  }, [runs, shown.length]);
  const matched = shown.filter((r) => r.match).length;
  return (
    <Film>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 md:px-6">
        <div>
          <h2 className="text-[13px] font-semibold">Re-run the math</h2>
          <p className="mt-0.5 text-[12px] text-white/50">Each metric recomputed with the engine&apos;s function from engine/metrics.ts, on the yearly figures for {c.ticker}.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tabular-nums text-white/70">
            {Math.min(done, shown.length)}/{shown.length} run · <span style={{ color: matched === shown.length ? PASS : FAIL }}>{matched} match</span>
          </span>
          <button type="button" onClick={() => { setDone(0); setRuns((r) => r + 1); }}
            className="group flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-medium text-white/80 transition-colors hover:border-signal/60 hover:text-white">
            <span className="inline-block transition-transform duration-500 group-hover:rotate-180">⟳</span> Re-run
          </button>
        </div>
      </div>
      <div className="grid gap-px bg-white/10 lg:grid-cols-2">
        {shown.map((r, i) => (
          <RerunCard key={`${r.metricId}-${runs}`} dataset={dataset} c={c} r={r} state={i < done ? "done" : i === done ? "running" : "queued"} />
        ))}
        {shown.length % 2 === 1 && <div className="hidden bg-black/70 lg:block" />}
      </div>
    </Film>
  );
}

function RerunCard({ dataset, c, r, state }: { dataset: Dataset; c: Company; r: Reproduction; state: "queued" | "running" | "done" }) {
  const def = dataset.metricDefs.find((d) => d.id === r.metricId);
  const unit = def?.unit ?? "pct";
  const live = state === "done";
  return (
    <div className={`relative bg-black/70 px-5 py-4 transition-opacity duration-300 ${state === "queued" ? "opacity-40" : "opacity-100"}`}>
      {state === "running" && <div className="xray-scan pointer-events-none absolute inset-0" />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{def?.label ?? r.metricId}</div>
          <code className="mt-0.5 block truncate font-mono text-[10px] text-white/45" title={r.fn}>{r.fn}</code>
        </div>
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: !live ? "rgba(255,255,255,0.4)" : r.match ? PASS : FAIL }}>
          {state === "queued" ? "queued" : state === "running" ? "running…" : r.match ? "✓ match" : "✕ differs"}
        </span>
      </div>

      {r.method === "computed" && r.years.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="text-white/35">
                <th className="py-1 pr-2 text-left font-normal" />
                {r.years.map((y) => <th key={y} className="px-1.5 py-1 text-right font-normal">FY{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.inputs.map((s) => (
                <tr key={s.label} className="border-t border-white/[0.06]">
                  <td className="whitespace-nowrap py-1 pr-2 font-sans text-white/55">{s.label}</td>
                  {s.values.map((v, j) => <td key={j} className={`px-1.5 py-1 text-right ${v == null ? "text-white/20" : "text-white/85"}`}>{v == null ? "·" : fmtInput(v, s.unit)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-right text-[10px] text-white/30">{c.reportingCurrency}</div>
        </div>
      )}

      {r.method === "quoted" && r.quote && (
        <blockquote className="mt-3 rounded-md border-l-2 border-signal/50 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-white/75">“{r.quote}”</blockquote>
      )}

      {r.steps.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {r.steps.map((s) => (
            <div key={s.label} className="flex justify-between gap-3 text-[11px]">
              <span className="text-white/50">{s.label}</span>
              <span className="font-mono tabular-nums text-white/80">{fmtInput(s.value, s.unit)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/10 pt-2.5">
        <div>
          <div className={label}>Re-run</div>
          <div className="font-mono text-lg font-semibold tabular-nums" style={{ color: live ? (r.match ? PASS : FAIL) : "rgba(255,255,255,0.5)" }}>
            {live ? <Decode text={formatValue(r.value, unit)} duration={500} /> : "···"}
          </div>
        </div>
        <div className="text-right">
          <div className={label}>Stored by the engine</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-white/85">{formatValue(r.stored, unit)}</div>
        </div>
      </div>
      {live && <div className="mt-1 text-right font-mono text-[10px] text-white/30">{raw(r.value)} = {raw(r.stored)}</div>}
    </div>
  );
}

// ───────────── safeguards and sources ─────────────

function Safeguards({ proof }: { proof: CompanyProof }) {
  return (
    <Film>
      <div className="border-b border-white/10 px-5 py-3.5 md:px-6">
        <h2 className="text-[13px] font-semibold">Safeguards at work</h2>
        <p className="mt-0.5 text-[12px] text-white/50">Rules built into the engine that apply to this company.</p>
      </div>
      <ul className="divide-y divide-white/10">
        {proof.safeguards.map((s, i) => (
          <li key={s.id} className="a-rise flex gap-3 px-5 py-3 md:px-6" style={{ animationDelay: `${200 + i * 100}ms` }}>
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-signal/15 text-[11px] text-signal">◆</span>
            <div>
              <div className="text-[13px] font-medium">{s.title}</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/60">{s.detail}</p>
            </div>
          </li>
        ))}
        {proof.safeguards.length === 0 && <li className="px-5 py-3 text-[12px] text-white/50">None needed for this company.</li>}
      </ul>
    </Film>
  );
}

function Sources({ dataset, c }: { dataset: Dataset; c: Company }) {
  const ids = [...new Set([...Object.values(c.metrics).flatMap((m) => m.sourceIds), ...(c.history ?? []).flatMap((h) => h.sourceIds)])];
  const list = ids.map((id) => dataset.sources.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s).sort((a, b) => a.label.localeCompare(b.label));
  const quotes = (c.deals ?? []).reduce((n, d) => n + d.quotes.length, 0);
  return (
    <Film>
      <div className="border-b border-white/10 px-5 py-3.5 md:px-6">
        <h2 className="text-[13px] font-semibold">Where the inputs come from</h2>
        <p className="mt-0.5 text-[12px] text-white/50">
          {list.length} sources behind {c.ticker}&apos;s figures{c.deals?.length ? `, plus ${c.deals.length} deal records with ${quotes} filing quotes` : ""}.
        </p>
      </div>
      <ul className="max-h-[340px] divide-y divide-white/10 overflow-y-auto">
        {list.map((s) => (
          <li key={s.id} className="px-5 py-2.5 md:px-6">
            <div className="flex items-center gap-2 font-mono text-[11px] text-white/75">
              <span className="text-signal">{s.quote ? "❝" : "▸"}</span> {s.label}
            </div>
            {s.quote && <p className="mt-1 pl-5 text-[12px] leading-relaxed text-white/55">“{s.quote}”</p>}
          </li>
        ))}
      </ul>
    </Film>
  );
}
