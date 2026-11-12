// Downloads the organizers' latest live index holdings into data/indexes.json
import { writeFileSync } from "node:fs";

const res = await fetch("https://trimestre.ca/data/indexes.json");
if (!res.ok) throw new Error(`trimestre.ca returned ${res.status}`);
const json = await res.json();
writeFileSync("data/indexes.json", JSON.stringify(json, null, 2) + "\n");
console.log(`Saved data/indexes.json (updated ${json.updatedAt}, ${json.indexes.length} indexes)`);
