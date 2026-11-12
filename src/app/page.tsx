import datasetJson from "@data/companies.json";
import snapshotJson from "@data/indexes.json";
import type { Dataset, IndexSnapshot } from "@contract/types";
import Workbench from "@/components/Workbench";

// The website only ever reads these two files:
//   data/companies.json  written by the engine (npm run engine)
//   data/indexes.json    the organizers' live holdings (npm run refresh-index)
const dataset = datasetJson as unknown as Dataset;
const snapshot = snapshotJson as unknown as IndexSnapshot;

export default function Home() {
  return <Workbench dataset={dataset} snapshot={snapshot} />;
}
