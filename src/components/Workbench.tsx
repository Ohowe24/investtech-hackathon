"use client";

import { useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import ScatterMap from "./ScatterMap";
import DetailPanel from "./DetailPanel";
import IndexBuilder from "./IndexBuilder";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
}

export default function Workbench({ dataset, snapshot }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const company = dataset.companies.find((c) => c.ticker === selected) ?? null;

  const select = (ticker: string) => {
    setSelected(ticker);
    document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      {dataset.isFake && (
        <div className="mb-4 rounded-lg bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          FAKE SAMPLE DATA: not real companies or numbers
        </div>
      )}

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600">InvestTech Hackathon</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 md:text-3xl">{dataset.question}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Index: {dataset.indexName} · Built {new Date(dataset.generatedAt).toLocaleString("en-CA")} · Every number links to its source
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-slate-200 p-4">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">The map</h2>
          <ScatterMap dataset={dataset} selected={selected} onSelect={select} />
        </div>
        <div id="detail">
          <DetailPanel dataset={dataset} company={company} />
        </div>
      </section>

      <section className="mt-6">
        <IndexBuilder dataset={dataset} snapshot={snapshot} onSelect={select} />
      </section>
    </main>
  );
}
