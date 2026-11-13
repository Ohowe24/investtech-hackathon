"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import StartPage from "./StartPage";
import CompanyTable from "./CompanyTable";
import CompanyDashboard from "./CompanyDashboard";
import ScatterMap from "./ScatterMap";
import IndexBuilder from "./IndexBuilder";
import RuleLab from "./RuleLab";
import Recommendation from "./Recommendation";
import { Card } from "./ui";
import RunSequence from "./live/RunSequence";
import LiveEffects from "./live/LiveEffects";
import { primeSound } from "./live/sound";
import { prefersReducedMotion, useNow } from "./live/motion";
import AssistantPanel from "./assistant/AssistantPanel";
import type { Action, GuideContext } from "@/lib/assistant/types";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
}

type Tab = "recommendation" | "companies" | "map" | "index" | "test";
const TABS: { id: Tab; label: string }[] = [
  { id: "recommendation", label: "Recommendation" },
  { id: "companies", label: "Companies" },
  { id: "map", label: "Map" },
  { id: "index", label: "Index" },
  { id: "test", label: "Tested thesis" },
];

/** The whole app. The address hash holds the view (none = start page, #recommendation, #companies, #map, #index, #test) or the open company (#c/CSU), so Back works. */
export default function Workbench({ dataset, snapshot }: Props) {
  const [hash, setHash] = useState<string | null>(null);
  const [scope, setScope] = useState<"ca" | "all">("ca");
  const [hovered, setHovered] = useState<string | null>(null);
  // The engine run overlay: where to land when it ends (null = stay), and how many runs so far.
  const [run, setRun] = useState<{ to: string | null } | null>(null);
  const [runs, setRuns] = useState(0);
  // Bumped after each run so every view replays its entrance.
  const [epoch, setEpoch] = useState(0);
  // The Guide: open or not, a dot when it noticed something while closed, and what it asked the page to do.
  // Nothing renders until the address is read, so reading the browser here cannot cause a hydration mismatch.
  const [guideOpen, setGuideOpen] = useState(readGuideOpen);
  const [unread, setUnread] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ tickers: string[]; title: string } | null>(null);

  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const toggleGuide = useCallback((next?: boolean, remember = true) => {
    setGuideOpen((o) => {
      const v = next ?? !o;
      if (remember) try { window.localStorage.setItem("guide-open", v ? "1" : "0"); } catch {}
      if (v) { setUnread(false); setFocusKey((k) => k + 1); }
      return v;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleGuide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGuide]);

  // Scroll to a [data-guide] element and flash it, once the page it lives on has rendered.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-guide="${CSS.escape(flash)}"]`);
      setFlash(null);
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      el.classList.remove("guide-flash");
      void el.offsetWidth;
      el.classList.add("guide-flash");
      setTimeout(() => el.classList.remove("guide-flash"), 2600);
    }, 450);
    return () => clearTimeout(t);
  }, [flash, hash]);
  const go = (to: string) => {
    window.location.hash = to;
    window.scrollTo({ top: 0 });
  };
  const onGuideAction = (a: Action) => {
    if (a.kind === "open") {
      go(`c/${a.ticker}`);
    } else if (a.kind === "view") {
      go(a.view === "start" ? "" : a.view);
      if (a.focus) setHovered(a.focus);
      if (a.view === "map") setFlash("map");
    } else if (a.kind === "highlight") {
      const dest = a.ticker ? `c/${a.ticker}` : a.view && a.view !== "start" ? a.view : null;
      if (dest != null && dest !== hash) go(dest);
      setFlash(a.target);
    } else if (a.kind === "filter") {
      setFilter({ tickers: a.tickers, title: a.title });
      if (hash !== "companies") go("companies");
      setFlash("table");
    }
    // On a phone the panel covers the page: get out of the way.
    if (!window.matchMedia("(min-width: 1024px)").matches) toggleGuide(false, false);
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
  const start = hash === "";
  const company = hash.startsWith("c/") ? (dataset.companies.find((c) => c.ticker === decodeURIComponent(hash.slice(2))) ?? null) : null;
  const tab: Tab = company ? "companies" : hash === "map" || hash === "index" || hash === "test" || hash === "recommendation" ? hash : "companies";
  const guideContext: GuideContext = start ? { view: "start" } : company ? { view: "companies", ticker: company.ticker } : { view: tab };
  const docked = guideOpen && !start;

  return (
    <div className={`min-h-screen w-full transition-[padding] duration-300 ${docked ? "lg:pr-[400px]" : ""}`}>
      {dataset.isFake && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          FAKE SAMPLE DATA: not real companies or numbers
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 flex-wrap w-full max-w-[1240px] items-center gap-x-6 gap-y-2 px-5 py-2 md:px-8">
          <button onClick={() => go("")} className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
            <span className="logo-scan grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-ink">X</span>
            Acquirer X-ray
          </button>
          <nav aria-label="Main navigation" className={`flex max-w-full overflow-x-auto items-center gap-1 ${start ? "invisible" : ""}`}>
            {TABS.map((t) => (
              <button key={t.id} aria-current={tab === t.id && !start ? "page" : undefined} onClick={() => go(t.id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LiveClock updatedAt={snapshot.updatedAt} />
            {!start && (
              <button onClick={() => toggleGuide()} aria-pressed={guideOpen} title="Open the Guide (⌘K)"
                className={`relative flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${guideOpen ? "border-signal/60 bg-signal/10 text-signal" : "border-white/15 text-white/80 hover:border-signal/60 hover:text-white"}`}>
                <span aria-hidden>✦</span> Guide
                <kbd className="hidden rounded bg-white/10 px-1 font-mono text-[10px] text-white/50 xl:inline">⌘K</kbd>
                {unread && !guideOpen && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-signal shadow-[0_0_8px_rgba(61,220,108,0.9)]" aria-label="New note from the Guide" />}
              </button>
            )}
            {!start && (
              <button onClick={() => startRun(null)} title="Replay the engine run"
                className="group flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-medium text-white/80 transition-colors hover:border-signal/60 hover:text-white">
                <span className="inline-block transition-transform duration-500 group-hover:rotate-180">⟳</span> Re-run
              </button>
            )}
          </div>
        </div>
      </header>

      <main key={`${hash}|${epoch}`} className="enter mx-auto w-full max-w-[1240px] px-5 py-6 md:px-8 md:py-8">
        {start ? (
          <StartPage dataset={dataset} snapshot={snapshot} onDone={() => startRun("recommendation")} />
        ) : company ? (
          <CompanyDashboard key={company.ticker} dataset={dataset} company={company} onOpen={(t) => go(`c/${t}`)} onBack={() => go("companies")} />
        ) : tab === "recommendation" ? (
          <div data-guide="recommendation"><Recommendation dataset={dataset} snapshot={snapshot} onOpen={(t) => go(`c/${t}`)} /></div>
        ) : tab === "map" ? (
          <div data-guide="map">
            <Card title="Acquisition spend vs FCF per share growth">
              <ScatterMap dataset={dataset} hovered={hovered} onHover={setHovered} onSelect={(t) => go(`c/${t}`)} />
            </Card>
          </div>
        ) : tab === "test" ? (
          <div data-guide="test"><RuleLab dataset={dataset} onOpen={(t) => go(`c/${t}`)} /></div>
        ) : tab === "index" ? (
          <div data-guide="index"><IndexBuilder dataset={dataset} snapshot={snapshot} onOpen={(t) => go(`c/${t}`)} /></div>
        ) : (
          <CompanyTable dataset={dataset} scope={scope} onScope={setScope} onOpen={(t) => go(`c/${t}`)}
            filter={filter} onClearFilter={() => setFilter(null)} />
        )}
      </main>

      <footer className="px-5 pb-8 text-center text-[11px] text-white/50">
        Not investment advice · Onesheet API and SEDAR filings · {new Date(dataset.generatedAt).toLocaleDateString("en-CA")}
      </footer>

      {/* Docked on the right on wide screens; a sheet over the page on phones. Always mounted so it keeps following you. */}
      <div className={docked ? "contents" : "hidden"}>
        <button type="button" aria-label="Close the guide" onClick={() => toggleGuide(false)} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden" />
        <aside aria-label="Guide"
          className="guide-panel fixed inset-x-0 bottom-0 z-50 h-[84dvh] overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#070707]/95 shadow-[0_-20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[400px] lg:rounded-none lg:border-l lg:border-t-0">
          <AssistantPanel dataset={dataset} snapshot={snapshot} open={docked} context={guideContext} focusKey={focusKey}
            onClose={() => toggleGuide(false)} onUnread={() => setUnread(true)} onAction={onGuideAction} />
        </aside>
      </div>

      <LiveEffects />
      {run && <RunSequence dataset={dataset} runNo={runs} onDone={endRun} />}
    </div>
  );
}

/** Open by default on wide screens, unless it was closed last time. */
function readGuideOpen(): boolean {
  if (typeof window === "undefined") return false;
  let saved: string | null = null;
  try { saved = window.localStorage.getItem("guide-open"); } catch {}
  return saved ? saved === "1" : window.matchMedia("(min-width: 1024px)").matches;
}

/** A pulsing LIVE marker with the local time, ticking. Hover for when the organizers' holdings were last pulled. */
function LiveClock({ updatedAt }: { updatedAt: string }) {
  const now = useNow(1000);
  return (
    <span title={`Organizers' holdings as of ${new Date(updatedAt).toLocaleString("en-CA")}`}
      className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-white/70 sm:flex">
      <span className="live-dot" />
      <span className="font-semibold tracking-[0.14em] text-signal">LIVE</span>
      <span className="tabular-nums">{new Date(now).toLocaleTimeString("en-CA", { hour12: false })}</span>
    </span>
  );
}
