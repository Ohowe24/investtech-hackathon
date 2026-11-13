"use client";

import { useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import ScatterMap from "./ScatterMap";
import DetailPanel from "./DetailPanel";
import IndexBuilder from "./IndexBuilder";
import Scorecard from "./Scorecard";
import DealTimeline from "./DealTimeline";
import { Card } from "./ui";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
}

export default function Workbench({ dataset, snapshot }: Props) {
  const tested = dataset.companies.filter((c) => c.model);
  const candidates = tested.filter((c) => !c.inIndex);
  const holdings = tested.filter((c) => c.inIndex);
  // Open on the best-ranked candidate so the page is never empty.
  const first = [...candidates].sort((a, b) => a.model!.rank - b.model!.rank)[0]?.ticker ?? null;
  const [selected, setSelected] = useState<string | null>(first);
  const [hovered, setHovered] = useState<string | null>(null);
  const company = dataset.companies.find((c) => c.ticker === selected) ?? null;

  const select = (ticker: string) => {
    setSelected(ticker);
    document.getElementById("profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const passing = (list: typeof tested) => list.filter((c) => c.model!.recommendation === "pass").length;
  const sleeve = candidates.reduce((s, c) => s + (c.proposedWeightPct ?? 0), 0);

  return (
    <div className="w-full">
      {dataset.isFake && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          FAKE SAMPLE DATA: not real companies or numbers
        </div>
      )}

      <div className="bg-signal px-4 py-1.5 text-center text-xs font-medium text-ink">
        InvestTech Hackathon, Montréal · Built on Onesheet data · {new Date(dataset.generatedAt).toLocaleDateString("en-CA")}
      </div>

      <header className="bg-ink text-white">
        <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-10 md:px-8 md:pb-16 md:pt-14">
          <div className="flex items-center justify-between text-sm">
            <span className="text-lg font-extrabold tracking-tight">acquirer x-ray<span className="text-signal">.</span></span>
            <span className="text-white/60">Index: {dataset.indexName}</span>
          </div>
          <h1 className="display mt-10 max-w-4xl text-5xl md:text-7xl">Bigger, or better for owners?</h1>
          <p className="mt-5 max-w-2xl text-base text-white/65 md:text-lg">
            {dataset.question} One declared test, applied to the Canadian candidates and to every company the index already holds. Every number traces to its source.
          </p>
          {tested.length > 0 && (
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <Headline value={`${passing(candidates)} of ${candidates.length}`} label="Canadian candidates pass" />
              <Headline value={`${passing(holdings)} of ${holdings.length}`} label="current holdings pass the same test" />
              <Headline value={`${sleeve.toFixed(1)}%`} label="of the index proposed for Canada" />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 md:px-8 md:py-12">
        <Scorecard dataset={dataset} selected={selected} hovered={hovered} onSelect={select} onHover={setHovered} />

        <div id="profile" className="grid scroll-mt-6 grid-cols-1 items-start gap-6 lg:grid-cols-[3fr_2fr]">
          <Card label="The map" lead="Buying a lot is not the same as compounding."
            rest="Right of the line, acquisitions drive the company. Above it, each share's cash grew. Hover a dot to read it, click to open it.">
            <ScatterMap dataset={dataset} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
          </Card>
          <div className="lg:sticky lg:top-6">
            <DetailPanel dataset={dataset} company={company} />
          </div>
        </div>

        <DealTimeline key={selected ?? "none"} dataset={dataset} company={company} />

        <IndexBuilder dataset={dataset} snapshot={snapshot} onSelect={select} />
      </main>

      <footer className="bg-ink px-5 py-8 text-center text-xs text-white/50">
        Not investment advice. A hackathon research tool. Statements from the Onesheet API; deals and organic growth quoted from SEDAR filings in the Onesheet data pack.
      </footer>
    </div>
  );
}

function Headline({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4">
      <div className="text-4xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1 text-sm text-white/60">{label}</div>
    </div>
  );
}
