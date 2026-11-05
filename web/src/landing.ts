import { wireExposure } from "./exposure.js";

interface LenisOptions {
  readonly duration: number;
  readonly smoothWheel: boolean;
  readonly autoRaf: boolean;
  readonly autoToggle: boolean;
  readonly anchors: boolean;
}

declare global {
  interface Window {
    Lenis?: new (options: LenisOptions) => unknown;
  }
}

const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

wireExposure();
countMarks();
watchArrivals();
settleScroll();

// Two frames, so the first paint holds the hidden state and the entrance really runs.
window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    root.classList.add("is-ready");
  });
});

function countMarks(): void {
  const sheet = document.querySelector<HTMLElement>("[data-sheet]");
  const tally = document.querySelector<HTMLOutputElement>("[data-tally]");
  if (sheet === null || tally === null) return;

  const boxes = [...sheet.querySelectorAll<HTMLInputElement>(".frame-check")];
  sheet.addEventListener("change", () => {
    const marked = boxes.filter((box) => box.checked).length;
    tally.textContent = marked === 1 ? "1 frame marked" : `${marked} frames marked`;
  });
}

/**
 * Rows arrive as a folio page turns. The page rests complete; this only holds
 * things back until they're in view, so without it nothing is missing.
 */
function watchArrivals(): void {
  const arrivals = [...document.querySelectorAll<HTMLElement>(".arrive")];
  if (reduced.matches || !("IntersectionObserver" in window)) {
    for (const element of arrivals) element.classList.add("is-in");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    // A line across the viewport rather than a share of the row, which can be taller than a phone screen.
    { rootMargin: "0px 0px -14% 0px" }
  );
  for (const element of arrivals) observer.observe(element);
}

/** Feather, the Odysxi templates' weight. Wheel and trackpad only; if the library is missing, the page scrolls natively. */
function settleScroll(): void {
  if (reduced.matches || window.Lenis === undefined) return;
  new window.Lenis({ duration: 0.8, smoothWheel: true, autoRaf: true, autoToggle: true, anchors: true });
}
