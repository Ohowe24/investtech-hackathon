"use client";

import { useEffect, useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import Link from "next/link";
import Ranking from "./Ranking";
import CompanyTable from "./CompanyTable";
import CompanyDashboard from "./CompanyDashboard";
import ScatterMap from "./ScatterMap";
import Recommendation from "./Recommendation";
import OutlookEngine from "./OutlookEngine";
import IndexBuilder from "./IndexBuilder";
import Jarvis from "./jarvis/Jarvis";
import { Card } from "./ui";
import EngineReplay from "./live/EngineReplay";
import LiveEffects from "./live/LiveEffects";
import { primeSound } from "./live/sound";
import { prefersReducedMotion, useNow } from "./live/motion";
import { toSearch, type AnalysisQuery } from "@/lib/query";
import { panelsClass, ThemeSwitch, usePanelTheme } from "./theme";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  /** the onboarding's answer that produced this dataset */
  query: AnalysisQuery;
}

type Tab = "ranking" | "recommendation" | "companies" | "map" | "outlook" | "index";
const TABS: { id: Tab; label: string }[] = [
  { id: "ranking", label: "Ranking" },
  { id: "recommendation", label: "Recommendation" },
  { id: "companies", label: "Companies" },
  { id: "map", label: "Map" },
  { id: "outlook", label: "Outlook engine" },
];

/** The results. The address hash holds the view (none = ranking, #recommendation, #companies or #map) or the open company (#c/CSU), so Back works. */
export default function Workbench({ dataset, snapshot, query }: Props) {
  const [hash, setHash] = useState<string | null>(null);
  const [scope, setScope] = useState<"ca" | "held" | "all">("ca");
  const [hovered, setHovered] = useState<string | null>(null);
  // The engine run overlay: where to land when it ends (null = stay), and how many runs so far.
  const [run, setRun] = useState<{ to: string | null } | null>(null);
  const [runs, setRuns] = useState(0);
  // Panel look: dark glass (default) or light, shared with the front page.
  const theme = usePanelTheme();
  // Bumped after each run so every view replays its entrance.
  const [epoch, setEpoch] = useState(0);
  // Generated index ("Choose your own" industries): play the build when the button is pressed; show its tab once built.
  const canIndex = dataset.industryId.startsWith("custom:");
  const indexKey = `index-built:${toSearch(query)}`;
  const [indexFresh, setIndexFresh] = useState(false);
  const [indexBuilt, setIndexBuilt] = useState(false);
  useEffect(() => {
    const read = () => { try { setIndexBuilt(window.sessionStorage.getItem(indexKey) === "1"); } catch {} };
    read();
  }, [indexKey]);
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, ""));
    read();
    // Just submitted from the onboarding: play the engine run once.
    const autoplay = () => {
      let fresh = false;
      try { fresh = window.sessionStorage.getItem("engine-run") === "1"; window.sessionStorage.removeItem("engine-run"); } catch {}
      if (fresh && !prefersReducedMotion()) { setRuns(1); setRun({ to: null }); }
    };
    autoplay();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = (to: string) => {
    window.location.assign(`#${to}`);
    window.scrollTo({ top: 0 });
  };
  const startRun = (to: string | null) => {
    if (prefersReducedMotion()) {
      if (to != null) go(to);
      setEpoch((e) => e + 1);
      return;
    }
    primeSound();
    setRuns((n) => n + 1);
    setRun({ to });
  };
  const endRun = () => {
    const to = run?.to;
    setRun(null);
    if (to != null) go(to);
    setEpoch((e) => e + 1);
  };

  if (hash == null) return <div className="min-h-screen" />; // before the address is read
  const start = hash === "" || hash === "ranking";
  const tabs = canIndex && (indexBuilt || hash === "index") ? [...TABS, { id: "index" as const, label: "Your index" }] : TABS;
  const generateIndex = () => {
    setIndexFresh(true);
    if (hash === "index") setEpoch((e) => e + 1);
    else go("index");
  };
  const indexReady = () => {
    setIndexFresh(false);
    setIndexBuilt(true);
    try { window.sessionStorage.setItem(indexKey, "1"); } catch {}
  };
  const editHref = `/?${toSearch(query)}`;
  // Re-run the engine with more (or only the provided) candidates, replaying the run, and land on Companies.
  const rerun = (more: boolean) => {
    try { window.sessionStorage.setItem("engine-run", "1"); } catch {}
    window.location.assign(`/analyze?${toSearch({ ...query, more: more || undefined })}#companies`);
  };
  const company = hash.startsWith("c/") ? (dataset.companies.find((c) => c.ticker === decodeURIComponent(hash.slice(2))) ?? null) : null;
  const tab: Tab = start ? "ranking" : company ? "companies" : hash === "map" || hash === "recommendation" || (hash === "index" && canIndex) ? hash : hash === "outlook" || hash.startsWith("outlook/") ? "outlook" : "companies";

  return (
    <div className="min-h-screen w-full">
      {dataset.isFake && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          FAKE SAMPLE DATA: not real companies or numbers
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 flex-wrap w-full max-w-[1240px] items-center gap-x-6 gap-y-2 px-5 py-2 md:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white" title="Start a new analysis">
            <span className="logo-scan grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-ink">X</span>
            Index X-ray
          </Link>
          <Link href={editHref} title="Change the industry or the holdings"
            className="hidden items-center gap-1.5 rounded-md border border-white/15 px-2 py-1 text-[12px] text-white/75 transition-colors hover:border-white/40 hover:text-white md:flex">
            {dataset.industryName ?? dataset.industryId}{dataset.companies.some((c) => c.inIndex) ? ` · ${dataset.companies.filter((c) => c.inIndex).length} of your stocks` : ""} <span className="text-white/40">✎</span>
          </Link>
          <nav aria-label="Main navigation" className="flex max-w-full overflow-x-auto items-center gap-1">
            {tabs.map((t) => (
              <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id === "ranking" ? "" : t.id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {canIndex && (
              <button onClick={generateIndex} title="Turn these companies into a $100,000 index, back-test it and project it forward"
                className="group flex items-center gap-1.5 rounded-md bg-signal px-3 py-1 text-[12px] font-semibold text-[#03160a] shadow-[0_0_24px_-6px_rgba(61,220,108,0.8)] transition-transform hover:-translate-y-px">
                <span className="inline-block transition-transform duration-500 group-hover:rotate-90">✦</span> Generate index
              </button>
            )}
            <ThemeSwitch />
            <LiveClock updatedAt={snapshot.updatedAt} source={snapshot.source} />
            <button onClick={() => startRun(null)} title="Replay the engine run"
              className="group flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-medium text-white/80 transition-colors hover:border-signal/60 hover:text-white">
              <span className="inline-block transition-transform duration-500 group-hover:rotate-180">⟳</span> Re-run
            </button>
          </div>
        </div>
      </header>

      <main key={`${hash}|${epoch}`} className={`${panelsClass(theme)} enter mx-auto w-full max-w-[1240px] px-5 py-6 md:px-8 md:py-8`}>
        {start ? (
          <div>
            <Ranking dataset={dataset} snapshot={snapshot} editHref={editHref} onOpen={(t) => go(`c/${t}`)} onGo={go} />
          </div>
        ) : company ? (
          <CompanyDashboard key={company.ticker} dataset={dataset} company={company} onOpen={(t) => go(`c/${t}`)} onBack={() => go("companies")} />
        ) : tab === "recommendation" ? (
          <div><Recommendation dataset={dataset} snapshot={snapshot} onOpen={(t) => go(`c/${t}`)} /></div>
        ) : tab === "outlook" ? (
          <OutlookEngine initial={hash.startsWith("outlook/") ? decodeURIComponent(hash.slice(8)) : undefined} />
        ) : tab === "index" ? (
          <IndexBuilder dataset={dataset} fresh={indexFresh} onBuilt={indexReady} onOpen={(t) => go(`c/${t}`)} />
        ) : tab === "map" ? (
          <div>
            <Card title={dataset.mapTitle ?? "Map"}>
              <ScatterMap dataset={dataset} hovered={hovered} onHover={setHovered} onSelect={(t) => go(`c/${t}`)} />
            </Card>
          </div>
        ) : (
          <CompanyTable dataset={dataset} scope={scope} onScope={setScope} onOpen={(t) => go(`c/${t}`)} onCandidates={rerun} />
        )}
      </main>

      <footer className="px-5 pb-8 text-center text-[11px] text-white/50">
        Not investment advice · Onesheet API and SEDAR filings · {new Date(dataset.generatedAt).toLocaleDateString("en-CA")}
      </footer>

      <Jarvis dataset={dataset} query={query} />
      <LiveEffects />
      {run && <EngineReplay dataset={dataset} runNo={runs} onDone={endRun} />}
    </div>
  );
}

/** A pulsing LIVE marker with the local time, ticking. Hover for when the organizers' holdings were last pulled. */
function LiveClock({ updatedAt, source }: { updatedAt: string; source: string }) {
  const now = useNow(1000);
  return (
    <span title={`Holdings: ${source}, as of ${new Date(updatedAt).toLocaleString("en-CA")}`}
      className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-white/70 sm:flex">
      <span className="live-dot" />
      <span className="font-semibold tracking-[0.14em] text-signal">LIVE</span>
      <span className="tabular-nums">{new Date(now).toLocaleTimeString("en-CA", { hour12: false })}</span>
    </span>
  );
}

