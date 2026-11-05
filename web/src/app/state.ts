import type { ClientFrame, ProblemCode, ResolveResponse } from "../../../hosted/contract.js";

export interface Problem {
  readonly code: ProblemCode | "offline";
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

export type Preview = "loading" | "ready" | "failed";

export type Delivery =
  | { readonly tag: "queued" }
  | { readonly tag: "fetching" }
  | { readonly tag: "started" }
  | { readonly tag: "failed"; readonly message: string };

export type LinkStatus = "queued" | "reading" | "ready" | "empty" | "failed" | "expired";

/** A sheet is built by hand, so this is a guard against a pasted dump, not a quota. */
export const MAX_LINKS = 20;

export interface LinkInput {
  /** The canonical address: one link, one row, however it was pasted. */
  readonly key: string;
  readonly url: string;
  readonly label: string;
}

export interface SheetLink extends LinkInput {
  readonly status: LinkStatus;
  /** The last good read. It outlives a failed re-read, so the frames stay on the sheet. */
  readonly read: ResolveResponse | undefined;
  readonly problem: Problem | undefined;
  /** Why this link's references no longer work, if they don't. */
  readonly expired: false | "time" | "session";
  /** Marked frames a re-read couldn't find again. */
  readonly lostMarks: number;
}

export interface AppState {
  readonly closed: boolean;
  /** In the order they were added. Links are read one at a time, in this order. */
  readonly links: readonly SheetLink[];
  readonly fieldError: string | undefined;
  /** Frame ids, which name an image, not a place on the sheet. */
  readonly selected: ReadonlySet<string>;
  readonly previews: ReadonlyMap<string, Preview>;
  readonly deliveries: ReadonlyMap<string, Delivery>;
  readonly batchActive: boolean;
}

export const initialState: AppState = {
  closed: false,
  links: [],
  fieldError: undefined,
  selected: new Set(),
  previews: new Map(),
  deliveries: new Map(),
  batchActive: false
};

export type Action =
  | { readonly type: "hostedClosed" }
  | { readonly type: "linkRejected"; readonly message: string }
  | { readonly type: "linkEdited" }
  | { readonly type: "linksAdded"; readonly links: readonly LinkInput[] }
  | { readonly type: "readQueued"; readonly key: string }
  | { readonly type: "readStarted"; readonly key: string }
  | { readonly type: "readSucceeded"; readonly key: string; readonly read: ResolveResponse }
  | { readonly type: "readFailed"; readonly key: string; readonly problem: Problem }
  | { readonly type: "linkRemoved"; readonly key: string }
  | { readonly type: "linkExpired"; readonly key: string; readonly reason: "time" | "session" }
  | { readonly type: "frameToggled"; readonly id: string; readonly selected: boolean }
  | { readonly type: "selectionCleared" }
  | { readonly type: "previewSettled"; readonly id: string; readonly preview: Preview }
  | { readonly type: "batchStarted"; readonly ids: readonly string[] }
  | { readonly type: "delivery"; readonly id: string; readonly delivery: Delivery }
  | { readonly type: "batchFinished" };

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  return new Map(map).set(key, value);
}

function changeLink(state: AppState, key: string, change: (link: SheetLink) => SheetLink): AppState {
  return { ...state, links: state.links.map((link) => (link.key === key ? change(link) : link)) };
}

function linkFor(state: AppState, key: string): SheetLink | undefined {
  return state.links.find((link) => link.key === key);
}

function idsOnSheet(links: readonly SheetLink[]): ReadonlySet<string> {
  return new Set(links.flatMap((link) => (link.read?.frames ?? []).map((frame) => frame.id)));
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hostedClosed":
      return { ...state, closed: true };

    case "linkRejected":
      return { ...state, fieldError: action.message };

    case "linkEdited":
      return state.fieldError === undefined ? state : { ...state, fieldError: undefined };

    case "linksAdded": {
      const known = new Set(state.links.map((link) => link.key));
      const added = action.links
        .filter((link) => !known.has(link.key))
        .map((link): SheetLink => ({ ...link, status: "queued", read: undefined, problem: undefined, expired: false, lostMarks: 0 }));
      return { ...state, links: [...state.links, ...added], fieldError: undefined };
    }

    case "readQueued":
      return changeLink(state, action.key, (link) => ({ ...link, status: "queued", problem: undefined }));

    case "readStarted":
      return changeLink(state, action.key, (link) => ({ ...link, status: "reading" }));

    case "readSucceeded": {
      // Only the read this link is waiting for counts. A removed link has nothing to wait for.
      if (linkFor(state, action.key)?.status !== "reading") return state;

      const links = state.links.map(
        (link): SheetLink =>
          link.key === action.key
            ? {
                ...link,
                status: action.read.frames.length === 0 ? "empty" : "ready",
                read: action.read,
                problem: undefined,
                expired: false
              }
            : link
      );
      const onSheet = idsOnSheet(links);
      const selected = new Set([...state.selected].filter((id) => onSheet.has(id)));
      const lostMarks = state.selected.size - selected.size;

      // A fresh reference is a fresh chance for a preview that failed.
      const previews = new Map(state.previews);
      for (const frame of action.read.frames) {
        if (previews.get(frame.id) !== "ready") previews.set(frame.id, "loading");
      }
      return {
        ...state,
        links: links.map((link) => (link.key === action.key ? { ...link, lostMarks } : link)),
        selected,
        previews
      };
    }

    case "readFailed": {
      if (linkFor(state, action.key)?.status !== "reading") return state;
      if (action.problem.code === "closed") return { ...state, closed: true, links: [] };
      if (action.problem.code === "invalid_link" || action.problem.code === "unsupported_link") {
        return { ...state, links: state.links.filter((link) => link.key !== action.key), fieldError: action.problem.message };
      }
      // Marks outlive a failed attempt, so trying again can still carry them across.
      return changeLink(state, action.key, (link) => ({ ...link, status: "failed", problem: action.problem }));
    }

    case "linkRemoved": {
      const links = state.links.filter((link) => link.key !== action.key);
      const onSheet = idsOnSheet(links);
      return {
        ...state,
        links,
        selected: new Set([...state.selected].filter((id) => onSheet.has(id))),
        previews: new Map([...state.previews].filter(([id]) => onSheet.has(id))),
        deliveries: new Map([...state.deliveries].filter(([id]) => onSheet.has(id)))
      };
    }

    case "linkExpired":
      return linkFor(state, action.key)?.status === "ready"
        ? changeLink(state, action.key, (link) => ({ ...link, status: "expired", expired: action.reason }))
        : state;

    case "frameToggled": {
      const selected = new Set(state.selected);
      if (action.selected) selected.add(action.id);
      else selected.delete(action.id);
      return { ...state, selected };
    }

    case "selectionCleared":
      return { ...state, selected: new Set() };

    case "previewSettled":
      return { ...state, previews: withEntry(state.previews, action.id, action.preview) };

    case "batchStarted": {
      const deliveries = new Map(state.deliveries);
      for (const id of action.ids) deliveries.set(id, { tag: "queued" });
      return { ...state, deliveries, batchActive: true };
    }

    case "delivery":
      // The link may have been removed while its frame was on the way.
      if (!idsOnSheet(state.links).has(action.id)) return state;
      return { ...state, deliveries: withEntry(state.deliveries, action.id, action.delivery) };

    case "batchFinished": {
      const deliveries = new Map([...state.deliveries].filter(([, delivery]) => delivery.tag !== "queued"));
      return { ...state, deliveries, batchActive: false };
    }
  }
}

export interface Roll {
  readonly link: SheetLink;
  readonly post: readonly ClientFrame[];
  readonly nearby: readonly ClientFrame[];
  /** Frames this link found that another link already shows. */
  readonly repeated: number;
}

/**
 * Who shows an image when several links found it, strongest first. Every post
 * page repeats the account's newest posts as nearby thumbnails, so a post someone
 * pasted on purpose mustn't vanish into an earlier link's leftovers. A post's own
 * page also serves a fuller size of a file than a profile's tile does, and the
 * frame's reference is what gets downloaded.
 */
const OWNERSHIP: readonly ((frame: ClientFrame, link: SheetLink) => boolean)[] = [
  (frame, link) => frame.group === "post" && link.read?.source.routeType !== "profile",
  (frame) => frame.group === "post",
  () => true
];

/** Lays the sheet out link by link, with each image appearing once. */
export function rollsOf(state: AppState): readonly Roll[] {
  const owners = new Map<string, string>();
  for (const claims of OWNERSHIP) {
    for (const link of state.links) {
      for (const frame of link.read?.frames ?? []) {
        if (claims(frame, link) && !owners.has(frame.id)) owners.set(frame.id, link.key);
      }
    }
  }

  return state.links.map((link) => {
    const found = link.read?.frames ?? [];
    const shown = found.filter((frame) => owners.get(frame.id) === link.key);
    return {
      link,
      post: shown.filter((frame) => frame.group === "post"),
      nearby: shown.filter((frame) => frame.group === "nearby"),
      repeated: found.length - shown.length
    };
  });
}

export interface PlacedFrame {
  readonly frame: ClientFrame;
  readonly link: SheetLink;
}

/** Every frame on the sheet, in reading order. */
export function sheetFrames(state: AppState): readonly PlacedFrame[] {
  return rollsOf(state).flatMap(({ link, post, nearby }) => [...post, ...nearby].map((frame) => ({ frame, link })));
}

export function selectedInSheetOrder(state: AppState): readonly string[] {
  return sheetFrames(state)
    .filter(({ frame }) => state.selected.has(frame.id))
    .map(({ frame }) => frame.id);
}

/** Marked frames whose reference still works. The rest wait for their link to be read again. */
export function deliverableIds(state: AppState): readonly string[] {
  return sheetFrames(state)
    .filter(({ frame, link }) => state.selected.has(frame.id) && link.status === "ready")
    .map(({ frame }) => frame.id);
}

export function failedIds(state: AppState): readonly string[] {
  return [...state.deliveries].filter(([, delivery]) => delivery.tag === "failed").map(([id]) => id);
}

/** Only what is still marked and can still be fetched: unmarking a failed frame means it's no longer wanted. */
export function retryableIds(state: AppState): readonly string[] {
  const deliverable = new Set(deliverableIds(state));
  return failedIds(state).filter((id) => deliverable.has(id));
}

export function isReading(state: AppState): boolean {
  return state.links.some((link) => link.status === "queued" || link.status === "reading");
}
