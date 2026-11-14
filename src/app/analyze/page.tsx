import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import Workbench from "@/components/Workbench";
import { fromSearch } from "@/lib/query";
import { runAnalysis } from "@/lib/server/analysis";

// The result of the onboarding. The address holds the whole question (industry, holdings, weights, cash),
// so a result can be reloaded, shared or edited. The engine runs here, on the server, per request.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AnalyzePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Loading />}>
      <Analysis searchParams={searchParams} />
    </Suspense>
  );
}

async function Analysis({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // the engine stamps each run with the time it ran, so this renders per request
  const params = await searchParams;
  const query = fromSearch(params);
  const result = query ? runAnalysis(query) : { ok: false as const, error: "The address has no industry or holdings." };
  if (!result.ok || !query) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 text-center">
        <h1 className="text-xl font-semibold text-white">Nothing to analyze</h1>
        <p className="mt-2 text-sm text-white/60">{result.ok ? "" : result.error}</p>
        <Link href="/" className="mx-auto mt-6 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink">Start over</Link>
      </div>
    );
  }
  return <Workbench dataset={result.dataset} snapshot={result.snapshot} query={query} weightRule={result.weightRule} />;
}

function Loading() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-3 px-5 font-mono text-xs text-white/60">
      <span className="live-dot" />
      Running the engine…
    </div>
  );
}
