/**
 * Two exposures only, snow and night. The page follows the system until the
 * reader chooses, then keeps the choice; storage may be refused, and the choice
 * then lasts for the visit. `/exposure.js` applies a saved choice before first
 * paint; this wires the switch.
 */
const KEY = "insta-luck-exposure";

type Exposure = "snow" | "night";

function current(): Exposure {
  const chosen = document.documentElement.dataset.exposure;
  if (chosen === "snow" || chosen === "night") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "snow";
}

function sync(button: HTMLButtonElement): void {
  const night = current() === "night";
  button.setAttribute("aria-pressed", String(night));
  button.setAttribute("aria-label", night ? "Switch to day" : "Switch to night");
}

export function wireExposure(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-exposure-switch]")) {
    sync(button);
    button.addEventListener("click", () => {
      const next: Exposure = current() === "night" ? "snow" : "night";
      document.documentElement.dataset.exposure = next;
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // Refused storage only costs the memory of the choice.
      }
      sync(button);
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      sync(button);
    });
  }
}
