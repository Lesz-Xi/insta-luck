const sheet = document.querySelector<HTMLElement>("[data-sheet]");
const tally = document.querySelector<HTMLOutputElement>("[data-tally]");

if (sheet !== null && tally !== null) {
  const boxes = [...sheet.querySelectorAll<HTMLInputElement>(".frame-check")];

  sheet.addEventListener("change", () => {
    const marked = boxes.filter((box) => box.checked).length;
    tally.textContent = marked === 1 ? "1 frame marked" : `${marked} frames marked`;
  });

  drawMarksOnce(sheet);
}

/**
 * The page rests with its marks already drawn, so this only subtracts them
 * until the sheet is in view. Without JavaScript or with reduced motion, the
 * finished sheet is simply what's there.
 */
function drawMarksOnce(target: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  const strip = target.querySelector(".strip");
  if (strip === null) return;

  target.classList.add("is-undrawn");
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      window.setTimeout(() => {
        target.classList.remove("is-undrawn");
      }, 240);
    },
    // A line across the viewport rather than a share of the strip, which can be taller than a phone screen.
    { rootMargin: "0px 0px -15% 0px" }
  );
  observer.observe(strip);
}
