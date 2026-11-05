import type { MediaCandidate, NormalizedInstagramUrl } from "../types.js";
import type { MediaResolver } from "./resolverTypes.js";

export class OfficialApiResolver implements MediaResolver {
  public readonly name = "instagram_official_api";

  public async resolve(_input: NormalizedInstagramUrl): Promise<readonly MediaCandidate[]> {
    // Placeholder for the authorized Meta/Instagram API path.
    // This resolver intentionally does nothing until OAuth/token configuration exists.
    return [];
  }
}
