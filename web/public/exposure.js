// Runs before first paint: a saved exposure, and the class that lets entrances start hidden.
// Without this file the page follows the system and rests complete, with nothing waiting to arrive.
(function () {
  var root = document.documentElement;
  try {
    var saved = window.localStorage.getItem("insta-luck-exposure");
    if (saved === "snow" || saved === "night") root.setAttribute("data-exposure", saved);
  } catch (error) {
    // Refused storage: follow the system.
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("js-motion");
  // If the page's script never arrives, nothing is left waiting to appear.
  window.setTimeout(function () {
    if (!root.classList.contains("is-ready")) root.classList.remove("js-motion");
  }, 2500);
})();
