"use client";

import { useEffect, useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { pct } from "@/lib/format";
import { Decode, prefersReducedMotion } from "./live/motion";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  /** starts the engine run; Workbench plays it and opens the recommendation */
  onDone: () => void;
}

/** Pick a track, run the analysis. Only the track the engine has data for runs; the other is a placeholder. */
export default function StartPage({ dataset, snapshot, onDone }: Props) {
  const [picked, setPicked] = useState(dataset.indexName);
  const tested = dataset.companies.filter((c) => c.model);
  const holdings = snapshot.indexes.reduce((s, ix) => s + ix.positions.length, 0);
  const ready = picked === dataset.indexName;

  // Boot lines, typed one after another as the page opens. All counts come from the two data files.
  const boot = [
    `Connecting to the organizers' index feed · ${snapshot.indexes.length} indexes · ${holdings} holdings`,
    `Engine dataset loaded · ${tested.length} companies · ${dataset.sources.length} filings`,
    `Model armed · ${tested[0]?.model?.checks.length ?? 0} checks per company · pick a track`,
  ];
  const [line, setLine] = useState(() => (prefersReducedMotion() ? boot.length : 0));
  useEffect(() => {
    if (line >= boot.length) return;
    const id = setTimeout(() => setLine((n) => n + 1), 520);
    return () => clearTimeout(id);
  }, [line, boot.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && ready && onDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onDone]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center">
      <div className="mb-8 space-y-1.5 font-mono text-[11px] text-white/60">
        {boot.slice(0, line + 1).map((l, i) => (
          <div key={l} className={`a-fade flex items-center gap-2 ${i === line ? "caret" : ""}`}>
            <span className={i < line ? "text-signal" : "text-white/40"}>{i < line ? "✓" : "›"}</span>
            <Decode text={l} letters duration={420} />
          </div>
        ))}
      </div>

      <div className="text-[11px] font-medium uppercase tracking-wide text-white/60">Track</div>
      <div className="stagger mt-3 grid gap-3 sm:grid-cols-2" style={{ ["--d" as string]: "250ms" }}>
        {[...snapshot.indexes].sort((a) => (a.name === dataset.indexName ? -1 : 1)).map((ix, i) => {
          const on = picked === ix.name;
          const live = ix.name === dataset.indexName;
          return (
            <button key={ix.name} onClick={() => setPicked(ix.name)} aria-pressed={on} style={{ ["--i" as string]: i }}
              className={`spot group relative overflow-hidden rounded-xl border bg-white p-5 text-left transition-all ${on ? "border-ink shadow-[0_0_0_1px_#000]" : "border-line hover:border-faint"}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-semibold tracking-tight text-ink">{ix.name}</span>
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-ink bg-ink" : "border-line"}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div className="mt-6 flex items-baseline gap-6 font-mono text-xs tabular-nums text-muted">
                <span><Decode text={String(ix.holdings)} delay={400 + i * 150} className="text-base font-semibold text-ink" /> holdings</span>
                <span><Decode text={pct(ix.cashPct)} delay={500 + i * 150} className="text-base font-semibold text-ink" /> cash</span>
                <span className={`ml-auto font-sans text-[10px] font-medium uppercase tracking-wider ${live ? "text-teal" : "text-faint"}`}>
                  {live ? "● Data ready" : "No data yet"}
                </span>
              </div>
              {/* The track's holdings, drifting past. */}
              <div className="marquee-wrap relative mt-4 h-5 overflow-hidden border-t border-line pt-1">
                <div className="marquee flex w-max font-mono text-[10px] text-faint" style={{ ["--marquee-s" as string]: `${ix.positions.length * 2.2}s` }}>
                  {[0, 1].map((k) => (
                    <div key={k} className="flex shrink-0 gap-3 pr-3" aria-hidden={k === 1}>
                      {ix.positions.map((p) => (
                        <span key={p.ticker} className="whitespace-nowrap">
                          <span className="font-semibold text-ink/70">{p.ticker}</span> {pct(p.weightPct)}
                          <span className={p.signalDir === "up" ? "text-teal" : "text-bad"}> {p.signalDir === "up" ? "▲" : "▼"}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={() => ready && onDone()} disabled={!ready}
        className={`group relative mt-5 h-12 overflow-hidden rounded-lg bg-white text-sm font-semibold text-ink transition-all hover:shadow-[0_0_40px_-6px_rgba(61,220,108,0.7)] disabled:bg-white/10 disabled:text-white/40 ${ready ? "a-glow" : ""}`}>
        {ready && <span className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-[scan-across_2.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-signal/35 to-transparent" />}
        <span className="relative">{ready ? "Run candidate analysis" : "Not available yet"}</span>
        {ready && <span className="relative ml-2 rounded border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] text-muted">⏎</span>}
      </button>
    </div>
  );
}
