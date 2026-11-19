"use client";

// The Outlook engine tab (#outlook). Reads data/outlook.json (npm run outlook). Plan: docs/OUTLOOK_ENGINE.md.
// Shows where the build stands. Shows no outlook numbers until the engine has computed them from published sources.

import { useState } from "react";
import type { OutlookData, OutlookDeal, StepStatus } from "@contract/outlook";
import outlookJson from "@data/outlook.json";
import { Card } from "./ui";

const outlook = outlookJson as OutlookData;

const STATUS: Record<StepStatus, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-600" },
  "in-progress": { label: "In progress", cls: "bg-amber-500/15 text-amber-600" },
  planned: { label: "Planned", cls: "bg-line text-muted" },
};

const LABEL_TAG: Record<OutlookDeal["labelStatus"], { label: string; cls: string }> = {
  approved: { label: "Approved", cls: STATUS.done.cls },
  proposed: { label: "Proposed", cls: STATUS["in-progress"].cls },
  unlabelled: { label: "Not labelled", cls: STATUS.planned.cls },
};

function labelCounts(deals: OutlookDeal[]) {
  const n = (f: (d: OutlookDeal) => boolean) => deals.filter(f).length;
  const coded = n((d) => !d.exclude && !!d.naics);
  const open = n((d) => !d.exclude && !d.naics);
  const out = n((d) => !!d.exclude);
  const approved = n((d) => d.labelStatus === "approved");
  return `${coded} with an industry code · ${open} the filings don't describe · ${out} left out (duplicates, minority stakes, deals not done) · ${approved} of ${deals.length} approved`;
}

function DealLabel({ d }: { d: OutlookDeal }) {
  const tag = LABEL_TAG[d.labelStatus];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {d.naics ? (
          <span className="font-medium text-ink">
            {d.naics} · {d.naicsTitle}
          </span>
        ) : (
          <span className="text-faint">No industry code</span>
        )}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tag.cls}`}>{tag.label}</span>
      </div>
      {d.serves && <div className="text-[12px] text-muted">Serves: {d.serves}</div>}
      {d.naicsQuote && (
        <div className="text-[12px] italic leading-snug text-muted">
          “{d.naicsQuote}” <span className="not-italic text-faint">· {d.naicsQuoteSource}</span>
        </div>
      )}
      {d.exclude && <div className="text-[12px] font-medium text-muted">Left out: {d.exclude}</div>}
      {d.labelNote && <div className="text-[12px] leading-snug text-faint">{d.labelNote}</div>}
    </div>
  );
}

export default function OutlookEngine() {
  const tickers = outlook.companies.map((c) => c.ticker);
  const [ticker, setTicker] = useState(tickers[0] ?? "");
  const deals = outlook.deals.filter((d) => d.ticker === ticker);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Outlook engine</h1>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">In development</span>
        </div>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">{outlook.thesis}</p>
        <p className="mt-2 max-w-3xl text-[12px] text-faint">
          Context, not a scored check: it does not change any recommendation. Every figure will come from a published source;
          none is our own forecast. Not investment advice.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {outlook.layers.map((layer) => (
          <Card key={layer.id} title={layer.title}>
            <p className="mb-3 text-[13px] font-medium text-ink">{layer.question}</p>
            <ul className="space-y-2.5">
              {layer.steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS[s.status].cls}`}>
                    {STATUS[s.status].label}
                  </span>
                  <span className="text-[13px] leading-snug">
                    <span className="font-medium text-ink">{s.label}.</span> <span className="text-muted">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card
        title="Layer 1 input · disclosed acquisitions"
        right={
          <div className="flex flex-wrap gap-1">
            {tickers.map((t) => (
              <button key={t} onClick={() => setTicker(t)} aria-pressed={t === ticker}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${t === ticker ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                {t} <span className="text-faint">{outlook.deals.filter((d) => d.ticker === t).length}</span>
              </button>
            ))}
          </div>
        }
      >
        <p className="mb-3 text-[12px] text-faint">
          From SEDAR filings. Each deal gets an industry code (NAICS 2022) with the quote that justifies it, approved by a person.
          Constellation and Topicus disclose only material deals, so this shows where the large money goes, not every deal.
        </p>
        <p className="mb-3 text-[12px] text-muted">
          {labelCounts(deals)}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Business bought</th>
                <th className="py-2 pr-3 font-medium">Industry</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d, i) => (
                <tr key={`${d.date}-${i}`} className={`border-t border-line align-top ${d.exclude ? "opacity-60" : ""}`}>
                  <td className="whitespace-nowrap py-2 pr-3 text-muted">{d.date || "—"}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-ink">{d.counterparty || "Not named"}</div>
                    <div className="text-[12px] text-muted">{d.summary}</div>
                  </td>
                  <td className="w-[44%] py-2 pr-3">
                    <DealLabel d={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Sources">
        <ul className="space-y-1.5 text-[13px]">
          {outlook.sources.map((s) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.status === "fetched" ? STATUS.done.cls : STATUS.planned.cls}`}>
                {s.status === "fetched" ? "In use" : "Planned"}
              </span>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">{s.label}</a> : <span className="text-ink">{s.label}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
