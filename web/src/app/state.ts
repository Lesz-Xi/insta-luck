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

export type Phase = "idle" | "closed" | "resolving" | "failed" | "empty" | "results";

export interface AppState {
  readonly phase: Phase;
  /** The one resolve whose answer counts. Any other answer is stale. */
  readonly requestId: number;
  readonly sheet: ResolveResponse | undefined;
  readonly problem: Problem | undefined;
  readonly fieldError: string | undefined;
  readonly selected: ReadonlySet<string>;
  readonly previews: ReadonlyMap<string, Preview>;
  readonly deliveries: ReadonlyMap<string, Delivery>;
  readonly batchActive: boolean;
  /** Why this sheet's references no longer work, if they don't. */
  readonly expired: false | "time" | "session";
  /** Selected frames a re-resolve could not find again. */
  readonly lostSelection: number;
}

export const initialState: AppState = {
  phase: "idle",
  requestId: 0,
  sheet: undefined,
  problem: undefined,
  fieldError: undefined,
  selected: new Set(),
  previews: new Map(),
  deliveries: new Map(),
  batchActive: false,
  expired: false,
  lostSelection: 0
};

export type Action =
  | { readonly type: "hostedClosed" }
  | { readonly type: "linkRejected"; readonly message: string }
  | { readonly type: "linkEdited" }
  | { readonly type: "resolveStarted"; readonly requestId: number; readonly keepSelection: boolean }
  | { readonly type: "resolveCancelled"; readonly requestId: number }
  | { readonly type: "resolveSucceeded"; readonly requestId: number; readonly sheet: ResolveResponse }
  | { readonly type: "resolveFailed"; readonly requestId: number; readonly problem: Problem }
  | { readonly type: "frameToggled"; readonly id: string; readonly selected: boolean }
  | { readonly type: "selectionCleared" }
  | { readonly type: "previewSettled"; readonly id: string; readonly preview: Preview }
  | { readonly type: "batchStarted"; readonly ids: readonly string[] }
  | { readonly type: "delivery"; readonly id: string; readonly delivery: Delivery }
  | { readonly type: "batchFinished" }
  | { readonly type: "selectionExpired"; readonly reason: "time" | "session" };

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  return new Map(map).set(key, value);
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hostedClosed":
      return state.phase === "idle" ? { ...state, phase: "closed" } : state;

    case "linkRejected":
      return { ...state, fieldError: action.message };

    case "linkEdited":
      return state.fieldError === undefined ? state : { ...state, fieldError: undefined };

    case "resolveStarted":
      return {
        ...initialState,
        phase: "resolving",
        requestId: action.requestId,
        selected: action.keepSelection ? state.selected : new Set()
      };

    case "resolveCancelled":
      if (action.requestId !== state.requestId || state.phase !== "resolving") return state;
      return { ...initialState, requestId: state.requestId, selected: state.selected };

    case "resolveSucceeded": {
      if (action.requestId !== state.requestId || state.phase !== "resolving") return state;
      const known = new Set(action.sheet.frames.map((frame) => frame.id));
      const selected = new Set([...state.selected].filter((id) => known.has(id)));
      return {
        ...state,
        phase: action.sheet.frames.length === 0 ? "empty" : "results",
        sheet: action.sheet,
        selected,
        lostSelection: state.selected.size - selected.size,
        previews: new Map(action.sheet.frames.map((frame) => [frame.id, "loading" as const]))
      };
    }

    case "resolveFailed":
      if (action.requestId !== state.requestId || state.phase !== "resolving") return state;
      if (action.problem.code === "closed") return { ...initialState, phase: "closed", requestId: state.requestId };
      if (action.problem.code === "invalid_link" || action.problem.code === "unsupported_link") {
        return { ...initialState, requestId: state.requestId, selected: state.selected, fieldError: action.problem.message };
      }
      // Marks outlive a failed attempt, so trying again can still carry them across.
      return { ...initialState, phase: "failed", requestId: state.requestId, selected: state.selected, problem: action.problem };

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
      return { ...state, deliveries: withEntry(state.deliveries, action.id, action.delivery) };

    case "batchFinished": {
      const deliveries = new Map([...state.deliveries].filter(([, delivery]) => delivery.tag !== "queued"));
      return { ...state, deliveries, batchActive: false };
    }

    case "selectionExpired":
      return state.phase === "results" ? { ...state, expired: action.reason } : state;
  }
}

export function framesInGroup(state: AppState, group: ClientFrame["group"]): readonly ClientFrame[] {
  return state.sheet?.frames.filter((frame) => frame.group === group) ?? [];
}

export function failedIds(state: AppState): readonly string[] {
  return [...state.deliveries].filter(([, delivery]) => delivery.tag === "failed").map(([id]) => id);
}

/** Only what is still marked: unmarking a failed frame means it's no longer wanted. */
export function retryableIds(state: AppState): readonly string[] {
  return failedIds(state).filter((id) => state.selected.has(id));
}

export function selectedInSheetOrder(state: AppState): readonly string[] {
  return state.sheet?.frames.filter((frame) => state.selected.has(frame.id)).map((frame) => frame.id) ?? [];
}
