"use client";

import type { Company, Dataset } from "@contract/types";
import { formatValue, recStyle, verdictStyle } from "@/lib/format";
import { Card } from "./ui";

const status = (pass: boolean | null) => pass === null ? "Missing evidence" : pass ? "Meets rule" : "Below standard";

/** Explains the published thesis and decisions without changing the model's standards. */
export default function RuleLab({ dataset, onOpen }: {
  dataset: Dataset;
  onOpen: (ticker: string) => void;
}) {
  const candidates = dataset.companies.filter((c) => c.hqCountry === "CA" && !c.inIndex);
  const additions = candidates.filter((c) => c.verdict === "add");
  const others = candidates.filter((c) => c.verdict !== "add");

  const evidence = (company: Company) => {
    const model = company.model;
    const supported = model?.checks.filter((c) => c.pass === true) ?? [];
    const concerns = model?.checks.filter((c) => c.pass !== true) ?? [];
    return (
      <Card key={company.ticker} title={`${company.ticker} · ${company.name}`} right={<span className={`rounded px-2 py-1 text-xs ${verdictStyle[company.verdict].badge}`}>{verdictStyle[company.verdict].label}</span>}>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {model && <span className={`rounded px-2 py-1 ${recStyle[model.recommendation].badge}`}>Model: {recStyle[model.recommendation].label}</span>}
          <span>Decision: {company.verdictSource === "human" ? "analyst override" : company.verdictSource === "model" ? "published model" : "published decision"}</span>
          {model && <span>{supported.length}/{model.checks.length} checks meet the standard</span>}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {["fcfPerShareCagr", "cashReturn", "netDebtToEbitda"].map((id) => {
            const metric = company.metrics[id];
            const def = dataset.metricDefs.find((m) => m.id === id);
            const check = model?.checks.find((c) => c.metricId === id);
            return <div key={id} className="rounded-lg bg-soft p-3">
              <div className="text-[11px] text-muted">{def?.short ?? def?.label ?? id}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{formatValue(metric?.value, def?.unit ?? "pct")}</div>
              <div className={`mt-1 text-[11px] ${check?.pass === true ? "text-teal" : "text-warn"}`}>{check ? status(check.pass) : "Not evaluated"}{check?.target ? ` · ${check.target}` : ""}</div>
            </div>;
          })}
        </div>
        <div className="mt-4 rounded-lg border border-line px-4 py-3">
          <h3 className="text-xs font-semibold text-ink">{concerns.length ? "Keep in view" : "Screening conclusion"}</h3>
          {concerns.length ? <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">{concerns.map((check) => <li key={check.id}><span className="font-medium text-warn">{check.pass === null ? "Missing evidence" : "Unmet rule"}: </span>{check.rule}.</li>)}</ul> : <p className="mt-1 text-xs leading-relaxed text-muted">{model ? "Every published check passes. Valuation and individual deals still need review." : "No published model is available for this company."}</p>}
          {company.verdictSource === "human" && company.reason && <p className="mt-2 text-xs text-muted">Analyst rationale: {company.reason}</p>}
        </div>
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-teal">Inspect figures, fixed rules and sources</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[570px] text-left text-xs">
              <caption className="sr-only">Published checks and supporting sources for {company.ticker}</caption>
              <thead><tr className="border-b border-line text-muted">{["Measure / period", "Actual", "Fixed rule", "Evidence"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead>
              <tbody>{model?.checks.map((check) => {
                const metric = company.metrics[check.metricId];
                const def = dataset.metricDefs.find((m) => m.id === check.metricId);
                return <tr key={check.id} className="border-b border-line text-muted">
                  <td className="px-2 py-3"><span className="font-medium text-ink">{def?.short ?? def?.label ?? check.metricId}</span><div className="mt-1">{metric?.period ?? "Period unavailable"} · {check.kind === "gate" ? "Required gate" : "Scored check"}</div>{metric?.note && <p className="mt-1 max-w-sm">{metric.note}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">{metric?.sourceIds.map((id) => { const source = dataset.sources.find((s) => s.id === id); return source?.url ? <a key={id} href={source.url} target="_blank" rel="noreferrer" className="text-teal underline">{source.label}</a> : <span key={id}>{source?.label ?? id}</span>; })}</div>
                  </td>
                  <td className="px-2 py-3 tabular-nums text-ink">{formatValue(metric?.value, def?.unit ?? "pct")}</td>
                  <td className="max-w-xs px-2 py-3">{check.rule}</td>
                  <td className={`px-2 py-3 font-medium ${check.pass === true ? "text-teal" : "text-warn"}`}>{status(check.pass)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </details>
        <button type="button" onClick={() => onOpen(company.ticker)} className="mt-4 text-xs font-medium text-teal underline">Open {company.ticker} company research →</button>
      </Card>
    );
  };

  const tested = dataset.companies.filter((c) => c.model);
  const rules = tested[0]?.model?.checks ?? [];
  const gates = rules.filter((c) => c.kind === "gate");
  const scored = rules.filter((c) => c.kind === "score");

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-white/15 bg-black/45 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">Tested thesis · Serial acquirers</p>
          <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/70">Fixed rules · Published evidence</span>
        </div>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Growth should reach<br />every share.</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">Select Canadian acquirers that turn growth into cash flow per share, with disciplined debt and adequate cash returns on invested capital.</p>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-white/15 bg-white/5 p-5">
            <p className="text-xs text-white/60">The published selections</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{additions.map((c) => c.ticker).join(" + ") || "None"}</p>
            <p className="mt-3 text-xs leading-relaxed text-white/60">{candidates.length} Canadian candidates evaluated. {additions.length} additions. The evidence and exceptions are below.</p>
          </div>
        </div>
      </section>

      <Card title="01 / How the thesis was tested" right={<span className="text-[11px] text-muted">Financial screen · Not a return backtest</span>}>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { step: "01", title: "Measure the businesses", text: `Read the published financial metrics for ${tested.length} companies, including ${candidates.length} Canadian candidates. Each metric retains its reporting period and source references.` },
            { step: "02", title: "Apply the same standards", text: `Apply ${gates.length} required gates and ${scored.length} scored checks. Acquisition activity and leverage establish eligibility; per-share growth and capital discipline determine the score.` },
            { step: "03", title: "Explain the decision", text: "Compare the published results with the index decisions. Show passing checks, exceptions and missing evidence. Keep analyst overrides separate from the model." },
          ].map((item) => <div key={item.step} className="rounded-xl bg-soft p-4"><span className="text-xs font-mono text-faint">{item.step}</span><h3 className="mt-3 text-sm font-semibold text-ink">{item.title}</h3><p className="mt-2 text-xs leading-relaxed text-muted">{item.text}</p></div>)}
        </div>
        <details className="mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer text-xs font-medium text-teal">See the exact rules and pass criteria</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[{ title: "Must-pass gates", checks: gates }, { title: "Scored checks", checks: scored }].map((group) => <div key={group.title} className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold text-ink">{group.title}</h3><ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">{group.checks.map((check) => <li key={check.id}>{check.rule}.</li>)}</ul></div>)}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{dataset.rules?.result ?? "Published results use the declared gates and scored checks. Missing data stays unknown."}</p>
        </details>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[11px] uppercase tracking-widest text-white/50">02 / The result</p><h2 className="mt-2 text-xl font-semibold text-white">The case for our additions</h2></div><p className="text-xs text-white/60">Key figures first. Full evidence one click away.</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-2">{additions.map(evidence)}</div>
      {!additions.length && <Card><p className="text-sm text-muted">No Canadian additions are currently recommended.</p></Card>}

      <Card title="03 / Why the others were not selected">
        <p className="mb-4 text-xs leading-relaxed text-muted">The same screen also explains the watchlist and rejections. Expand any company to inspect its evidence.</p>
        <div className="space-y-3">{others.map((company) => {
          const concerns = company.model?.checks.filter((c) => c.pass !== true) ?? [];
          return <details key={company.ticker} className="rounded-lg border border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm text-ink"><span className="ml-1 font-semibold">{company.ticker}</span><span className="ml-2 text-muted">{company.name}</span><span className={`ml-3 inline-block rounded px-2 py-1 text-[11px] ${verdictStyle[company.verdict].badge}`}>{verdictStyle[company.verdict].label}</span>
              <span className="mt-2 block text-xs leading-relaxed text-muted">{concerns.length ? concerns.map((c) => `${c.pass === null ? "Missing" : "Unmet"}: ${c.label}`).join(" · ") : company.reason ?? "See the published decision and checks."}</span>
            </summary>
            <div className="border-t border-line p-3">{evidence(company)}</div>
          </details>;
        })}</div>
      </Card>

      <div className="grid gap-5 rounded-xl border border-white/15 bg-black/40 p-5 sm:grid-cols-2">
        <div><h2 className="text-xs font-semibold text-white">What this establishes</h2><p className="mt-2 text-xs leading-relaxed text-white/65">A traceable case for the published selections under one consistent framework. Figures, rules and results can be inspected for every candidate.</p></div>
        <div><h2 className="text-xs font-semibold text-white">What still needs research</h2><p className="mt-2 text-xs leading-relaxed text-white/65">Valuation, individual deal quality and future returns. This screen does not prove acquisitions caused the growth or predict outperformance. Share issuance and acquisition spending remain screening proxies.</p></div>
      </div>
    </div>
  );
}
