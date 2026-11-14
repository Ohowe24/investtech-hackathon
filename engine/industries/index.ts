// Registry of industry profiles. Add a profile here to make it selectable.

import { acquirers } from "./acquirers";
import { reits } from "./reits";
import type { IndustryProfile } from "./types";

export const industries: Record<string, IndustryProfile> = {
  [acquirers.id]: acquirers,
  [reits.id]: reits,
};

export const defaultIndustryId = acquirers.id;

export function getIndustry(id: string = defaultIndustryId): IndustryProfile {
  const profile = industries[id];
  if (!profile) throw new Error(`Unknown industry "${id}". Known: ${Object.keys(industries).join(", ")}`);
  return profile;
}

export type { IndustryProfile } from "./types";
