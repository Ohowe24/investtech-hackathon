"use client";

import { useEffect, useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import StartPage from "./StartPage";
import CompanyTable from "./CompanyTable";
import CompanyDashboard from "./CompanyDashboard";
import ScatterMap from "./ScatterMap";
import IndexBuilder from "./IndexBuilder";
import { Card } from "./ui";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
}

type Tab = "companies" | "map" | "index";
const TABS: { id: Tab; label: string }[] = [
  { id: "companies", label: "Companies" },
  { id: "map", label: "Map" },
  { id: "index", label: "Index" },
];

/** The whole app. The address hash holds the view (none = start page, #companies, #map, #index) or the open company (#c/CSU), so Back works. */
export default function Workbench({ dataset, snapshot }: Props) {
  const [hash, setHash] = useState<string | null>(null);
  const [scope, setScope] = useState<"ca" | "all">("ca");
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (to: string) => {
    window.location.hash = to;
    window.scrollTo({ top: 0 });
  };

  if (hash == null) return <div className="min-h-screen" />; // before the address is read
  const start = hash === "";
  const company = hash.startsWith("c/") ? (dataset.companies.find((c) => c.ticker === decodeURIComponent(hash.slice(2))) ?? null) : null;
  const tab: Tab = company ? "companies" : hash === "map" || hash === "index" ? hash : "companies";

  return (
    <div className="min-h-screen w-full">
      {dataset.isFake && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          FAKE SAMPLE DATA: not real companies or numbers
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-6 px-5 md:px-8">
          <button onClick={() => go("")} className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-ink">X</span>
            Acquirer X-ray
          </button>
          <nav className={`flex items-center gap-1 ${start ? "invisible" : ""}`}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          {!start && <span className="ml-auto hidden truncate text-xs text-white/50 sm:block">{dataset.indexName}</span>}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-5 py-6 md:px-8 md:py-8">
        {start ? (
          <StartPage dataset={dataset} snapshot={snapshot} onDone={() => go("companies")} />
        ) : company ? (
          <CompanyDashboard key={company.ticker} dataset={dataset} company={company} onOpen={(t) => go(`c/${t}`)} onBack={() => go("companies")} />
        ) : tab === "map" ? (
          <Card title="Acquisition spend vs FCF per share growth">
            <ScatterMap dataset={dataset} hovered={hovered} onHover={setHovered} onSelect={(t) => go(`c/${t}`)} />
          </Card>
        ) : tab === "index" ? (
          <IndexBuilder dataset={dataset} snapshot={snapshot} onOpen={(t) => go(`c/${t}`)} />
        ) : (
          <CompanyTable dataset={dataset} scope={scope} onScope={setScope} onOpen={(t) => go(`c/${t}`)} />
        )}
      </main>

      <footer className="px-5 pb-8 text-center text-[11px] text-white/50">
        Not investment advice · Onesheet API and SEDAR filings · {new Date(dataset.generatedAt).toLocaleDateString("en-CA")}
      </footer>
    </div>
  );
}
