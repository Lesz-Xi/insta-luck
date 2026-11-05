import type { MediaCandidate, NormalizedInstagramUrl } from "../types.js";

export interface MediaResolver {
  readonly name: string;
  resolve(input: NormalizedInstagramUrl): Promise<readonly MediaCandidate[]>;
}

export interface RawMediaCandidate {
  readonly sourceName: string;
  readonly remoteUrl: string;
  readonly altText?: string;
  readonly contextText?: string;
  readonly ordinal: number;
}
