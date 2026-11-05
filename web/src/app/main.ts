import { CollectorError } from "../../../tools/photography-collector/src/errors.js";
import { normalizeInstagramUrl } from "../../../tools/photography-collector/src/instagramUrl.js";
import type { ClientFrame } from "../../../hosted/contract.js";
import { fetchFile, fetchOpen, handOff, previewUrl, ProblemError, resolvePost } from "./api.js";
import {
  captionFor,
  frameLabel,
  LINK_ERRORS,
  nearbyNote,
  noticeFor,
  primaryGroupTitle,
  reasonFor,
  resultsNote,
  resultsTitle,
  statusLine,
  trayCount,
  trayStatus
} from "./copy.js";
import { framesInGroup, initialState, reduce, retryableIds, selectedInSheetOrder, type Action, type AppState } from "./state.js";

/** Browsers can drop downloads requested in the same instant. */
const DOWNLOAD_SPACING_MS = 350;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const ui = {
  form: byId<HTMLFormElement>("find-form"),
  input: byId<HTMLInputElement>("post-link"),
  find: byId<HTMLButtonElement>("find-button"),
  cancel: byId<HTMLButtonElement>("cancel-button"),
  error: byId("post-error"),
  notice: byId("notice"),
  noticeText: byId("notice-text"),
  noticeAction: byId<HTMLButtonElement>("notice-action"),
  noticeLink: byId<HTMLAnchorElement>("notice-link"),
  status: byId("status"),
  elapsed: byId("elapsed"),
  results: byId("results"),
  title: byId("results-title"),
  source: byId("results-source"),
  note: byId("results-note"),
  groupPost: byId("group-post"),
  groupPostTitle: byId("group-post-title"),
  sheetPost: byId<HTMLUListElement>("sheet-post"),
  groupNearby: byId("group-nearby"),
  groupNearbyNote: byId("group-nearby-note"),
  sheetNearby: byId<HTMLUListElement>("sheet-nearby"),
  trayCount: byId("tray-count"),
  trayStatus: byId("tray-status"),
  clear: byId<HTMLButtonElement>("clear-button"),
  retry: byId<HTMLButtonElement>("retry-button"),
  download: byId<HTMLButtonElement>("download-button"),
  loupe: byId<HTMLDialogElement>("loupe"),
  loupeTitle: byId("loupe-title"),
  loupeImage: byId<HTMLImageElement>("loupe-image"),
  loupeReason: byId("loupe-reason"),
  loupeAlt: byId("loupe-alt"),
  loupePrev: byId<HTMLButtonElement>("loupe-prev"),
  loupeNext: byId<HTMLButtonElement>("loupe-next"),
  loupeCheck: byId<HTMLInputElement>("loupe-check")
};

const SVG_NS = "http://www.w3.org/2000/svg";
const MARK_VARIANTS = ["a", "b", "c"] as const;

interface FrameView {
  readonly checkbox: HTMLInputElement;
  readonly plate: HTMLElement;
  readonly image: HTMLImageElement;
  readonly state: HTMLElement;
  readonly inspect: HTMLButtonElement;
  attempt: number;
}

let state: AppState = initialState;
let renderedSheet: AppState["sheet"];
let requestCounter = 0;
let resolving: { readonly id: number; readonly url: string; readonly controller: AbortController } | undefined;
let batch: AbortController | undefined;
let expiryTimer: number | undefined;
let elapsedTimer: number | undefined;
let lastUrl = "";
let loupeFrameId: string | undefined;
let loupeOpener: HTMLElement | undefined;
const frameViews = new Map<string, FrameView>();

function dispatch(action: Action): void {
  state = reduce(state, action);
  render();
}

function svgUse(className: string, viewBox: string, href: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", href);
  svg.append(use);
  return svg;
}

function loupeIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const lens = document.createElementNS(SVG_NS, "circle");
  lens.setAttribute("cx", "8.500");
  lens.setAttribute("cy", "8.500");
  lens.setAttribute("r", "5.500");
  const handle = document.createElementNS(SVG_NS, "path");
  handle.setAttribute("d", "M12.700 12.700 17.500 17.500");
  svg.append(lens, handle);
  return svg;
}

function buildFrame(frame: ClientFrame): HTMLLIElement {
  const label = frameLabel(frame.number);
  const reason = reasonFor(frame);

  const item = document.createElement("li");
  item.className = "frame";
  item.dataset.id = frame.id;

  const hit = document.createElement("label");
  hit.className = "frame-hit";

  const checkbox = document.createElement("input");
  checkbox.className = "frame-check";
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", `Mark frame ${label}. ${reason}`);
  checkbox.addEventListener("change", () => {
    dispatch({ type: "frameToggled", id: frame.id, selected: checkbox.checked });
  });

  const plate = document.createElement("span");
  plate.className = "frame-plate";
  plate.dataset.preview = "loading";

  const image = document.createElement("img");
  // Set as a property from a sanitized string; alt text is never parsed as markup.
  image.alt = frame.altText ?? `Frame ${label}`;
  image.decoding = "async";
  image.loading = "lazy";
  // Frame ids survive a re-resolve, so an image from an earlier sheet can still settle here. Only the current one counts.
  const isCurrent = (): boolean => frameViews.get(frame.id)?.image === image;
  image.addEventListener("load", () => {
    if (isCurrent()) dispatch({ type: "previewSettled", id: frame.id, preview: "ready" });
  });
  image.addEventListener("error", () => {
    if (isCurrent()) dispatch({ type: "previewSettled", id: frame.id, preview: "failed" });
  });
  image.src = previewUrl(frame);
  plate.append(image);

  const box = document.createElement("span");
  box.className = "frame-box";
  box.setAttribute("aria-hidden", "true");
  box.append(svgUse("", "0 0 14 14", "#tick"));

  const variant = MARK_VARIANTS[frame.number % MARK_VARIANTS.length] ?? "a";
  hit.append(checkbox, plate, svgUse("frame-mark", "0 0 500 600", `#mark-${variant}`), box);

  const caption = document.createElement("div");
  caption.className = "frame-caption";

  const number = document.createElement("span");
  number.className = "frame-number";
  number.textContent = label;

  const reasonText = document.createElement("span");
  reasonText.className = "frame-reason";
  reasonText.textContent = captionFor(frame) ?? "";

  const inspect = document.createElement("button");
  inspect.className = "frame-inspect";
  inspect.type = "button";
  inspect.setAttribute("aria-label", `Inspect frame ${label} at full size`);
  inspect.append(loupeIcon());
  inspect.addEventListener("click", () => {
    openLoupe(frame.id, inspect);
  });

  const stateLine = document.createElement("span");
  stateLine.className = "frame-state";

  caption.append(number, reasonText, inspect, stateLine);
  item.append(hit, caption);

  frameViews.set(frame.id, { checkbox, plate, image, state: stateLine, inspect, attempt: 0 });
  return item;
}

function retryPreview(frame: ClientFrame): void {
  const view = frameViews.get(frame.id);
  if (view === undefined) return;
  view.attempt += 1;
  dispatch({ type: "previewSettled", id: frame.id, preview: "loading" });
  view.image.src = previewUrl(frame, view.attempt);
}

function renderSheet(): void {
  if (renderedSheet === state.sheet) return;
  renderedSheet = state.sheet;
  frameViews.clear();
  ui.sheetPost.replaceChildren(...framesInGroup(state, "post").map(buildFrame));
  ui.sheetNearby.replaceChildren(...framesInGroup(state, "nearby").map(buildFrame));

  const source = state.sheet?.source;
  if (source === undefined) {
    ui.source.replaceChildren();
    return;
  }
  const link = document.createElement("a");
  link.className = "link";
  link.href = source.canonicalUrl;
  link.rel = "noreferrer noopener";
  link.target = "_blank";
  link.textContent = source.canonicalUrl.replace("https://www.", "");
  ui.source.replaceChildren("Source: ", link);
}

function renderFrames(): void {
  for (const frame of state.sheet?.frames ?? []) {
    const view = frameViews.get(frame.id);
    if (view === undefined) continue;

    view.checkbox.checked = state.selected.has(frame.id);

    const preview = state.previews.get(frame.id) ?? "loading";
    view.plate.dataset.preview = preview;

    const delivery = state.deliveries.get(frame.id);
    const missing = view.plate.querySelector(".frame-missing");
    if (preview === "failed" && missing === null) {
      const note = document.createElement("span");
      note.className = "frame-missing";
      note.textContent = `Frame ${frameLabel(frame.number)} didn’t load.`;
      view.image.hidden = true;
      view.plate.append(note);
    } else if (preview !== "failed" && missing !== null) {
      missing.remove();
      view.image.hidden = false;
    }

    if (preview === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Reload preview";
      retry.addEventListener("click", () => {
        retryPreview(frame);
      });
      view.state.replaceChildren(retry);
    } else if (delivery === undefined || delivery.tag === "queued") {
      view.state.replaceChildren();
    } else if (delivery.tag === "fetching") {
      view.state.textContent = "Downloading…";
    } else if (delivery.tag === "started") {
      view.state.textContent = "Download started";
    } else {
      view.state.textContent = delivery.message;
    }
  }
}

function render(): void {
  document.body.dataset.phase = state.phase;

  const resolvingNow = state.phase === "resolving";
  ui.find.textContent = resolvingNow ? "Finding…" : "Find images";
  ui.find.disabled = state.phase === "closed";
  ui.input.disabled = state.phase === "closed";
  ui.cancel.hidden = !resolvingNow;
  ui.form.setAttribute("aria-busy", String(resolvingNow));

  ui.error.hidden = state.fieldError === undefined;
  ui.error.textContent = state.fieldError ?? "";
  if (state.fieldError === undefined) ui.input.removeAttribute("aria-invalid");
  else ui.input.setAttribute("aria-invalid", "true");

  const notice = noticeFor(state);
  ui.notice.hidden = notice === undefined;
  ui.noticeText.textContent = notice?.text ?? "";
  ui.noticeAction.hidden = notice?.action === undefined;
  ui.noticeAction.textContent = notice?.action?.label ?? "";
  ui.noticeLink.hidden = notice?.sourceLink !== true;

  if (ui.status.textContent !== statusLine(state)) ui.status.textContent = statusLine(state);
  ui.results.hidden = state.phase !== "results";

  renderSheet();
  if (state.phase === "results") {
    ui.title.textContent = resultsTitle(state);
    ui.note.textContent = resultsNote(state);
    ui.groupPost.hidden = framesInGroup(state, "post").length === 0;
    ui.groupPostTitle.textContent = primaryGroupTitle(state);
    ui.groupNearby.hidden = framesInGroup(state, "nearby").length === 0;
    ui.groupNearbyNote.textContent = nearbyNote(state);
    renderFrames();
  }

  ui.trayCount.textContent = trayCount(state);
  const trayLine = trayStatus(state);
  if (ui.trayStatus.textContent !== trayLine) ui.trayStatus.textContent = trayLine;
  ui.clear.hidden = state.selected.size === 0 || state.batchActive;
  ui.retry.hidden = retryableIds(state).length === 0 || state.batchActive || state.expired !== false;
  ui.download.disabled = state.selected.size === 0 || state.batchActive || state.expired !== false;

  syncLoupe();
}

function startElapsed(): void {
  const startedAt = Date.now();
  window.clearInterval(elapsedTimer);
  ui.elapsed.hidden = false;
  ui.elapsed.textContent = "0s";
  elapsedTimer = window.setInterval(() => {
    ui.elapsed.textContent = `${Math.floor((Date.now() - startedAt) / 1000)}s`;
  }, 1000);
}

function stopElapsed(): void {
  window.clearInterval(elapsedTimer);
  ui.elapsed.hidden = true;
}

function scheduleExpiry(expiresInMs: number): void {
  window.clearTimeout(expiryTimer);
  expiryTimer = window.setTimeout(() => {
    dispatch({ type: "selectionExpired", reason: "time" });
  }, expiresInMs);
}

/** Accepts what people actually paste, then applies the same rules as the server. */
function prepareLink(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    dispatch({ type: "linkRejected", message: LINK_ERRORS.empty ?? "" });
    return undefined;
  }

  const hasOurHost = /^(www\.|m\.)?(instagram\.com|instagr\.am)(\/|$)/i.test(trimmed);
  const candidate = hasOurHost ? `https://${trimmed}` : trimmed.replace(/^http:\/\//i, "https://");
  try {
    normalizeInstagramUrl(candidate);
    return candidate;
  } catch (error) {
    const code = error instanceof CollectorError ? error.code : "invalid_url";
    dispatch({ type: "linkRejected", message: LINK_ERRORS[code] ?? LINK_ERRORS.invalid_url ?? "" });
    return undefined;
  }
}

function canonicalLink(url: string): string {
  return normalizeInstagramUrl(url).canonicalUrl;
}

async function find(url: string, keepSelection: boolean): Promise<void> {
  // A second press for the same link is a duplicate. A different link replaces the first.
  if (resolving?.url === url) return;
  resolving?.controller.abort();
  batch?.abort();
  window.clearTimeout(expiryTimer);

  const controller = new AbortController();
  requestCounter += 1;
  const id = requestCounter;
  resolving = { id, url, controller };
  lastUrl = url;

  dispatch({ type: "resolveStarted", requestId: id, keepSelection });
  startElapsed();

  try {
    const sheet = await resolvePost(url, controller.signal);
    if (id !== requestCounter) return;
    dispatch({ type: "resolveSucceeded", requestId: id, sheet });
    if (sheet.frames.length > 0) scheduleExpiry(sheet.expiresInMs);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (id !== requestCounter) return;
    const problem =
      error instanceof ProblemError
        ? error.problem
        : ({ code: "internal", message: "Something went wrong. Try again.", retryable: true } as const);
    dispatch({ type: "resolveFailed", requestId: id, problem });
  } finally {
    if (id === requestCounter) {
      resolving = undefined;
      stopElapsed();
    }
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function deliver(ids: readonly string[]): Promise<void> {
  const frames = ids
    .map((id) => state.sheet?.frames.find((frame) => frame.id === id))
    .filter((frame): frame is ClientFrame => frame !== undefined);
  if (frames.length === 0) return;

  const controller = new AbortController();
  batch = controller;
  dispatch({ type: "batchStarted", ids: frames.map((frame) => frame.id) });

  for (const frame of frames) {
    if (controller.signal.aborted) break;
    dispatch({ type: "delivery", id: frame.id, delivery: { tag: "fetching" } });
    try {
      handOff(await fetchFile(frame, controller.signal));
      dispatch({ type: "delivery", id: frame.id, delivery: { tag: "started" } });
      await pause(DOWNLOAD_SPACING_MS);
    } catch (error) {
      if (controller.signal.aborted) break;
      const problem = error instanceof ProblemError ? error.problem : undefined;
      if (problem?.code === "ref_expired" || problem?.code === "ref_invalid") {
        dispatch({ type: "delivery", id: frame.id, delivery: { tag: "failed", message: "No longer valid" } });
        dispatch({ type: "selectionExpired", reason: problem.code === "ref_expired" ? "time" : "session" });
        break;
      }
      dispatch({
        type: "delivery",
        id: frame.id,
        delivery: { tag: "failed", message: problem?.message ?? "This download failed." }
      });
    }
  }

  if (batch === controller) {
    batch = undefined;
    dispatch({ type: "batchFinished" });
  }
}

function openLoupe(id: string, opener: HTMLElement): void {
  loupeFrameId = id;
  loupeOpener = opener;
  ui.loupe.showModal();
  syncLoupe();
}

function loupeStep(direction: -1 | 1): void {
  const frames = state.sheet?.frames ?? [];
  const index = frames.findIndex((frame) => frame.id === loupeFrameId);
  const next = frames[index + direction];
  if (next === undefined) return;
  loupeFrameId = next.id;
  syncLoupe();
}

function syncLoupe(): void {
  if (!ui.loupe.open) return;
  const frames = state.sheet?.frames ?? [];
  const index = frames.findIndex((frame) => frame.id === loupeFrameId);
  const frame = frames[index];
  if (frame === undefined) {
    ui.loupe.close();
    return;
  }

  const view = frameViews.get(frame.id);
  const source = previewUrl(frame, view?.attempt ?? 0);
  if (ui.loupeImage.getAttribute("src") !== source) ui.loupeImage.src = source;
  ui.loupeImage.alt = frame.altText ?? `Frame ${frameLabel(frame.number)}`;
  ui.loupeTitle.textContent = `Frame ${frameLabel(frame.number)}`;
  ui.loupeReason.textContent = reasonFor(frame);
  ui.loupeAlt.textContent = frame.altText ?? "";
  ui.loupePrev.disabled = index === 0;
  ui.loupeNext.disabled = index === frames.length - 1;
  ui.loupeCheck.checked = state.selected.has(frame.id);
}

ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = prepareLink(ui.input.value);
  if (url === undefined) {
    ui.input.focus();
    return;
  }
  // The same post again keeps its marks; a different post starts clean.
  void find(url, lastUrl !== "" && canonicalLink(url) === canonicalLink(lastUrl));
});

ui.input.addEventListener("input", () => {
  dispatch({ type: "linkEdited" });
});

ui.cancel.addEventListener("click", () => {
  if (resolving === undefined) return;
  const { id, controller } = resolving;
  controller.abort();
  resolving = undefined;
  stopElapsed();
  dispatch({ type: "resolveCancelled", requestId: id });
  ui.input.focus();
});

ui.noticeAction.addEventListener("click", () => {
  void find(lastUrl, true);
});

ui.clear.addEventListener("click", () => {
  dispatch({ type: "selectionCleared" });
});

ui.download.addEventListener("click", () => {
  void deliver(selectedInSheetOrder(state));
});

ui.retry.addEventListener("click", () => {
  void deliver(retryableIds(state));
});

ui.loupePrev.addEventListener("click", () => {
  loupeStep(-1);
});

ui.loupeNext.addEventListener("click", () => {
  loupeStep(1);
});

ui.loupeCheck.addEventListener("change", () => {
  if (loupeFrameId !== undefined) {
    dispatch({ type: "frameToggled", id: loupeFrameId, selected: ui.loupeCheck.checked });
  }
});

ui.loupe.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") loupeStep(-1);
  if (event.key === "ArrowRight") loupeStep(1);
});

ui.loupe.addEventListener("close", () => {
  ui.loupeImage.removeAttribute("src");
  loupeOpener?.focus();
});

render();
void fetchOpen().then((open) => {
  if (open === false) dispatch({ type: "hostedClosed" });
});
