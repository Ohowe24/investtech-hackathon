"use client";

import type { Company, Dataset, MetricDef, YearRow } from "@contract/types";
import { formatMetric, formatValue, pct, recStyle, verdictStyle } from "@/lib/format";
import { scoredMetricInfo } from "@/lib/explain";
import { metricState, ordinal, ranking, scoredMetrics, stateBg, stateText } from "@/lib/rank";
import DealTimeline from "./DealTimeline";
import { Card, Explain } from "./ui";
import { C, ChartCard, SplitBar, TrendChart } from "./charts";
import { Decode, DecodeInView } from "./live/motion";

interface Props {
  dataset: Dataset;
  company: Company;
  onOpen: (ticker: string) => void;
  onBack: () => void;
}

/** One company: every number we have, each ranked against the other companies tested. */
export default function CompanyDashboard({ dataset, company, onOpen, onBack }: Props) {
  const tested = dataset.companies.filter((c) => c.model).sort((a, b) => a.model!.rank - b.model!.rank);
  const m = company.model;
  const i = tested.findIndex((c) => c.ticker === company.ticker);
  const prev = tested[i - 1];
  const next = tested[i + 1];
  const years = company.history?.map((h) => h.fiscalYear) ?? [];

  const scored = scoredMetrics(dataset);
  // Unscored metrics, shown only when this company has a value.
  const context = dataset.metricDefs.filter((d) => !scored.includes(d) && company.metrics[d.id]?.value != null);
  const failed = m?.checks.filter((k) => k.pass === false) ?? [];
  const noData = m?.checks.filter((k) => k.pass === null) ?? [];

  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));
  const sourceLabels = [...new Set(
    dataset.metricDefs.flatMap((d) => company.metrics[d.id]?.sourceIds ?? [])
      .map((id) => (sourceById.get(id)?.label ?? id).replace(/,?\s*FY\d{4}$/, "")),
  )];

  return (
    <div className="enter space-y-5">
      <div className="flex items-center justify-between text-[13px]">
        <button onClick={onBack} className="font-medium text-white/70 hover:text-white">← Companies</button>
        <div className="flex items-center gap-1 text-white/70">
          <NavBtn disabled={!prev} onClick={() => prev && onOpen(prev.ticker)} label={prev ? `Previous: ${prev.ticker}` : "Previous"}>‹</NavBtn>
          <span className="px-1 font-mono text-xs tabular-nums">{i + 1} / {tested.length}</span>
          <NavBtn disabled={!next} onClick={() => next && onOpen(next.ticker)} label={next ? `Next: ${next.ticker}` : "Next"}>›</NavBtn>
        </div>
      </div>

      <section data-guide="summary" className="spot scan-once rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-4">
            <span className="logo-scan grid h-12 w-16 place-items-center rounded-lg bg-ink font-mono text-sm font-semibold text-white">{company.ticker}</span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink"><Decode text={company.name} letters duration={700} /></h1>
              <div className="mt-0.5 text-xs text-muted">
                {[company.subSector, `HQ ${company.hqCountry}`, company.listedOn, years.length ? `FY${years[0]}–FY${years[years.length - 1]}` : null,
                  company.inIndex ? "In the index" : "Candidate"].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {m && <span className={`a-stamp rounded-full px-3 py-1.5 font-medium ${recStyle[m.recommendation].badge}`} style={{ animationDelay: "700ms" }}>{recStyle[m.recommendation].label}</span>}
            {!company.inIndex && (
              <span className={`a-stamp rounded-full px-3 py-1.5 font-medium ${verdictStyle[company.verdict].badge}`} style={{ animationDelay: "850ms" }}>{verdictStyle[company.verdict].label}</span>
            )}
          </div>
        </div>
        {m && (
          <div className="grid grid-cols-2 divide-line border-t border-line sm:grid-cols-4 sm:divide-x">
            <Stat label="Rank" value={`${m.rank}`} unit={`of ${tested.length}`} />
            <Stat label="Checks passed" value={`${m.checks.filter((k) => k.pass).length}`} unit={`of ${m.checks.filter((k) => k.pass !== null).length}`} />
            <Stat label="Weight" info={{ title: "Proposed weight", how: dataset.rules?.weight }}
              value={company.proposedWeightPct != null ? pct(company.proposedWeightPct, 2) : "—"} unit={company.inIndex ? "already held" : company.proposedWeightPct == null ? "not added" : "proposed"} />
            <div className="px-5 py-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Failed</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {failed.length === 0 && <span className="text-sm font-medium text-teal">None</span>}
                {failed.map((k) => <span key={k.id} className="rounded-md bg-badsoft px-2 py-0.5 text-xs font-medium text-bad">{k.label}</span>)}
                {noData.map((k) => <span key={k.id} className="rounded-md bg-soft px-2 py-0.5 text-xs text-muted">No data: {k.label}</span>)}
              </div>
            </div>
          </div>
        )}
      </section>

      <div data-guide="checks" className="stagger grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7" style={{ ["--d" as string]: "200ms" }}>
        {[...scored, ...context].map((d, i) => <MetricTile key={d.id} dataset={dataset} company={company} def={d} onOpen={onOpen} i={i} />)}
      </div>

      {company.history?.length ? <div data-guide="history" className="space-y-5"><DeepDive company={company} /></div> : null}

      {company.history?.length ? (
        <div data-guide="deals">
          <Card title="Acquisitions by year" right={<span className="text-xs text-faint">{company.reportingCurrency}</span>}>
            <DealTimeline dataset={dataset} company={company} />
          </Card>
        </div>
      ) : null}

      {company.history?.length ? <FinancialTable company={company} /> : null}

      {sourceLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
          <span className="mr-1">Sources</span>
          {sourceLabels.map((l) => <span key={l} className="chip !whitespace-normal">{l}</span>)}
        </div>
      )}
    </div>
  );
}

function NavBtn({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick} aria-label={label} title={label}
      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-white text-base leading-none text-ink hover:border-ink disabled:opacity-30 disabled:hover:border-line">
      {children}
    </button>
  );
}

function Stat({ label, value, unit, info }: { label: string; value: string; unit?: string; info?: { title: string; how?: string } }) {
  return (
    <div className="px-5 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {info ? <Explain info={info} className="uppercase tracking-wide">{label}</Explain> : label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <Decode text={value} delay={350} duration={800} className="font-mono text-xl font-semibold tabular-nums tracking-tight text-ink" />
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
    </div>
  );
}

/** One metric, small: the value, its pass lines, and where it sits among every company tested. */
function MetricTile({ dataset, company, def, onOpen, i }: { dataset: Dataset; company: Company; def: MetricDef; onOpen: (t: string) => void; i: number }) {
  const tested = dataset.companies.filter((c) => c.model);
  const mv = company.metrics[def.id];
  const checks = company.model?.checks.filter((k) => k.metricId === def.id) ?? [];
  const withData = ranking(tested, def).filter((c) => c.metrics[def.id]?.value != null);
  const pos = withData.findIndex((c) => c.ticker === company.ticker);
  const state = metricState(company, def.id);
  const lowFirst = def.higherIsBetter === false;

  return (
    <section data-guide={`metric:${def.id}`} className="spot flex min-w-0 flex-col rounded-lg border border-line bg-white p-3" title={mv?.note} style={{ ["--i" as string]: i }}>
      <Explain info={scoredMetricInfo(dataset, def.id)} className="truncate text-left text-[11px] font-medium text-muted">{def.short ?? def.label}</Explain>
      <div className={`mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums tracking-tight ${mv?.value == null ? "text-faint" : stateText[state]}`}>
        {mv?.value == null ? "—" : <Decode text={formatMetric(mv, def.unit)} delay={300 + i * 70} duration={700} />}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {checks.map((k) => (
          <span key={k.id} title={k.rule}
            className={`rounded px-1 py-px font-mono text-[10px] font-medium ${k.pass === null ? "bg-soft text-faint" : k.pass ? "bg-tealsoft text-teal" : "bg-badsoft text-bad"}`}>
            {k.pass === null ? "" : k.pass ? "✓ " : "✕ "}{k.target}
          </span>
        ))}
        {checks.length === 0 && <span className="rounded bg-soft px-1 py-px text-[10px] text-faint">Not scored</span>}
      </div>
      {pos >= 0 ? (
        <div className="mt-auto pt-2">
          <div className="flex items-end gap-px" role="img" aria-label={`Ranked ${pos + 1} of ${withData.length}`}>
            {withData.map((c, j) => {
              const me = c.ticker === company.ticker;
              return (
                <button key={c.ticker} onClick={() => onOpen(c.ticker)} title={`${c.ticker} · ${formatMetric(c.metrics[def.id], def.unit)}`}
                  style={{ transformOrigin: "center bottom", animationDelay: `${450 + i * 70 + j * 25}ms` }}
                  className={`a-grow-y flex-1 rounded-[2px] ${stateBg[metricState(c, def.id)]} ${me ? "h-3.5 shadow-[0_0_8px_rgba(61,220,108,0.9)]" : "h-2 opacity-30 hover:opacity-100"}`} />
              );
            })}
          </div>
          <div className="mt-1 text-[10px] text-faint">{ordinal(pos + 1)} {lowFirst ? "lowest" : "highest"} of {withData.length}</div>
        </div>
      ) : (
        <p className="mt-auto pt-2 text-[10px] leading-snug text-faint">{mv?.note ?? "No data."}</p>
      )}
    </section>
  );
}

const money = (v: number | null | undefined) => (v == null ? "—" : formatValue(v, "money"));
const pc = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const axisPct = (v: number) => `${Math.round(v * 100)}%`;
const axisX = (v: number) => `${v.toFixed(1)}×`;
const axisNum = (v: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v);

/** The company taken apart: latest-year figures, where the cash went, and nine charts by fiscal year. */
function DeepDive({ company }: { company: Company }) {
  const h = [...company.history!].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const years = h.map((r) => r.fiscalYear);
  const last = h[h.length - 1];
  const t = company.totals;
  const cur = company.reportingCurrency ?? "";
  const col = <K extends keyof YearRow>(k: K) => h.map((r) => r[k] as number | null | undefined);
  // Pass lines come from the model's checks. They are set on the whole-period figure, so on a yearly chart they are a guide.
  const line = (metricId: string) =>
    (company.model?.checks ?? []).filter((k) => k.metricId === metricId && k.threshold != null).map((k) => ({ value: k.threshold!, label: `Pass line ${k.target}` }));

  const kpis: [string, string, string?][] = [
    ["Revenue", money(last.revenue), last.revenueGrowth == null ? undefined : `${last.revenueGrowth >= 0 ? "+" : ""}${pc(last.revenueGrowth)} vs prior year`],
    ["EBITDA", money(last.ebitda), last.ebitdaMargin == null ? undefined : `${pc(last.ebitdaMargin)} of revenue`],
    ["Free cash flow", money(last.freeCashFlow), last.fcfMargin == null ? undefined : `${pc(last.fcfMargin)} of revenue`],
    ["Spent on acquisitions", money(last.acquisitions), last.acqToOcf == null ? undefined : `${pc(last.acqToOcf, 0)} of operating cash flow`],
    ["Net debt", money(last.netDebt), last.netDebtToEbitda == null ? undefined : `${last.netDebtToEbitda.toFixed(1)}× EBITDA`],
    ["Goodwill", money(last.goodwill), last.goodwillToEquity == null ? undefined : `${pc(last.goodwillToEquity, 0)} of equity`],
  ];

  return (
    <>
      <section className="spot rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">FY{last.fiscalYear} at a glance</h2>
          <span className="text-xs text-faint">{cur}</span>
        </div>
        <div className="grid grid-cols-2 gap-y-1 md:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-line">
          {kpis.map(([label, value, sub]) => (
            <div key={label} className="px-5 py-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
              <div className={`mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight ${value === "—" ? "text-faint" : "text-ink"}`}>
                {value === "—" ? value : <DecodeInView text={value} duration={800} />}
              </div>
              {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
            </div>
          ))}
        </div>
      </section>

      {t && t.operatingCashFlow != null && t.capex != null && t.acquisitions != null && t.fcfAfterAcquisitions != null && t.operatingCashFlow > 0 && (
        <ChartCard title={`Where the cash went, ${t.period}`}
          sub={`Operating cash flow of ${money(t.operatingCashFlow)} ${cur} over the period, split into capital spending, acquisitions and what was left.`}>
          {t.fcfAfterAcquisitions >= 0 && t.acquisitions >= 0 ? (
            <SplitBar fmt={money} parts={[
              { label: "Capital spending", value: t.capex, color: C.grey },
              { label: "Acquisitions", value: t.acquisitions, color: C.teal },
              { label: "Left for debt, buybacks, dividends", value: t.fcfAfterAcquisitions, color: C.sea },
            ]} />
          ) : (
            <SplitBar fmt={money} parts={[
              { label: "Operating cash flow", value: t.operatingCashFlow, color: C.sea },
              { label: "Capital spending", value: t.capex, color: C.grey },
              ...(t.acquisitions >= 0 ? [{ label: "Acquisitions", value: t.acquisitions, color: C.teal }] : []),
            ]} />
          )}
          <p className="mt-2 text-[11px] text-muted">
            {t.acquisitions < 0
              ? `Net seller: it received ${money(-t.acquisitions)} more from selling businesses than it paid to buy them.`
              : t.fcfAfterAcquisitions < 0
                ? `Acquisitions and capital spending were ${money(-t.fcfAfterAcquisitions)} more than operating cash flow. The gap was funded with debt, shares or cash on hand.`
                : "Acquisitions were paid for out of the company's own cash flow."}
            {t.revenueAdded != null && ` Revenue added over the period: ${money(t.revenueAdded)}.`}
            {t.goodwillAdded != null && ` Goodwill added: ${money(t.goodwillAdded)}.`}
          </p>
        </ChartCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue and growth" sub="Bars: revenue. Line: change from the year before.">
          <TrendChart years={years} fmtLeft={axisNum} fmtRight={axisPct} series={[
            { label: "Revenue", values: col("revenue"), kind: "bar", color: C.teal },
            { label: "Growth", values: col("revenueGrowth"), kind: "line", color: C.ink, axis: "right" },
          ]} />
        </ChartCard>
        <ChartCard title="Margins" sub="Share of each revenue dollar kept as EBITDA, operating cash flow and free cash flow.">
          <TrendChart years={years} fmtLeft={axisPct} series={[
            { label: "EBITDA", values: col("ebitdaMargin"), kind: "line", color: C.ink },
            { label: "Operating cash flow", values: col("ocfMargin"), kind: "line", color: C.teal },
            { label: "Free cash flow", values: col("fcfMargin"), kind: "line", color: C.ochre },
          ]} />
        </ChartCard>
        <ChartCard title="Cash in, cash out" sub="Cash the business made each year next to what it spent buying other businesses.">
          <TrendChart years={years} fmtLeft={axisNum} series={[
            { label: "Operating cash flow", values: col("operatingCashFlow"), kind: "bar", color: C.sea },
            { label: "Free cash flow", values: col("freeCashFlow"), kind: "bar", color: C.teal },
            { label: "Acquisitions", values: col("acquisitions"), kind: "bar", color: C.ink },
          ]} />
        </ChartCard>
        <ChartCard title="Acquisition pace" sub="Acquisition spending as a share of that year's operating cash flow. Above 100% means it needed outside money.">
          <TrendChart years={years} fmtLeft={axisPct} refs={line("acqIntensity")} series={[
            { label: "Acquisitions ÷ operating cash flow", values: col("acqToOcf"), kind: "line", color: C.teal },
          ]} />
        </ChartCard>
        <ChartCard title="Per share" sub="What each share earned in free cash flow, and the revenue behind each share.">
          <TrendChart years={years} fmtLeft={axisNum} fmtRight={axisNum} series={[
            { label: "Free cash flow per share", values: col("fcfPerShare"), kind: "line", color: C.ink },
            { label: "Revenue per share (right)", values: col("revenuePerShare"), kind: "line", color: C.sea, axis: "right", dashed: true },
          ]} />
        </ChartCard>
        <ChartCard title="Share count" sub="Diluted shares. Rising means owners are being diluted; falling means buybacks.">
          <TrendChart years={years} fmtLeft={axisNum} series={[
            { label: "Diluted shares", values: col("dilutedShares"), kind: "bar", color: C.grey },
          ]} />
        </ChartCard>
        <ChartCard title="Debt load" sub="Bars: debt minus cash. Line: that net debt against the year's EBITDA.">
          <TrendChart years={years} fmtLeft={axisNum} fmtRight={axisX}
            refs={line("netDebtToEbitda").map((r) => ({ ...r, axis: "right" as const }))} series={[
              { label: "Net debt", values: col("netDebt"), kind: "bar", color: C.sea },
              { label: "Net debt ÷ EBITDA", values: col("netDebtToEbitda"), kind: "line", color: C.ink, axis: "right" },
            ]} />
        </ChartCard>
        <ChartCard title="Returns and cash conversion" sub="Free cash flow against the capital invested, and against EBITDA.">
          <TrendChart years={years} fmtLeft={axisPct} fmtRight={axisPct} refs={line("cashReturn")} series={[
            { label: "Return on capital", values: col("cashReturn"), kind: "line", color: C.teal },
            { label: "Free cash flow ÷ EBITDA (right)", values: col("fcfConversion"), kind: "line", color: C.ochre, axis: "right", dashed: true },
          ]} />
        </ChartCard>
        <ChartCard title="Balance sheet" sub="Acquirers pile up goodwill: the premium paid over the assets bought. Line: goodwill against equity.">
          <TrendChart years={years} fmtLeft={axisNum} fmtRight={axisPct} series={[
            { label: "Debt", values: col("totalDebt"), kind: "bar", color: C.ink },
            { label: "Cash", values: col("cash"), kind: "bar", color: C.sea },
            { label: "Equity", values: col("totalEquity"), kind: "bar", color: C.teal },
            { label: "Goodwill", values: col("goodwill"), kind: "bar", color: C.grey },
            { label: "Goodwill ÷ equity", values: col("goodwillToEquity"), kind: "line", color: C.ochre, axis: "right" },
          ]} />
        </ChartCard>
        <ChartCard title="Capital spending" sub="Money put back into the existing business, and its share of revenue. Low means an asset-light business.">
          <TrendChart years={years} fmtLeft={axisNum} fmtRight={axisPct} series={[
            { label: "Capital spending", values: col("capex"), kind: "bar", color: C.grey },
            { label: "Share of revenue", values: col("capexIntensity"), kind: "line", color: C.ink, axis: "right" },
          ]} />
        </ChartCard>
      </div>
    </>
  );
}

/** Every yearly figure in one table. */
function FinancialTable({ company }: { company: Company }) {
  const h = [...company.history!].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const x = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}×`);
  const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
  const groups: [string, [string, keyof YearRow, (v: number | null | undefined) => string][]][] = [
    ["Income", [["Revenue", "revenue", money], ["Revenue growth", "revenueGrowth", pc], ["EBITDA", "ebitda", money], ["EBITDA margin", "ebitdaMargin", pc]]],
    ["Cash flow", [["Operating cash flow", "operatingCashFlow", money], ["Capital spending", "capex", money], ["Free cash flow", "freeCashFlow", money],
      ["Free cash flow margin", "fcfMargin", pc], ["Free cash flow ÷ EBITDA", "fcfConversion", pc], ["Acquisitions (net)", "acquisitions", money], ["Acquisitions ÷ operating cash flow", "acqToOcf", pc]]],
    ["Balance sheet", [["Debt", "totalDebt", money], ["Cash", "cash", money], ["Net debt", "netDebt", money], ["Net debt ÷ EBITDA", "netDebtToEbitda", x],
      ["Equity", "totalEquity", money], ["Goodwill", "goodwill", money], ["Goodwill ÷ equity", "goodwillToEquity", pc]]],
    ["Per share", [["Diluted shares", "dilutedShares", money], ["Free cash flow per share", "fcfPerShare", n2], ["Revenue per share", "revenuePerShare", n2], ["Return on capital", "cashReturn", pc]]],
  ];
  return (
    <Card title="All figures by year" right={<span className="text-xs text-faint">{company.reportingCurrency}</span>}>
      <div className="-mx-5 -my-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-line text-faint">
              <th className="px-5 py-2 text-left font-medium" />
              {h.map((r) => <th key={r.fiscalYear} className="px-3 py-2 text-right font-mono font-medium">FY{r.fiscalYear}</th>)}
            </tr>
          </thead>
          {groups.map(([name, rows]) => (
            <tbody key={name}>
              <tr><td colSpan={h.length + 1} className="bg-soft px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{name}</td></tr>
              {rows.map(([label, key, f]) => (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="px-5 py-1.5 text-muted">{label}</td>
                  {h.map((r) => {
                    const v = r[key] as number | null | undefined;
                    return <td key={r.fiscalYear} className={`px-3 py-1.5 text-right font-mono tabular-nums ${v == null ? "text-faint" : v < 0 ? "text-bad" : "text-ink"}`}>{f(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Card>
  );
}
