import type { ClientFrame } from "../../../hosted/contract.js";
import { wireExposure } from "../exposure.js";
import { fetchFile, fetchOpen, handOff, previewUrl, ProblemError, resolvePost } from "./api.js";
import {
  captionFor,
  closedNotice,
  frameLabel,
  LINK_ERRORS,
  linkTally,
  NEARBY_NOTE,
  NEARBY_TITLE,
  noticeFor,
  primaryGroupTitle,
  reasonFor,
  receiptFor,
  rollNote,
  rollWaiting,
  sheetTitle,
  statusLine,
  trayCount,
  trayStatus
} from "./copy.js";
import { parseLinks } from "./links.js";
import {
  deliverableIds,
  initialState,
  isReading,
  MAX_LINKS,
  reduce,
  retryableIds,
  rollsOf,
  sheetFrames,
  type Action,
  type AppState,
  type PlacedFrame,
  type Problem,
  type Roll,
  type SheetLink
} from "./state.js";

/** Browsers can drop downloads requested in the same instant. */
const DOWNLOAD_SPACING_MS = 350;
/** How long the button's receipt stays before the idle label comes home. */
const RECEIPT_MS = 1900;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const ui = {
  form: byId<HTMLFormElement>("find-form"),
  input: byId<HTMLTextAreaElement>("post-link"),
  find: byId<HTMLButtonElement>("find-button"),
  error: byId("post-error"),
  notice: byId("notice"),
  noticeText: byId("notice-text"),
  noticeLink: byId<HTMLAnchorElement>("notice-link"),
  status: byId("status"),
  links: byId("links"),
  linkList: byId<HTMLOListElement>("link-list"),
  opening: byId("opening"),
  results: byId("results"),
  title: byId("results-title"),
  rolls: byId("rolls"),
  tray: byId("tray"),
  trayCount: byId("tray-count"),
  trayStatus: byId("tray-status"),
  clear: byId<HTMLButtonElement>("clear-button"),
  retry: byId<HTMLButtonElement>("retry-button"),
  download: byId<HTMLButtonElement>("download-button"),
  downloadReceipt: byId("download-receipt"),
  loupe: byId<HTMLDialogElement>("loupe"),
  loupeTitle: byId("loupe-title"),
  loupeSource: byId("loupe-source"),
  loupeImage: byId<HTMLImageElement>("loupe-image"),
  loupeReason: byId("loupe-reason"),
  loupeAlt: byId("loupe-alt"),
  loupePrev: byId<HTMLButtonElement>("loupe-prev"),
  loupeNext: byId<HTMLButtonElement>("loupe-next"),
  loupeCheck: byId<HTMLInputElement>("loupe-check")
};

const SVG_NS = "http://www.w3.org/2000/svg";

interface FrameView {
  readonly item: HTMLLIElement;
  readonly checkbox: HTMLInputElement;
  readonly plate: HTMLElement;
  readonly image: HTMLImageElement;
  readonly number: HTMLElement;
  readonly reason: HTMLElement;
  readonly state: HTMLElement;
  readonly inspect: HTMLButtonElement;
  /** The newest reference: a re-read replaces it while the loaded preview stays. */
  frame: ClientFrame;
  attempt: number;
}

interface GroupView {
  readonly root: HTMLElement;
  readonly list: HTMLUListElement;
  order: string;
}

interface RollView {
  readonly root: HTMLElement;
  readonly anchor: HTMLAnchorElement;
  readonly note: HTMLElement;
  readonly notice: HTMLElement;
  readonly noticeText: HTMLElement;
  readonly noticeAction: HTMLButtonElement;
  readonly post: GroupView;
  readonly postTitle: HTMLElement;
  readonly nearby: GroupView;
}

interface RowView {
  readonly root: HTMLLIElement;
  readonly name: HTMLAnchorElement;
  readonly tally: HTMLElement;
  readonly remove: HTMLButtonElement;
}

let state: AppState = initialState;
let active: { readonly key: string; readonly controller: AbortController } | undefined;
let elapsedTimer: number | undefined;
let elapsedSeconds = 0;
let receiptTimer: number | undefined;
let rollCounter = 0;
let loupeFrameId: string | undefined;
let loupeOpener: HTMLElement | undefined;
const expiryTimers = new Map<string, number>();
const frameViews = new Map<string, FrameView>();
const rollViews = new Map<string, RollView>();
const rowViews = new Map<string, RowView>();

function dispatch(action: Action): void {
  state = reduce(state, action);
  render();
}

function useIcon(symbol: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${symbol}`);
  svg.append(use);
  return svg;
}

function buildFrame(frame: ClientFrame): FrameView {
  const item = document.createElement("li");
  item.className = "frame";
  item.dataset.id = frame.id;

  const hit = document.createElement("label");
  hit.className = "frame-hit";

  const checkbox = document.createElement("input");
  checkbox.className = "frame-check";
  checkbox.type = "checkbox";
  checkbox.id = `mark-${frame.id}`;
  checkbox.addEventListener("change", () => {
    dispatch({ type: "frameToggled", id: frame.id, selected: checkbox.checked });
  });

  const plate = document.createElement("span");
  plate.className = "frame-plate";
  plate.dataset.preview = "loading";

  const image = document.createElement("img");
  // Set as a property from a sanitized string; alt text is never parsed as markup.
  image.alt = frame.altText ?? `Frame ${frameLabel(frame.number)}`;
  image.decoding = "async";
  image.loading = "lazy";
  // A removed frame's image can still settle later. Only the one on the sheet counts.
  const isCurrent = (): boolean => frameViews.get(frame.id)?.image === image;
  image.addEventListener("load", () => {
    if (isCurrent()) dispatch({ type: "previewSettled", id: frame.id, preview: "ready" });
  });
  image.addEventListener("error", () => {
    if (isCurrent()) dispatch({ type: "previewSettled", id: frame.id, preview: "failed" });
  });
  image.src = previewUrl(frame);
  plate.append(image);

  const bar = document.createElement("span");
  bar.className = "frame-bar";
  bar.setAttribute("aria-hidden", "true");

  hit.append(checkbox, plate, bar);

  const caption = document.createElement("div");
  caption.className = "frame-caption";

  const number = document.createElement("span");
  number.className = "frame-number";

  const reason = document.createElement("span");
  reason.className = "frame-reason";

  const inspect = document.createElement("button");
  inspect.className = "frame-inspect";
  inspect.type = "button";
  inspect.append(useIcon("i-inspect", "icon"));
  inspect.addEventListener("click", () => {
    openLoupe(frame.id, inspect);
  });

  const keep = document.createElement("label");
  keep.className = "frame-keep";
  keep.htmlFor = checkbox.id;
  keep.append(useIcon("i-keep", "icon keep-off"), useIcon("i-kept", "icon keep-on"));

  const stateLine = document.createElement("span");
  stateLine.className = "frame-state";

  caption.append(number, reason, inspect, keep, stateLine);
  item.append(hit, caption);

  const view: FrameView = { item, checkbox, plate, image, number, reason, state: stateLine, inspect, frame, attempt: 0 };
  frameViews.set(frame.id, view);
  return view;
}

/** Numbers and reasons belong to the link a frame sits under, which can change as links arrive. */
function labelFrame(view: FrameView, frame: ClientFrame, link: SheetLink): void {
  // A preview that hasn't arrived would otherwise keep waiting on the old reference.
  if (frame.ref !== view.frame.ref && state.previews.get(frame.id) !== "ready") {
    view.image.src = previewUrl(frame, view.attempt);
  }
  view.frame = frame;
  const label = frameLabel(frame.number);
  view.number.textContent = label;
  view.reason.textContent = captionFor(frame) ?? "";
  view.checkbox.setAttribute("aria-label", `Mark frame ${label} from ${link.label}. ${reasonFor(frame)}`);
  view.inspect.setAttribute("aria-label", `Inspect frame ${label} from ${link.label} at full size`);
}

function retryPreview(view: FrameView): void {
  view.attempt += 1;
  dispatch({ type: "previewSettled", id: view.frame.id, preview: "loading" });
  view.image.src = previewUrl(view.frame, view.attempt);
}

function syncFrame(view: FrameView): void {
  const { frame } = view;
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
    if (view.state.querySelector("button") === null) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Reload preview";
      retry.addEventListener("click", () => {
        retryPreview(view);
      });
      view.state.replaceChildren(retry);
    }
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

function buildGroup(className: string, heading: HTMLElement, note?: HTMLElement): GroupView {
  const root = document.createElement("div");
  root.className = `group ${className}`;
  const boundary = document.createElement("div");
  boundary.className = "boundary";
  boundary.append(heading);
  if (note !== undefined) boundary.append(note);
  const list = document.createElement("ul");
  list.className = `sheet ${className}`;
  root.append(boundary, list);
  return { root, list, order: "" };
}

function buildRoll(link: SheetLink): RollView {
  rollCounter += 1;
  const root = document.createElement("section");
  root.className = "roll";
  root.id = `roll-${rollCounter}`;
  root.dataset.key = link.key;

  const head = document.createElement("header");
  head.className = "roll-head";
  const title = document.createElement("h2");
  title.className = "roll-title";
  const anchor = document.createElement("a");
  anchor.className = "link";
  anchor.href = link.key;
  anchor.rel = "noreferrer noopener";
  anchor.target = "_blank";
  anchor.textContent = link.key.replace("https://www.", "");
  title.append(anchor);
  const note = document.createElement("p");
  note.className = "roll-note";
  head.append(title, note);

  const notice = document.createElement("div");
  notice.className = "roll-notice";
  const noticeText = document.createElement("p");
  const noticeAction = document.createElement("button");
  noticeAction.className = "button is-quiet";
  noticeAction.type = "button";
  noticeAction.addEventListener("click", () => {
    readAgain(link.key);
  });
  notice.append(noticeText, noticeAction);

  const postTitle = document.createElement("h3");
  const post = buildGroup("is-post", postTitle);
  const nearbyHeading = document.createElement("h3");
  nearbyHeading.textContent = NEARBY_TITLE;
  const nearbyText = document.createElement("p");
  nearbyText.textContent = NEARBY_NOTE;
  const nearby = buildGroup("is-nearby", nearbyHeading, nearbyText);

  root.append(head, notice, post.root, nearby.root);
  return { root, anchor, note, notice, noticeText, noticeAction, post, postTitle, nearby };
}

/** Moves frames only when the order really changed, so loaded images and keyboard focus stay put. */
function fillGroup(group: GroupView, frames: readonly ClientFrame[], link: SheetLink): void {
  group.root.hidden = frames.length === 0;
  const views = frames.map((frame) => {
    const view = frameViews.get(frame.id) ?? buildFrame(frame);
    labelFrame(view, frame, link);
    return view;
  });
  const order = frames.map((frame) => frame.id).join();
  if (order !== group.order) {
    group.order = order;
    group.list.replaceChildren(...views.map((view) => view.item));
  }
}

function renderRoll(roll: Roll): void {
  const { link } = roll;
  let view = rollViews.get(link.key);
  if (view === undefined) {
    view = buildRoll(link);
    rollViews.set(link.key, view);
  }
  view.root.dataset.status = link.status;
  view.note.textContent = rollWaiting(link) ?? rollNote(roll);

  const notice = noticeFor(link);
  view.notice.hidden = notice === undefined;
  view.noticeText.textContent = notice?.text ?? "";
  view.noticeAction.hidden = notice?.action === undefined;
  view.noticeAction.textContent = notice?.action ?? "";

  view.postTitle.textContent = primaryGroupTitle(link);
  fillGroup(view.post, roll.post, link);
  fillGroup(view.nearby, roll.nearby, link);
}

function renderSheet(rolls: readonly Roll[]): void {
  const keys = new Set(rolls.map(({ link }) => link.key));
  for (const [key, view] of rollViews) {
    if (keys.has(key)) continue;
    view.root.remove();
    rollViews.delete(key);
  }

  for (const roll of rolls) renderRoll(roll);

  const onSheet = new Set(sheetFrames(state).map(({ frame }) => frame.id));
  for (const [id, view] of frameViews) {
    if (onSheet.has(id)) syncFrame(view);
    else {
      view.item.remove();
      frameViews.delete(id);
    }
  }

  const order = rolls.flatMap(({ link }) => {
    const view = rollViews.get(link.key);
    return view === undefined ? [] : [view.root];
  });
  if (order.some((root, index) => ui.rolls.children[index] !== root)) ui.rolls.replaceChildren(...order);
}

function buildRow(link: SheetLink, rollId: string): RowView {
  const root = document.createElement("li");
  root.className = "link-row";

  const name = document.createElement("a");
  name.className = "link-name";
  name.href = `#${rollId}`;
  name.textContent = link.label;

  const tally = document.createElement("span");
  tally.className = "link-tally";

  const remove = document.createElement("button");
  remove.className = "link-remove";
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${link.label} from the sheet`);
  remove.append(useIcon("i-remove", "icon"));
  remove.addEventListener("click", () => {
    removeLink(link.key);
  });

  root.append(name, tally, remove);
  return { root, name, tally, remove };
}

function renderRows(rolls: readonly Roll[]): void {
  const keys = new Set(rolls.map(({ link }) => link.key));
  for (const [key, view] of rowViews) {
    if (keys.has(key)) continue;
    view.root.remove();
    rowViews.delete(key);
  }

  for (const roll of rolls) {
    const { link } = roll;
    let view = rowViews.get(link.key);
    if (view === undefined) {
      view = buildRow(link, rollViews.get(link.key)?.root.id ?? "");
      rowViews.set(link.key, view);
      ui.linkList.append(view.root);
    }
    view.root.dataset.status = link.status;
    view.root.dataset.marked = String([...roll.post, ...roll.nearby].some((frame) => state.selected.has(frame.id)));
    view.tally.textContent = linkTally(roll, elapsedSeconds);
  }
}

function render(): void {
  const reading = isReading(state);
  const rolls = rollsOf(state);
  document.body.dataset.state = state.closed ? "closed" : state.links.length === 0 ? "empty" : "sheet";

  ui.find.disabled = state.closed;
  ui.input.disabled = state.closed;
  ui.form.setAttribute("aria-busy", String(reading));

  ui.error.hidden = state.fieldError === undefined;
  ui.error.textContent = state.fieldError ?? "";
  if (state.fieldError === undefined) ui.input.removeAttribute("aria-invalid");
  else ui.input.setAttribute("aria-invalid", "true");

  ui.notice.hidden = !state.closed;
  ui.noticeText.textContent = state.closed ? closedNotice() : "";
  ui.noticeLink.hidden = !state.closed;

  const line = statusLine(state);
  if (ui.status.textContent !== line) ui.status.textContent = line;

  const onSheet = state.links.length > 0;
  ui.opening.hidden = onSheet;
  ui.results.hidden = !onSheet;
  ui.links.hidden = !onSheet;
  ui.tray.hidden = !onSheet;

  renderSheet(rolls);
  renderRows(rolls);
  ui.title.textContent = onSheet ? sheetTitle(state) : "";

  ui.trayCount.textContent = trayCount(state);
  const trayLine = trayStatus(state);
  if (ui.trayStatus.textContent !== trayLine) ui.trayStatus.textContent = trayLine;
  ui.clear.hidden = state.selected.size === 0 || state.batchActive;
  ui.retry.hidden = retryableIds(state).length === 0 || state.batchActive;
  ui.download.disabled = deliverableIds(state).length === 0 || state.batchActive;

  syncLoupe();
}

function startElapsed(): void {
  const startedAt = Date.now();
  elapsedSeconds = 0;
  window.clearInterval(elapsedTimer);
  elapsedTimer = window.setInterval(() => {
    elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    renderRows(rollsOf(state));
  }, 1000);
}

function scheduleExpiry(key: string, expiresInMs: number): void {
  window.clearTimeout(expiryTimers.get(key));
  expiryTimers.set(
    key,
    window.setTimeout(() => {
      dispatch({ type: "linkExpired", key, reason: "time" });
    }, expiresInMs)
  );
}

/** One read at a time, in the order the links were added. */
function pump(): void {
  if (active !== undefined) return;
  const next = state.links.find((link) => link.status === "queued");
  if (next !== undefined) void read(next);
}

async function read(link: SheetLink): Promise<void> {
  const controller = new AbortController();
  active = { key: link.key, controller };
  startElapsed();
  dispatch({ type: "readStarted", key: link.key });

  try {
    const result = await resolvePost(link.url, controller.signal);
    if (controller.signal.aborted) return;
    dispatch({ type: "readSucceeded", key: link.key, read: result });
    if (result.frames.length > 0) scheduleExpiry(link.key, result.expiresInMs);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    const problem =
      error instanceof ProblemError
        ? error.problem
        : ({ code: "internal", message: "Something went wrong. Try again.", retryable: true } as const);
    dispatch({ type: "readFailed", key: link.key, problem });
  } finally {
    if (active?.controller === controller) {
      active = undefined;
      window.clearInterval(elapsedTimer);
      pump();
    }
  }
}

function readAgain(key: string): void {
  window.clearTimeout(expiryTimers.get(key));
  dispatch({ type: "readQueued", key });
  pump();
}

function removeLink(key: string): void {
  if (active?.key === key) {
    active.controller.abort();
    active = undefined;
    window.clearInterval(elapsedTimer);
  }
  window.clearTimeout(expiryTimers.get(key));
  expiryTimers.delete(key);
  dispatch({ type: "linkRemoved", key });
  pump();
  ui.input.focus();
}

/**
 * A long sheet would otherwise take a new link in below the fold, where nothing
 * seems to happen. This runs at the moment of adding, never when a read lands:
 * the page doesn't move under someone who has gone back to marking frames.
 */
function bringIntoView(key: string | undefined): void {
  if (key === undefined) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  rollViews.get(key)?.root.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
}

function addLinks(raw: string): void {
  if (raw.trim().length === 0) {
    dispatch({ type: "linkRejected", message: LINK_ERRORS.empty ?? "" });
    return;
  }

  const { accepted, rejected } = parseLinks(raw);
  const known = new Set(state.links.map((link) => link.key));
  const fresh = accepted.filter((link) => !known.has(link.key));
  const repeats = accepted.filter((link) => known.has(link.key));
  const room = MAX_LINKS - state.links.length;
  const taken = fresh.slice(0, Math.max(room, 0));

  // A link that failed or expired comes back to life by pasting it again.
  const revived = repeats.flatMap((link) => {
    const onSheet = state.links.find((candidate) => candidate.key === link.key);
    return onSheet?.status === "failed" || onSheet?.status === "expired" || onSheet?.status === "empty" ? [onSheet.key] : [];
  });

  if (taken.length > 0) dispatch({ type: "linksAdded", links: taken });
  for (const key of revived) readAgain(key);
  pump();
  bringIntoView(taken[0]?.key ?? revived[0]);

  const leftover = [...rejected.map(({ token }) => token), ...fresh.slice(taken.length).map((link) => link.url)];
  if (rejected.length > 0) {
    dispatch({ type: "linkRejected", message: LINK_ERRORS[rejected[0]?.code ?? ""] ?? LINK_ERRORS.invalid_url ?? "" });
  } else if (fresh.length > taken.length) {
    dispatch({ type: "linkRejected", message: LINK_ERRORS.too_many ?? "" });
  } else if (taken.length === 0 && revived.length === 0) {
    dispatch({ type: "linkRejected", message: LINK_ERRORS.duplicate ?? "" });
    return;
  }

  // Nothing usable keeps what was typed exactly, so it can be corrected in place.
  if (taken.length > 0 || revived.length > 0) ui.input.value = leftover.join("\n");
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function placedFrame(id: string): PlacedFrame | undefined {
  return sheetFrames(state).find(({ frame }) => frame.id === id);
}

function showReceipt(started: number): void {
  window.clearTimeout(receiptTimer);
  ui.downloadReceipt.textContent = receiptFor(started);
  ui.download.dataset.receipt = "on";
  receiptTimer = window.setTimeout(() => {
    delete ui.download.dataset.receipt;
  }, RECEIPT_MS);
}

/** A CDN address goes stale and a reference expires. Either way, reading the link again fixes it. */
function needsNewRead(problem: Problem | undefined): boolean {
  return problem?.code === "ref_expired" || problem?.code === "ref_invalid" || problem?.code === "source_gone";
}

async function deliver(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  dispatch({ type: "batchStarted", ids });
  let started = 0;
  let failed = 0;

  for (const id of ids) {
    const placed = placedFrame(id);
    if (placed === undefined) continue;

    // Its link may have expired since the batch began: that's a failure to report, not a frame to drop.
    if (placed.link.status !== "ready") {
      failed += 1;
      dispatch({ type: "delivery", id, delivery: { tag: "failed", message: "No longer valid" } });
      continue;
    }

    dispatch({ type: "delivery", id, delivery: { tag: "fetching" } });
    try {
      const file = await fetchFile(placed.frame);
      // Removed while it was on the way: no longer wanted.
      if (placedFrame(id) === undefined) continue;
      handOff(file);
      started += 1;
      dispatch({ type: "delivery", id, delivery: { tag: "started" } });
      await pause(DOWNLOAD_SPACING_MS);
    } catch (error) {
      failed += 1;
      const problem = error instanceof ProblemError ? error.problem : undefined;
      if (needsNewRead(problem)) {
        dispatch({ type: "delivery", id, delivery: { tag: "failed", message: "No longer valid" } });
        dispatch({ type: "linkExpired", key: placed.link.key, reason: problem?.code === "ref_invalid" ? "session" : "time" });
        continue;
      }
      dispatch({ type: "delivery", id, delivery: { tag: "failed", message: problem?.message ?? "This download failed." } });
    }
  }

  dispatch({ type: "batchFinished" });
  if (started > 0 && failed === 0) showReceipt(started);
}

function openLoupe(id: string, opener: HTMLElement): void {
  loupeFrameId = id;
  loupeOpener = opener;
  ui.loupe.showModal();
  syncLoupe();
}

function loupeStep(direction: -1 | 1): void {
  const frames = sheetFrames(state);
  const index = frames.findIndex(({ frame }) => frame.id === loupeFrameId);
  const next = frames[index + direction];
  if (next === undefined) return;
  loupeFrameId = next.frame.id;
  syncLoupe();
}

function syncLoupe(): void {
  if (!ui.loupe.open) return;
  const frames = sheetFrames(state);
  const index = frames.findIndex(({ frame }) => frame.id === loupeFrameId);
  const placed = frames[index];
  if (placed === undefined) {
    ui.loupe.close();
    return;
  }

  const { frame, link } = placed;
  const view = frameViews.get(frame.id);
  const source = previewUrl(view?.frame ?? frame, view?.attempt ?? 0);
  if (ui.loupeImage.getAttribute("src") !== source) ui.loupeImage.src = source;
  ui.loupeImage.alt = frame.altText ?? `Frame ${frameLabel(frame.number)}`;
  ui.loupeTitle.textContent = `Frame ${frameLabel(frame.number)}`;
  ui.loupeSource.textContent = link.label;
  ui.loupeReason.textContent = reasonFor(frame);
  ui.loupeAlt.textContent = frame.altText ?? "";
  ui.loupePrev.disabled = index === 0;
  ui.loupeNext.disabled = index === frames.length - 1;
  ui.loupeCheck.checked = state.selected.has(frame.id);
}

ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  addLinks(ui.input.value);
  // The next paste can follow at once; on touch, that would hold the keyboard over the sheet.
  if (state.fieldError !== undefined || window.matchMedia("(hover: hover)").matches) ui.input.focus();
  else ui.input.blur();
});

ui.input.addEventListener("keydown", (event) => {
  // Enter adds, as it would in a one-line field; a pasted list arrives with its own line breaks.
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    ui.form.requestSubmit();
  }
});

ui.input.addEventListener("input", () => {
  dispatch({ type: "linkEdited" });
});

ui.clear.addEventListener("click", () => {
  dispatch({ type: "selectionCleared" });
});

ui.download.addEventListener("click", () => {
  void deliver(deliverableIds(state));
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

wireExposure();
render();
void fetchOpen().then((open) => {
  if (open === false) dispatch({ type: "hostedClosed" });
});
