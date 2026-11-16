"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IndustryOption, TickerInfo } from "@/lib/catalog";
import { fromSearch, normalizeTicker, parseHoldingsText, resolveWeights, toSearch, type HoldingEntry } from "@/lib/query";
import { Decode } from "../live/motion";

interface Props {
  catalog: IndustryOption[];
  /** every company the engine has statements for: holding suggestions for "choose your own" industries */
  market: TickerInfo[];
}

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Industry" },
  { n: 2, label: "Your holdings" },
  { n: 3, label: "Run" },
];

/** Three steps: pick the index's industry, enter what it holds, run the engine. The answer goes into the address of /analyze. */
export default function Onboarding({ catalog, market }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingEntry[]>([]);
  const [cashText, setCashText] = useState("");
  const [valueText, setValueText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The scramble effect uses random letters, so it starts only in the browser; the server renders plain text.
  const [mounted, setMounted] = useState(false);
  const industry = catalog.find((c) => c.id === industryId) ?? null;

  // Coming back from a result ("Edit holdings"): the address carries the last query.
  useEffect(() => {
    const restore = () => {
      setMounted(true);
      const q = fromSearch(Object.fromEntries(new URLSearchParams(window.location.search)));
      if (!q || !catalog.some((c) => c.id === q.industry)) return;
      setIndustryId(q.industry);
      setHoldings(q.holdings);
      if (q.cashPct != null) setCashText(String(q.cashPct));
      if (q.value != null) setValueText(String(q.value));
      setStep(2);
    };
    restore();
  }, [catalog]);

  const pickIndustry = (id: string) => {
    if (id !== industryId) {
      const next = catalog.find((c) => c.id === id)!;
      setHoldings([]);
      setCashText(String(next.defaultCashPct));
      setValueText(next.organizers ? String(next.organizers.totalValue) : "");
    }
    setIndustryId(id);
    setStep(2);
  };

  const cashPct = Number(cashText);
  const resolved = industry ? resolveWeights(holdings, Number.isFinite(cashPct) && cashText !== "" ? cashPct : industry.defaultCashPct) : null;
  const value = valueText === "" ? undefined : Number(valueText);
  const canRun = !!industry && !!resolved?.ok && (value == null || (Number.isFinite(value) && value > 0));

  const submit = () => {
    if (!industry || !canRun || submitting) return;
    setSubmitting(true);
    try { window.sessionStorage.setItem("engine-run", "1"); } catch {}
    const allTyped = holdings.every((h) => h.weightPct != null);
    router.push(`/analyze?${toSearch({ industry: industry.id, holdings, cashPct: allTyped ? undefined : cashPct, value })}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 md:px-8 md:pt-14">
      <div className="a-fade">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
          <span className="live-dot" /> Index completer
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {mounted ? <Decode text="Find the Canadian companies your index is missing." letters duration={900} /> : "Find the Canadian companies your index is missing."}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/65">
          Pick your index&apos;s industry, tell us what it holds, and the engine tests every Canadian candidate on that industry&apos;s
          declared checks, ranks them, and ranks your current holdings the same way. Every number is from filings.
        </p>
      </div>

      <ol className="mt-8 flex items-center gap-2 text-[12px]" aria-label="Steps">
        {STEPS.map((s, i) => {
          const done = s.n < step;
          const on = s.n === step;
          const reachable = s.n === 1 || (s.n === 2 && !!industry) || (s.n === 3 && canRun);
          return (
            <li key={s.n} className="flex items-center gap-2">
              {i > 0 && <span className={`h-px w-3 sm:w-6 md:w-10 ${done || on ? "bg-white/50" : "bg-white/15"}`} />}
              <button type="button" disabled={!reachable} onClick={() => setStep(s.n)} aria-current={on ? "step" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-medium transition-colors disabled:cursor-not-allowed ${on ? "border-white bg-white text-ink" : done ? "border-white/30 text-white hover:border-white/60" : "border-white/15 text-white/45"}`}>
                <span className={`grid h-4 w-4 place-items-center rounded-full font-mono text-[10px] ${on ? "bg-ink text-white" : done ? "bg-signal text-ink" : "bg-white/10 text-white/60"}`}>
                  {done ? "✓" : s.n}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        {step === 1 && <IndustryStep catalog={catalog} picked={industryId} onPick={pickIndustry} />}
        {step === 2 && industry && (
          <HoldingsStep industry={industry} market={market} holdings={holdings} setHoldings={setHoldings}
            cashText={cashText} setCashText={setCashText} valueText={valueText} setValueText={setValueText}
            resolved={resolved} canNext={canRun} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        )}
        {step === 3 && industry && resolved?.ok && (
          <ReviewStep industry={industry} holdings={holdings} rule={resolved.rule} cashPct={resolved.cashPct}
            submitting={submitting} onBack={() => setStep(2)} onRun={submit} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Step 1

function IndustryStep({ catalog, picked, onPick }: { catalog: IndustryOption[]; picked: string | null; onPick: (id: string) => void }) {
  const fixed = catalog.filter((c) => !c.custom);
  const custom = catalog.filter((c) => c.custom);
  return (
    <section aria-labelledby="industry-h">
      <h2 id="industry-h" className="text-[13px] font-medium uppercase tracking-wide text-white/60">Which industry is your index?</h2>
      <div className="stagger mt-3 grid gap-3 sm:grid-cols-2" style={{ ["--d" as string]: "120ms" }}>
        {fixed.map((ind, i) => {
          const on = picked === ind.id;
          const withData = ind.universe.filter((u) => u.hasData).length;
          return (
            <button key={ind.id} type="button" onClick={() => onPick(ind.id)} aria-pressed={on} style={{ ["--i" as string]: i }}
              className={`spot group flex flex-col rounded-xl border bg-white p-5 text-left transition-all hover:-translate-y-0.5 ${on ? "border-ink shadow-[0_0_0_1px_#000]" : "border-line hover:border-faint"}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-lg font-semibold tracking-tight text-ink">{ind.name}</span>
                <span className="mt-1 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink">→</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{ind.tagline}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {ind.checks.map((k) => (
                  <span key={k.id} className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${k.kind === "gate" ? "bg-ink text-white" : "bg-soft text-ink"}`} title={k.rule}>
                    {k.label}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-line pt-3 font-mono text-[11px] tabular-nums text-muted [margin-top:1rem]">
                <span><span className="text-sm font-semibold text-ink">{ind.universe.length}</span> Canadian candidates</span>
                <span><span className="text-sm font-semibold text-ink">{withData}</span> with data</span>
                <span><span className="text-sm font-semibold text-ink">{ind.checks.length}</span> checks</span>
              </div>
            </button>
          );
        })}
        {custom.length > 0 && <ChooseYourOwn options={custom} picked={picked} onPick={onPick} index={fixed.length} />}
      </div>
      <p className="mt-4 text-xs text-white/45">
        Dark tags must pass; the others are scored. The two researched industries use checks built for them; any other industry is
        judged against its own peers.
      </p>
    </section>
  );
}

/** Any industry in the Canadian market map: pick it from a list, and the engine finds its Canadian companies itself. */
function ChooseYourOwn({ options, picked, onPick, index }: { options: IndustryOption[]; picked: string | null; onPick: (id: string) => void; index: number }) {
  const current = options.find((o) => o.id === picked) ?? null;
  const [choice, setChoice] = useState(current?.id ?? "");
  const shown = options.find((o) => o.id === choice) ?? null;
  const sectors = useMemo(() => {
    const m = new Map<string, IndustryOption[]>();
    for (const o of options) m.set(o.custom!.sector, [...(m.get(o.custom!.sector) ?? []), o]);
    return [...m.entries()];
  }, [options]);
  const companies = options.reduce((n, o) => n + o.custom!.count, 0);
  return (
    <div style={{ ["--i" as string]: index }}
      className={`spot flex flex-col rounded-xl border bg-white p-5 text-left sm:col-span-2 ${current ? "border-ink shadow-[0_0_0_1px_#000]" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-lg font-semibold tracking-tight text-ink">Choose your own</span>
        <span className="mt-1 rounded bg-tealsoft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-teal">Finds candidates</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Any of {options.length} industries across {companies} Canadian companies. The engine finds the Canadian companies in it, measures each on
        its statements, and ranks them against each other and your holdings: every check is &ldquo;better than the median company tested&rdquo;.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="custom-industry" className="sr-only">Industry</label>
        <select id="custom-industry" value={choice} onChange={(e) => setChoice(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-ink focus:bg-white">
          <option value="">Pick an industry…</option>
          {sectors.map(([sector, list]) => (
            <optgroup key={sector} label={sector}>
              {list.map((o) => (
                <option key={o.id} value={o.id}>{o.name} · {o.custom!.count} Canadian</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" disabled={!choice} onClick={() => onPick(choice)}
          className="h-11 shrink-0 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-30">
          Use this industry →
        </button>
      </div>
      {shown && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap gap-1.5">
            {shown.checks.map((k) => (
              <span key={k.id} className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${k.kind === "gate" ? "bg-ink text-white" : "bg-soft text-ink"}`} title={k.rule}>
                {k.label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {shown.universe.slice(0, 18).map((u) => (
              <span key={u.ticker} title={u.name} className="rounded-md bg-tealsoft px-2 py-0.5 font-mono text-[11px] font-semibold text-teal">{u.ticker}</span>
            ))}
            {shown.universe.length > 18 && <span className="px-1 py-0.5 text-[11px] text-muted">+{shown.universe.length - 18} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Step 2

interface HoldingsProps {
  industry: IndustryOption;
  market: TickerInfo[];
  holdings: HoldingEntry[];
  setHoldings: (h: HoldingEntry[] | ((h: HoldingEntry[]) => HoldingEntry[])) => void;
  cashText: string;
  setCashText: (s: string) => void;
  valueText: string;
  setValueText: (s: string) => void;
  resolved: ReturnType<typeof resolveWeights> | null;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
}

function HoldingsStep({ industry, market, holdings, setHoldings, cashText, setCashText, valueText, setValueText, resolved, canNext, onBack, onNext }: HoldingsProps) {
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = useMemo(() => {
    const m = new Map<string, TickerInfo>();
    if (industry.custom) for (const t of market) m.set(t.ticker, t);
    for (const t of industry.known) m.set(t.ticker, t);
    for (const h of industry.organizers?.holdings ?? []) m.set(h.ticker, h);
    for (const u of industry.universe) m.set(u.ticker, u);
    return m;
  }, [industry, market]);
  const candidateSet = useMemo(() => new Set(industry.universe.map((u) => u.ticker)), [industry]);

  const held = new Set(holdings.map((h) => h.ticker));
  const q = text.trim().toUpperCase();
  const suggestions = q && !/[,;\n]/.test(text)
    ? [...lookup.values()]
        .filter((t) => !held.has(t.ticker) && (t.ticker.startsWith(normalizeTicker(q) || q) || t.name.toUpperCase().includes(q)))
        .sort((a, b) => Number(b.ticker.startsWith(q)) - Number(a.ticker.startsWith(q)) || a.ticker.localeCompare(b.ticker))
        .slice(0, 6)
    : [];

  const addText = (raw: string) => {
    const { entries, rejected: bad } = parseHoldingsText(raw);
    setHoldings((prev) => {
      const out = [...prev];
      for (const e of entries) {
        const i = out.findIndex((x) => x.ticker === e.ticker);
        if (i >= 0) out[i] = e.weightPct != null ? e : out[i];
        else out.push(e);
      }
      return out;
    });
    setRejected(bad);
    setText("");
    setActive(0);
  };

  const loadOrganizers = () => {
    if (!industry.organizers) return;
    setHoldings(industry.organizers.holdings.map((h) => ({ ticker: h.ticker, weightPct: h.weightPct })));
    setCashText(String(industry.organizers.cashPct));
    setValueText(String(industry.organizers.totalValue));
    setRejected([]);
  };

  const setWeight = (ticker: string, raw: string) => {
    const v = raw.trim() === "" ? undefined : Number(raw);
    setHoldings((prev) => prev.map((h) => (h.ticker === ticker ? (v == null || !Number.isFinite(v) ? { ticker } : { ticker, weightPct: v }) : h)));
  };

  const typedCount = holdings.filter((h) => h.weightPct != null).length;
  const allTyped = holdings.length > 0 && typedCount === holdings.length;
  const typedSum = holdings.reduce((s, h) => s + (h.weightPct ?? 0), 0);
  const heldCandidates = holdings.filter((h) => candidateSet.has(h.ticker));
  const noData = holdings.filter((h) => !lookup.get(h.ticker)?.hasData);
  const currency = industry.organizers?.currency ?? "USD";

  return (
    <section aria-labelledby="holdings-h" className="a-rise rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="holdings-h" className="text-[13px] font-semibold text-ink">What does your {industry.name} index hold today?</h2>
        <div className="flex items-center gap-2">
          {industry.organizers && (
            <button type="button" onClick={loadOrganizers}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink">
              Load the organizers&apos; index ({industry.organizers.holdings.length})
            </button>
          )}
          {holdings.length > 0 && (
            <button type="button" onClick={() => { setHoldings([]); setRejected([]); }} className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        <form onSubmit={(e) => { e.preventDefault(); if (suggestions[active] && !/\d/.test(text)) addText(suggestions[active].ticker); else if (text.trim()) addText(text); }}
          className="relative">
          <label htmlFor="ticker-input" className="sr-only">Add holdings</label>
          <div className="flex gap-2">
            <input id="ticker-input" ref={inputRef} value={text} autoComplete="off" spellCheck={false}
              onChange={(e) => { setText(e.target.value); setActive(0); }}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (/[,;\n\t]/.test(t)) { e.preventDefault(); addText(t); }
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Backspace" && text === "" && holdings.length) setHoldings((p) => p.slice(0, -1));
              }}
              placeholder="Type a ticker, or paste a list: EGP 10.76, O, PLD…"
              role="combobox" aria-expanded={suggestions.length > 0} aria-controls="ticker-suggestions" aria-autocomplete="list"
              className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 font-mono text-sm text-ink outline-none transition-colors placeholder:font-sans placeholder:text-faint focus:border-ink focus:bg-white" />
            <button type="submit" disabled={!text.trim()}
              className="h-11 shrink-0 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-30">
              Add
            </button>
          </div>
          {suggestions.length > 0 && (
            <ul id="ticker-suggestions" role="listbox" className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-lg border border-line bg-white shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)]">
              {suggestions.map((s, i) => (
                <li key={s.ticker} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { addText(s.ticker); inputRef.current?.focus(); }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === active ? "bg-soft" : ""}`}>
                    <span className="w-16 shrink-0 font-mono text-xs font-semibold text-ink">{s.ticker}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                    <DataBadge has={s.hasData} />
                    {candidateSet.has(s.ticker) && <span className="rounded bg-tealsoft px-1.5 py-0.5 text-[10px] font-medium text-teal">Canadian candidate</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        {rejected.length > 0 && (
          <p className="mt-2 text-xs text-bad">Could not read as a ticker: {rejected.map((r) => `"${r}"`).join(", ")}</p>
        )}

        {holdings.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            No holdings yet. Type tickers above{industry.organizers ? ", or load the organizers' live index to start from theirs" : ""}.
            <div className="mt-1 text-xs text-faint">Weights are optional: leave them blank for an equal-weight index.</div>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line bg-canvas px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-faint">
              <span>Holding · {holdings.length}</span>
              <span className="w-16 text-right sm:w-24">Weight %</span>
              <span className="w-6" />
            </div>
            <ul className="max-h-[360px] overflow-y-auto">
              {holdings.map((h) => {
                const info = lookup.get(h.ticker);
                return (
                  <li key={h.ticker} className="a-fade grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-7 min-w-12 shrink-0 place-items-center rounded-md bg-soft px-1.5 font-mono text-[11px] font-semibold text-ink sm:min-w-14">{h.ticker}</span>
                      <span className="min-w-0 truncate text-sm text-ink">{info?.name ?? <span className="text-faint">Unknown to the engine</span>}</span>
                      <DataBadge has={!!info?.hasData} />
                    </div>
                    <input aria-label={`Weight of ${h.ticker} in percent`} inputMode="decimal" placeholder={!allTyped && resolved?.ok ? resolved.weights[h.ticker]?.toFixed(2) : "auto"}
                      defaultValue={h.weightPct ?? ""} key={`${h.ticker}:${h.weightPct ?? ""}`}
                      onBlur={(e) => setWeight(h.ticker, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="h-8 w-16 rounded-md border border-line bg-white px-2 text-right sm:w-24 font-mono text-sm tabular-nums text-ink outline-none placeholder:text-faint focus:border-ink" />
                    <button type="button" onClick={() => setHoldings((p) => p.filter((x) => x.ticker !== h.ticker))} aria-label={`Remove ${h.ticker}`}
                      className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-soft hover:text-ink">×</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {holdings.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Cash %</span>
              {allTyped ? (
                <div className="mt-1 flex h-9 items-center rounded-md border border-line bg-canvas px-2 font-mono text-sm tabular-nums text-muted">
                  {(100 - typedSum).toFixed(2)} <span className="ml-auto font-sans text-[11px] text-faint">what&apos;s left of 100%</span>
                </div>
              ) : (
                <input inputMode="decimal" value={cashText} onChange={(e) => setCashText(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-2 font-mono text-sm tabular-nums text-ink outline-none focus:border-ink" />
              )}
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Index value ({currency}, optional)</span>
              <input inputMode="decimal" value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder="for dollar amounts"
                className="mt-1 h-9 w-full rounded-md border border-line bg-white px-2 font-mono text-sm tabular-nums text-ink outline-none placeholder:font-sans placeholder:text-faint focus:border-ink" />
            </label>
          </div>
        )}

        <div className="mt-4 space-y-1.5 text-xs">
          {resolved && !resolved.ok && holdings.length > 0 && <p className="text-bad">{resolved.error}</p>}
          {resolved?.ok && <p className="text-muted">{resolved.rule}</p>}
          {heldCandidates.length > 0 && (
            <p className="text-warn">
              {heldCandidates.map((h) => h.ticker).join(", ")} {heldCandidates.length === 1 ? "is" : "are"} Canadian {heldCandidates.length === 1 ? "and already held" : "and already held"}: ranked with your holdings, not as {heldCandidates.length === 1 ? "a candidate" : "candidates"}.
            </p>
          )}
          {noData.length > 0 && industry.custom && (
            <p className="text-faint">
              Not cached yet: {noData.map((h) => h.ticker).join(", ")}. The engine looks {noData.length === 1 ? "it" : "them"} up on Onesheet when you run;
              anything it cannot find stays in the index, shown as &ldquo;no data&rdquo;.
            </p>
          )}
          {noData.length > 0 && !industry.custom && (
            <p className="text-faint">
              No Onesheet data cached for {noData.length === holdings.length ? "any of these holdings" : noData.map((h) => h.ticker).join(", ")}: {noData.length === 1 ? "it stays" : "they stay"} in the index and the before/after, shown as &ldquo;no data&rdquo; in the ranking.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <button type="button" onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">← Industry</button>
        <button type="button" onClick={onNext} disabled={!canNext}
          className="h-10 rounded-lg bg-ink px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-30">
          Review
        </button>
      </div>
    </section>
  );
}

function DataBadge({ has }: { has: boolean }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${has ? "text-teal" : "text-faint"}`}
      title={has ? "The engine has filing data for this company" : "No Onesheet data cached for this company"}>
      <span className={`h-1.5 w-1.5 rounded-full ${has ? "bg-teal" : "border border-faint"}`} />
      <span className="hidden sm:inline">{has ? "Data" : "No data"}</span>
    </span>
  );
}

// ---------------------------------------------------------------- Step 3

function ReviewStep({ industry, holdings, rule, cashPct, submitting, onBack, onRun }: {
  industry: IndustryOption; holdings: HoldingEntry[]; rule: string; cashPct: number; submitting: boolean; onBack: () => void; onRun: () => void;
}) {
  const held = new Set(holdings.map((h) => h.ticker));
  const candidates = industry.universe.filter((u) => !held.has(u.ticker));
  const measured = candidates.filter((u) => u.hasData);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) onRun();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRun]);

  return (
    <section aria-labelledby="review-h" className="a-rise space-y-3">
      <div className="rounded-xl border border-line bg-white">
        <div className="border-b border-line px-5 py-3">
          <h2 id="review-h" className="text-[13px] font-semibold text-ink">Ready to run</h2>
        </div>
        <div className="grid divide-line sm:grid-cols-3 sm:divide-x">
          <Fact label="Your holdings" value={holdings.length} sub={`${cashPct.toFixed(2)}% cash`} />
          <Fact label="Canadian candidates" value={candidates.length} sub={`${measured.length} with data`} />
          <Fact label="Checks per company" value={industry.checks.length} sub={`${industry.checks.filter((k) => k.kind === "gate").length} must pass`} />
        </div>
        <div className="border-t border-line px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-faint">The test</div>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {industry.checks.map((k) => (
              <li key={k.id} className="flex items-start gap-2 text-[13px] text-ink">
                <span className={`mt-[3px] shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase ${k.kind === "gate" ? "bg-ink text-white" : "bg-soft text-muted"}`}>
                  {k.kind === "gate" ? "Must" : "Score"}
                </span>
                {k.rule}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-line px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Canadian candidates to test</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidates.map((u) => (
              <span key={u.ticker} title={`${u.name} · ${u.subSector}${u.hasData ? "" : " · no data cached"}`}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${u.hasData ? "bg-tealsoft text-teal" : "border border-dashed border-line text-faint"}`}>
                {u.ticker}
              </span>
            ))}
          </div>
          {industry.custom && (
            <p className="mt-3 text-xs text-muted">
              Found automatically: Canadian companies Onesheet classes as &ldquo;{industry.name}&rdquo;. The peer lines above are the medians of these
              candidates; when you run, they are recomputed with your holdings included.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Each is ranked against your holdings. Ones that pass share {industry.sleevePct}% of the index, at most {industry.maxWeightPct}% each. {rule}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-sm font-medium text-white/70 hover:text-white">← Holdings</button>
        <button type="button" onClick={onRun} disabled={submitting}
          className="a-glow group relative h-12 overflow-hidden rounded-lg bg-white px-6 text-sm font-semibold text-ink transition-all hover:shadow-[0_0_40px_-6px_rgba(61,220,108,0.7)]">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-[scan-across_2.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-signal/35 to-transparent" />
          <span className="relative">{submitting ? "Running…" : "Find Canadian candidates"}</span>
          <span className="relative ml-2 rounded border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] text-muted">⏎</span>
        </button>
      </div>
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink"><Decode text={String(value)} /></div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}
