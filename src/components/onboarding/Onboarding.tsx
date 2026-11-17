"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IndustryOption, TickerInfo } from "@/lib/catalog";
import { fromSearch, normalizeTicker, parseHoldingsText, tickerFromLink, toSearch, type HoldingEntry } from "@/lib/query";
import { panelsClass, usePanelTheme } from "../theme";

interface Props {
  catalog: IndustryOption[];
  /** every company in the Onesheet data: suggestions for the holdings search */
  market: TickerInfo[];
}

type Step = 1 | 2 | 3;
type Check = IndustryOption["checks"][number];

/** Three steps: pick the industry, optionally add your own stocks, run the engine. The answer goes into the address of /analyze. */
export default function Onboarding({ catalog, market }: Props) {
  const router = useRouter();
  const theme = usePanelTheme();
  const [step, setStep] = useState<Step>(1);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const industry = catalog.find((c) => c.id === industryId) ?? null;

  // Coming back from a result ("Edit holdings"): the address carries the last query.
  useEffect(() => {
    const restore = () => {
      const q = fromSearch(Object.fromEntries(new URLSearchParams(window.location.search)));
      if (!q || !catalog.some((c) => c.id === q.industry)) return;
      setIndustryId(q.industry);
      setHoldings(q.holdings.map((h) => ({ ticker: h.ticker })));
      setStep(2);
    };
    restore();
  }, [catalog]);

  const pickIndustry = (id: string) => {
    if (id !== industryId) setHoldings([]);
    setIndustryId(id);
    setStep(2);
  };

  // Your own stocks are optional: with none, the engine just ranks the industry's Canadian candidates.
  const canRun = !!industry;

  const submit = () => {
    if (!industry || !canRun || submitting) return;
    setSubmitting(true);
    try { window.sessionStorage.setItem("engine-run", "1"); } catch {}
    router.push(`/analyze?${toSearch({ industry: industry.id, holdings: holdings.map((h) => ({ ticker: h.ticker })) })}`);
  };

  const steps: { n: Step; label: string; summary: string; reachable: boolean }[] = [
    { n: 1, label: "Industry", summary: industry ? industry.name : "Pick the industry to search", reachable: true },
    { n: 2, label: "Your stocks", summary: industry ? (holdings.length ? `${holdings.length} added` : "Optional: none added") : "Optional", reachable: !!industry },
    { n: 3, label: "Run", summary: industry ? `${industry.universe.length} Canadian candidates, ${industry.checks.length} checks` : "Test and rank every candidate", reachable: canRun },
  ];

  return (
    <div className={`${panelsClass(theme)} mx-auto w-full max-w-[1240px] space-y-5 px-5 pb-16 pt-6 md:px-8 md:pt-8`}>
      <section className="panel grid gap-8 px-6 py-8 md:px-9 lg:grid-cols-[1fr_380px]"
        style={{ backgroundImage: "radial-gradient(70% 120% at 0% 0%, var(--color-tealsoft), transparent 55%)" }}>
        <div className="min-w-0">
          <div className="kicker flex items-center gap-2"><span className="live-dot" /> Index completer</div>
          <h1 className="mt-4 max-w-2xl text-[34px] font-bold leading-[1.05] tracking-[-0.035em] text-ink md:text-[46px]">
            Find the Canadian companies your index is missing.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Pick an industry and the engine tests every Canadian candidate in it on that industry&apos;s declared checks and ranks them.
            Add your own stocks if you like, and they are ranked the same way. Every number is from filings.
          </p>
        </div>

        <ol aria-label="Steps" className="flex flex-col gap-2 self-center">
          {steps.map((s) => {
            const on = s.n === step;
            const done = s.n < step;
            return (
              <li key={s.n}>
                <button type="button" disabled={!s.reachable} onClick={() => setStep(s.n)} aria-current={on ? "step" : undefined}
                  className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed ${on ? "border-teal/50 bg-tealsoft" : "border-line hover:border-faint disabled:hover:border-line"}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold ${on ? "bg-teal text-white [.panels-dark_&]:text-[#03160a]" : done ? "bg-tealsoft text-teal" : "text-faint ring-1 ring-inset ring-line"}`}>
                    {done ? "✓" : s.n}
                  </span>
                  <span className="min-w-0">
                    <span className={`kicker block ${on ? "!text-teal" : ""}`}>Step {s.n} · {s.label}</span>
                    <span className={`mt-0.5 block truncate text-[14px] font-medium ${on || done ? "text-ink" : "text-faint"}`}>{s.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {step === 1 && <IndustryStep catalog={catalog} picked={industryId} onPick={pickIndustry} />}
      {step === 2 && industry && (
        <HoldingsStep industry={industry} market={market} holdings={holdings} setHoldings={setHoldings}
          canNext={canRun} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && industry && (
        <ReviewStep industry={industry} holdings={holdings} submitting={submitting} onBack={() => setStep(2)} onRun={submit} />
      )}
    </div>
  );
}

/** Panel heading: a title, a short line under it, and optional controls on the right. */
function PanelHead({ id, title, sub, right }: { id?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-5 md:px-7">
      <div>
        <h2 id={id} className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-faint">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** A check as a tag: must-pass ones are amber, scored ones plain. */
function CheckTag({ k }: { k: Check }) {
  return (
    <span title={k.rule}
      className={`rounded-md px-2 py-0.5 text-[11.5px] font-medium ${k.kind === "gate" ? "bg-warnsoft text-warn ring-1 ring-inset ring-warn/30" : "bg-soft text-ink ring-1 ring-inset ring-line"}`}>
      {k.label}
    </span>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-mono text-xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="kicker mt-0.5 !text-[9.5px]">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Step 1

function IndustryStep({ catalog, picked, onPick }: { catalog: IndustryOption[]; picked: string | null; onPick: (id: string) => void }) {
  const fixed = catalog.filter((c) => !c.custom);
  const custom = catalog.filter((c) => c.custom);
  return (
    <section aria-labelledby="industry-h" className="panel">
      <PanelHead id="industry-h" title="Which industry do you want to search?"
        sub="Amber tags must pass; the others are scored. The researched industries use checks built for them; any other industry is judged against its own peers." />
      <div className="grid gap-4 border-t border-line p-6 md:px-7 lg:grid-cols-2">
        {fixed.map((ind) => {
          const on = picked === ind.id;
          const withData = ind.universe.filter((u) => u.hasData).length;
          return (
            <button key={ind.id} type="button" onClick={() => onPick(ind.id)} aria-pressed={on}
              className={`group flex flex-col rounded-2xl border bg-[var(--panel-hi)] p-5 text-left transition-all hover:-translate-y-0.5 ${on ? "border-teal ring-1 ring-teal" : "border-line hover:border-faint"}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xl font-semibold tracking-tight text-ink">{ind.name}</span>
                <span className="mt-1 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink">→</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{ind.tagline}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">{ind.checks.map((k) => <CheckTag key={k.id} k={k} />)}</div>
              <div className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-4 [margin-top:1.25rem]">
                <Stat value={ind.universe.length} label="Canadian candidates" />
                <Stat value={withData} label="With data" />
                <Stat value={ind.checks.length} label="Checks" />
              </div>
            </button>
          );
        })}
        {custom.length > 0 && <ChooseYourOwn options={custom} picked={picked} onPick={onPick} />}
      </div>
    </section>
  );
}

/** Any industry in the Canadian market map: pick it from a list, and the engine finds its Canadian companies itself. */
function ChooseYourOwn({ options, picked, onPick }: { options: IndustryOption[]; picked: string | null; onPick: (id: string) => void }) {
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
    <div className={`flex flex-col rounded-2xl border bg-[var(--panel-hi)] p-5 text-left lg:col-span-2 ${current ? "border-teal ring-1 ring-teal" : "border-line"}`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xl font-semibold tracking-tight text-ink">Choose your own</span>
            <span className="kicker rounded-full bg-tealsoft px-2 py-0.5 !text-[9.5px] !text-teal">Finds candidates</span>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Any of {options.length} industries across {companies} Canadian companies. The engine finds the Canadian companies in it, measures each on
            its statements, and ranks them against each other and your holdings: every check is &ldquo;better than the median company tested&rdquo;.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="custom-industry" className="sr-only">Industry</label>
          <select id="custom-industry" value={choice} onChange={(e) => setChoice(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-[var(--panel-solid)] px-3 text-sm text-ink outline-none focus:border-ink">
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
            className="h-11 shrink-0 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-30">
            Use this industry →
          </button>
        </div>
      </div>
      {shown && (
        <div className="mt-5 grid gap-3 border-t border-line pt-4 lg:grid-cols-2">
          <div>
            <div className="kicker mb-2">The checks</div>
            <div className="flex flex-wrap gap-1.5">{shown.checks.map((k) => <CheckTag key={k.id} k={k} />)}</div>
          </div>
          <div>
            <div className="kicker mb-2">Canadian candidates · {shown.universe.length}</div>
            <div className="flex flex-wrap gap-1.5">
              {shown.universe.slice(0, 18).map((u) => (
                <span key={u.ticker} title={u.name} className="rounded-md bg-tealsoft px-2 py-0.5 font-mono text-[11px] font-semibold text-teal">{u.ticker}</span>
              ))}
              {shown.universe.length > 18 && <span className="px-1 py-0.5 text-[11px] text-muted">+{shown.universe.length - 18} more</span>}
            </div>
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
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
}

function HoldingsStep({ industry, market, holdings, setHoldings, canNext, onBack, onNext }: HoldingsProps) {
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = useMemo(() => {
    // Every stock in the Onesheet data is searchable, whatever the industry; this industry's own lists add their labels on top.
    const m = new Map<string, TickerInfo>();
    for (const t of market) m.set(t.ticker, t);
    for (const t of industry.known) m.set(t.ticker, t);
    for (const h of industry.organizers?.holdings ?? []) m.set(h.ticker, h);
    for (const u of industry.universe) m.set(u.ticker, u);
    return m;
  }, [industry, market]);
  const candidateSet = useMemo(() => new Set(industry.universe.map((u) => u.ticker)), [industry]);

  const held = new Set(holdings.map((h) => h.ticker));
  const q = text.trim().toUpperCase();
  const linked = tickerFromLink(text);
  const suggestions = q && !/[,;\n]/.test(text) && !linked
    ? [...lookup.values()]
        .filter((t) => !held.has(t.ticker) && (t.ticker.startsWith(normalizeTicker(q) || q) || t.name.toUpperCase().includes(q)))
        .sort((a, b) => Number(b.ticker.startsWith(q)) - Number(a.ticker.startsWith(q)) || a.ticker.localeCompare(b.ticker))
        .slice(0, 8)
    : [];

  const addText = (raw: string) => {
    // Any weights in a pasted list are dropped: the tool works on which stocks, not how much of each.
    const { entries, rejected: bad } = parseHoldingsText(raw);
    setHoldings((prev) => {
      const out = [...prev];
      for (const e of entries) if (!out.some((x) => x.ticker === e.ticker)) out.push({ ticker: e.ticker });
      return out;
    });
    setRejected(bad);
    setText("");
    setActive(0);
  };

  const loadOrganizers = () => {
    if (!industry.organizers) return;
    setHoldings(industry.organizers.holdings.map((h) => ({ ticker: h.ticker })));
    setRejected([]);
  };

  const heldCandidates = holdings.filter((h) => candidateSet.has(h.ticker));
  const noData = holdings.filter((h) => !lookup.get(h.ticker)?.hasData);

  return (
    <section aria-labelledby="holdings-h" className="a-rise panel">
      <PanelHead id="holdings-h"
        title={<>Add your own stocks <span className="font-normal text-faint">· optional</span></>}
        sub={`Ranked alongside the Canadian ${industry.name} candidates, on the same checks.`}
        right={
          <div className="flex items-center gap-2">
            {industry.organizers && (
              <button type="button" onClick={loadOrganizers}
                className="rounded-[10px] border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-ink">
                Load the organizers&apos; holdings ({industry.organizers.holdings.length})
              </button>
            )}
            {holdings.length > 0 && (
              <button type="button" onClick={() => { setHoldings([]); setRejected([]); }} className="rounded-md px-2 py-1.5 text-[12.5px] text-muted hover:text-ink">
                Clear
              </button>
            )}
          </div>
        } />

      <div className="border-t border-line p-6 md:px-7">
        <form onSubmit={(e) => { e.preventDefault(); if (suggestions[active] && !/\d/.test(text)) addText(suggestions[active].ticker); else if (text.trim()) addText(text); }}
          className="relative">
          <label htmlFor="ticker-input" className="sr-only">Add stocks</label>
          <div className="flex gap-2">
            <input id="ticker-input" ref={inputRef} value={text} autoComplete="off" spellCheck={false}
              onChange={(e) => { setText(e.target.value); setActive(0); }}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (/[,;\n\t]/.test(t) || tickerFromLink(t)) { e.preventDefault(); addText(t); }
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Backspace" && text === "" && holdings.length) setHoldings((p) => p.slice(0, -1));
              }}
              placeholder={`Search ${lookup.size} stocks by ticker or name, or paste a list or a quote link`}
              role="combobox" aria-expanded={suggestions.length > 0} aria-controls="ticker-suggestions" aria-autocomplete="list"
              className="h-12 min-w-0 flex-1 rounded-[10px] border border-line bg-[var(--panel-hi)] px-4 font-mono text-sm text-ink outline-none transition-colors placeholder:font-sans placeholder:text-faint focus:border-ink" />
            <button type="submit" disabled={!text.trim()}
              className="h-12 shrink-0 rounded-[10px] bg-ink px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-30">
              Add
            </button>
          </div>
          {suggestions.length > 0 && (
            <ul id="ticker-suggestions" role="listbox" className="absolute inset-x-0 top-14 z-20 max-h-80 overflow-y-auto rounded-xl border border-line bg-[var(--panel-solid)] py-1 shadow-[0_24px_50px_-16px_rgba(0,0,0,0.6)]">
              {suggestions.map((s, i) => (
                <li key={s.ticker} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { addText(s.ticker); inputRef.current?.focus(); }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-soft" : ""}`}>
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
        {linked && (
          <p className="mt-2 text-xs text-muted">Link reads as <span className="font-mono font-semibold text-ink">{linked}</span>{lookup.get(linked) ? ` · ${lookup.get(linked)!.name}` : ""}. Press Add.</p>
        )}
        {rejected.length > 0 && (
          <p className="mt-2 text-xs text-bad">Could not read as a ticker: {rejected.map((r) => `"${r}"`).join(", ")}</p>
        )}

        {holdings.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center">
            <div className="text-[14px] text-muted">No stocks added. That&apos;s fine: skip this and the engine ranks the Canadian {industry.name} candidates on their own.</div>
            <div className="mt-1 text-xs text-faint">Add stocks you hold or follow{industry.organizers ? ", or load the organizers' holdings," : ""} and they are ranked alongside the candidates.</div>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-line">
            <div className="kicker border-b border-line bg-[var(--panel-hi)] px-4 py-2.5">Your stocks · {holdings.length}</div>
            <ul className="grid max-h-[360px] overflow-y-auto sm:grid-cols-2">
              {holdings.map((h) => {
                const info = lookup.get(h.ticker);
                return (
                  <li key={h.ticker} className="a-fade grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-4 py-2.5 sm:[&:nth-child(odd)]:border-r">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-7 min-w-12 shrink-0 place-items-center rounded-md border border-line bg-[var(--panel-hi)] px-1.5 font-mono text-[11px] font-semibold text-ink sm:min-w-14">{h.ticker}</span>
                      <span className="min-w-0 truncate text-sm text-ink">{info?.name ?? <span className="text-faint">Unknown to the engine</span>}</span>
                      <DataBadge has={!!info?.hasData} />
                    </div>
                    <button type="button" onClick={() => setHoldings((p) => p.filter((x) => x.ticker !== h.ticker))} aria-label={`Remove ${h.ticker}`}
                      className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-soft hover:text-ink">×</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-4 space-y-1.5 text-xs">
          {heldCandidates.length > 0 && (
            <p className="text-warn">
              {heldCandidates.map((h) => h.ticker).join(", ")} {heldCandidates.length === 1 ? "is also a Canadian candidate" : "are also Canadian candidates"}: ranked with your stocks, not as {heldCandidates.length === 1 ? "a candidate" : "candidates"}.
            </p>
          )}
          {noData.length > 0 && industry.custom && (
            <p className="text-faint">
              Not cached yet: {noData.map((h) => h.ticker).join(", ")}. The engine looks {noData.length === 1 ? "it" : "them"} up on Onesheet when you run;
              anything it cannot find is listed as &ldquo;no data&rdquo;.
            </p>
          )}
          {noData.length > 0 && !industry.custom && (
            <p className="text-faint">
              No Onesheet data cached for {noData.length === holdings.length ? "any of these stocks" : noData.map((h) => h.ticker).join(", ")}: shown as &ldquo;no data&rdquo; in the ranking.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4 md:px-7">
        <button type="button" onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">← Industry</button>
        <button type="button" onClick={onNext} disabled={!canNext}
          className={`h-11 rounded-[10px] px-5 text-sm font-semibold transition-opacity disabled:opacity-30 ${holdings.length ? "bg-ink text-white" : "border border-line text-ink hover:border-ink"}`}>
          {holdings.length ? "Review →" : "Skip, just find candidates →"}
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

function ReviewStep({ industry, holdings, submitting, onBack, onRun }: {
  industry: IndustryOption; holdings: HoldingEntry[]; submitting: boolean; onBack: () => void; onRun: () => void;
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
    <section aria-labelledby="review-h" className="a-rise panel">
      <PanelHead id="review-h" title={`Ready to run · ${industry.name}`}
        sub={holdings.length ? "Each candidate is ranked against your stocks on the same checks." : "Each candidate is ranked against the others on the same checks."} />
      <div className="grid border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
        <Fact label="Your stocks" value={holdings.length} sub={holdings.length ? "ranked alongside" : "none added: optional"} />
        <Fact label="Canadian candidates" value={candidates.length} sub={`${measured.length} with data`} />
        <Fact label="Checks per company" value={industry.checks.length} sub={`${industry.checks.filter((k) => k.kind === "gate").length} must pass`} />
      </div>
      <div className="grid border-t border-line lg:grid-cols-2 lg:divide-x lg:divide-line">
        <div className="px-6 py-5 md:px-7">
          <div className="kicker">The test</div>
          <ul className="mt-3 space-y-2.5">
            {industry.checks.map((k) => (
              <li key={k.id} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                <span className={`mt-[2px] w-12 shrink-0 rounded px-1.5 py-px text-center text-[10px] font-semibold uppercase ${k.kind === "gate" ? "bg-warnsoft text-warn" : "bg-soft text-muted"}`}>
                  {k.kind === "gate" ? "Must" : "Score"}
                </span>
                {k.rule}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-line px-6 py-5 md:px-7 lg:border-t-0">
          <div className="kicker">Canadian candidates to test</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {candidates.map((u) => (
              <span key={u.ticker} title={`${u.name} · ${u.subSector}${u.hasData ? "" : " · no data cached"}`}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${u.hasData ? "bg-tealsoft text-teal" : "border border-dashed border-line text-faint"}`}>
                {u.ticker}
              </span>
            ))}
          </div>
          {industry.custom && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Found automatically: Canadian companies Onesheet classes as &ldquo;{industry.name}&rdquo;. The peer lines above are the medians of these
              candidates; when you run, they are recomputed with your stocks included.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Ones that pass every must-pass check and enough scored checks are marked Add.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4 md:px-7">
        <button type="button" onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">← Your stocks</button>
        <button type="button" onClick={onRun} disabled={submitting}
          className="flex h-12 items-center gap-3 rounded-[10px] bg-teal px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 [.panels-dark_&]:text-[#03160a]">
          {submitting ? "Running…" : "Find Canadian candidates"}
          <span className="rounded border border-current/25 px-1.5 py-0.5 font-mono text-[10px] opacity-70">⏎</span>
        </button>
      </div>
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="px-6 py-5 md:px-7">
      <div className="kicker">{label}</div>
      <div className="mt-1.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </div>
  );
}
