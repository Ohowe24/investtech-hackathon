"use client";

import type { Company, Dataset, IndexSnapshot } from "@contract/types";
import { formatMetric, listNames } from "@/lib/format";
import { Card } from "./ui";
import { Decode } from "./live/motion";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onOpen: (ticker: string) => void;
}

/** The answer on one page: which Canadian companies pass the bar, and why. No weights: the tool says which, not how much. */
export default function Recommendation({ dataset, onOpen }: Props) {
  const picks = dataset.companies.filter((c) => c.verdict === "add" && !c.inIndex).sort((a, b) => (a.model?.rank ?? 0) - (b.model?.rank ?? 0));
  if (picks.length === 0) return <Card title="Recommendation"><p className="text-sm text-muted">No Canadian candidate passes the bar yet.</p></Card>;
  const tested = dataset.companies.filter((c) => c.model && !c.inIndex).length;
  const yours = dataset.companies.filter((c) => c.inIndex).length;
  const checks = dataset.companies[0]?.model?.checks ?? [];
  const one = picks.length === 1 ? picks[0] : null;
  // Full names fit the headline for one or two picks; past that it says how many and the tickers go in chips below.
  const named = picks.length <= 2;
  const toCard = (t: string) => document.getElementById(`why-${t}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="enter space-y-5">
      <section className="scan-once panel grid items-end gap-8 px-6 py-8 md:px-9 lg:grid-cols-[1fr_auto]"
        style={{ backgroundImage: "radial-gradient(80% 140% at 0% 0%, var(--color-tealsoft), transparent 55%)" }}>
        <div className="min-w-0">
          <div className="kicker flex items-center gap-2">
            <span className="live-dot" /> Recommendation · {dataset.industryName ?? dataset.industryId}
          </div>
          <h1 className="mt-3 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] text-ink md:text-[44px]">
            <Decode text={named ? `Add ${listNames(picks.map((c) => c.name))}` : `Add these ${picks.length} companies`} letters duration={1100} delay={200} />
          </h1>
          {!named && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {picks.map((c) => (
                <button key={c.ticker} onClick={() => toCard(c.ticker)} title={c.name}
                  className="rounded-md border border-line px-2 py-0.5 font-mono text-xs font-semibold text-ink transition-colors hover:border-teal hover:text-teal">
                  {c.ticker}
                </button>
              ))}
            </div>
          )}
          {one && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[13.5px] text-muted">
              <span className="rounded-md border border-line px-2 py-0.5 font-mono text-xs font-semibold text-ink">{one.ticker}</span>
              {one.listedOn && <span>{one.listedOn}</span>}
              {one.model && <><span className="text-faint">·</span><span>Ranked <b className="text-ink">#{one.model.rank} of {dataset.companies.length}</b></span></>}
              <span className="a-stamp rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-white [.panels-dark_&]:text-[#03160a]" style={{ animationDelay: "1100ms" }}>ADD</span>
            </div>
          )}
          <p className="mt-4 max-w-2xl text-[15px] text-muted">
            {picks.length} of {tested} Canadian {tested === 1 ? "candidate" : "candidates"} pass every must-pass check and enough of the {checks.filter((k) => k.kind === "score").length} scored checks
            {yours ? `, tested on the same bar as your ${yours} ${yours === 1 ? "stock" : "stocks"}` : ""}.
          </p>
        </div>
        <div className="lg:text-right">
          <div className="text-[64px] font-bold leading-none tracking-[-0.05em] text-teal md:text-[76px]">
            <Decode text={`${picks.length}`} delay={500} /><span className="text-[28px] font-semibold tracking-normal text-faint"> of {tested}</span>
          </div>
          <div className="mt-2 text-sm text-muted">Canadian candidates pass the bar</div>
        </div>
      </section>

      <div className={`grid gap-5 ${picks.length >= 2 ? "lg:grid-cols-2" : ""}`}>
        {picks.map((c) => (
          <Pick key={c.ticker} company={c} dataset={dataset} onOpen={onOpen} wide={picks.length === 1} />
        ))}
      </div>
    </div>
  );
}

/** One pick: every declared check, the company's figure and the bar it had to clear. */
function Pick({ company: c, dataset, onOpen, wide }: { company: Company; dataset: Dataset; onOpen: (t: string) => void; wide: boolean }) {
  const m = c.model;
  const def = (id: string) => dataset.metricDefs.find((d) => d.id === id);

  return (
    <section id={`why-${c.ticker}`} className="a-glow panel scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">Why {c.ticker}{wide ? "" : ` · ${c.name}`}</h2>
          {m && <p className="mt-0.5 text-[13px] text-faint">Passes {m.passed} of {m.available} scored checks and every must-pass check. Ranked #{m.rank} of {dataset.companies.length}.</p>}
        </div>
        <button onClick={() => onOpen(c.ticker)} className="text-[13.5px] font-semibold text-ink hover:underline">Full analysis →</button>
      </div>
      <div className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-x-4 border-y border-line bg-[var(--panel-hi)] px-6 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
        <span /><span>Check</span><span className="w-24 text-right">{c.ticker}</span><span className="w-24 text-right">The bar</span>
      </div>
      {(m?.checks ?? []).map((k, i) => {
        const d = def(k.metricId);
        const mv = c.metrics[k.metricId];
        return (
          <div key={k.id} title={k.rule} className={`grid grid-cols-[28px_1fr_auto_auto] items-center gap-x-4 px-6 py-3.5 ${i ? "border-t border-line" : ""}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${k.pass === null ? "text-faint ring-1 ring-inset ring-line" : k.pass ? "bg-tealsoft text-teal" : "bg-badsoft text-bad"}`}>
              {k.pass === null ? "·" : k.pass ? "✓" : "✕"}
            </span>
            <span className="min-w-0 text-[14px] font-medium text-ink">
              {d?.short ?? d?.label ?? k.label}
              {k.kind === "gate" && <span className="kicker ml-2 !text-[9.5px] !text-warn">Must pass</span>}
            </span>
            <span className={`w-24 text-right font-mono text-base font-semibold tabular-nums ${mv?.value == null ? "text-faint" : "text-ink"}`} title={mv?.note}>
              {mv?.value == null ? "—" : formatMetric(mv, d?.unit ?? "pct")}
            </span>
            <span className="w-24 text-right font-mono text-[11px] text-faint">{k.target}</span>
          </div>
        );
      })}
    </section>
  );
}
