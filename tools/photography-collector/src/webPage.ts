export function renderWebPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Twin Photography Collector</title>
  <style>
    :root {
      --paper: #eee7da;
      --ink: #211d18;
      --muted: rgba(33, 29, 24, 0.58);
      --faint: rgba(33, 29, 24, 0.16);
      --warm: #9b5f34;
      --pressed: #d8c8ae;
      --serif: Georgia, "Times New Roman", serif;
      --mono: "SFMono-Regular", "Cascadia Mono", "Roboto Mono", ui-monospace, monospace;
    }

    * { box-sizing: border-box; }

    html,
    body {
      min-height: 100%;
      margin: 0;
      background:
        radial-gradient(circle at 18% 12%, rgba(155, 95, 52, 0.11), transparent 34rem),
        linear-gradient(135deg, rgba(255,255,255,0.24), transparent 40%),
        var(--paper);
      color: var(--ink);
      scrollbar-width: none;
    }

    body::-webkit-scrollbar { display: none; }

    body {
      font-family: var(--mono);
      letter-spacing: 0.01em;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(33,29,24,0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(33,29,24,0.025) 1px, transparent 1px);
      background-size: 44px 44px, 44px 44px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0.24));
    }

    .hero {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(1.2rem, 1fr) minmax(0, 72rem) minmax(1.2rem, 1fr);
      padding: clamp(1rem, 2vw, 2rem) 0;
    }

    .hero-inner {
      grid-column: 2;
      display: grid;
      align-items: start;
      min-height: calc(100vh - clamp(2rem, 4vw, 4rem));
      border-top: 1px solid var(--faint);
      border-bottom: 1px solid var(--faint);
      padding: clamp(4rem, 12vh, 8rem) 0 clamp(2rem, 5vw, 4rem);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .panel {
      display: grid;
      gap: clamp(1.2rem, 2vw, 1.8rem);
      align-content: start;
      justify-self: center;
      width: min(100%, 47rem);
    }

    .field {
      display: grid;
      gap: 0.7rem;
    }

    label {
      color: var(--muted);
      font: 700 0.68rem/1 var(--mono);
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .input-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.7rem;
      align-items: stretch;
    }

    input {
      width: 100%;
      border: 1px solid var(--faint);
      border-radius: 999px;
      background: rgba(255,255,255,0.24);
      color: var(--ink);
      min-height: 3rem;
      padding: 0 1.05rem;
      font: 600 0.78rem/1 var(--mono);
      outline: none;
    }

    input:focus-visible,
    button:focus-visible {
      outline: 1px solid var(--warm);
      outline-offset: 3px;
    }

    button {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: var(--paper);
      min-height: 3rem;
      padding: 0 1.1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      cursor: pointer;
      font: 800 0.72rem/1 var(--mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      transition: color 180ms ease, border-color 180ms ease;
    }

    button::before {
      content: "";
      position: absolute;
      inset: auto 0 0;
      height: 0;
      background: var(--paper);
      transition: height 220ms ease;
      z-index: 0;
    }

    button > span,
    button > svg {
      position: relative;
      z-index: 1;
    }

    button:hover:not(:disabled) {
      color: var(--ink);
      border-color: var(--ink);
    }

    button:hover:not(:disabled)::before {
      height: 100%;
    }

    button.secondary {
      width: 100%;
      border-color: var(--faint);
      background: transparent;
      color: var(--ink);
    }

    button.secondary::before {
      background: rgba(33, 29, 24, 0.055);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }

    .icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
    }

    .status {
      min-height: 1.3rem;
      color: var(--muted);
      font: 600 0.72rem/1.5 var(--mono);
    }

    .results {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.8rem;
      max-height: min(47vh, 34rem);
      overflow: auto;
      padding-right: 0.2rem;
      scrollbar-width: none;
    }

    .results::-webkit-scrollbar { display: none; }

    .card {
      display: grid;
      gap: 0.65rem;
      border-top: 1px solid var(--faint);
      padding-top: 0.75rem;
    }

    .card img {
      width: 100%;
      aspect-ratio: 4 / 5;
      object-fit: cover;
      display: block;
      background: var(--pressed);
      filter: saturate(0.9) contrast(0.98);
    }

    .meta {
      display: grid;
      gap: 0.25rem;
      min-height: 3.2rem;
    }

    .kind {
      color: var(--warm);
      font: 800 0.62rem/1 var(--mono);
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .alt {
      color: var(--muted);
      font: 600 0.68rem/1.45 var(--mono);
    }

    .empty {
      grid-column: 1 / -1;
      border-top: 1px solid var(--faint);
      padding-top: 1rem;
      color: var(--muted);
      font: 600 0.76rem/1.7 var(--mono);
    }

    @media (max-width: 860px) {
      .results { max-height: none; }
    }

    @media (max-width: 560px) {
      .input-row { grid-template-columns: 1fr; }
      .results { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="hero" aria-labelledby="page-title">
    <section class="hero-inner">
      <h1 id="page-title" class="sr-only">Twin Photography Collector</h1>
      <div class="panel" aria-live="polite">
        <div class="field">
          <label for="source-url">Instagram URL</label>
          <div class="input-row">
            <input id="source-url" autocomplete="off" spellcheck="false" placeholder="https://www.instagram.com/p/..." value="" />
            <button id="resolve-button" type="button"><span>Run</span></button>
          </div>
        </div>

        <div id="status" class="status"></div>
        <div id="results" class="results" aria-label="Resolved image candidates"></div>
      </div>
    </section>
  </main>

  <script>
    const input = document.querySelector('#source-url');
    const button = document.querySelector('#resolve-button');
    const status = document.querySelector('#status');
    const results = document.querySelector('#results');

    const downloadIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    button.addEventListener('click', () => resolveImages());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') resolveImages();
    });

    async function resolveImages() {
      const url = input.value.trim();
      if (!url) {
        status.textContent = 'Paste an Instagram URL first.';
        return;
      }

      button.disabled = true;
      status.textContent = 'Resolving image candidates…';
      results.innerHTML = '<div class="empty">Reading the public post surface.</div>';

      try {
        const response = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Resolve failed.');
        renderResults(payload.candidates || []);
        status.textContent = 'Resolved ' + payload.candidates.length + ' candidates. Choose deliberately.';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        results.innerHTML = '<div class="empty">Nothing rendered. The link may be unavailable from the public resolver.</div>';
      } finally {
        button.disabled = false;
      }
    }

    function renderResults(candidates) {
      if (candidates.length === 0) {
        results.innerHTML = '<div class="empty">No image candidates found.</div>';
        return;
      }

      results.innerHTML = candidates.map((candidate, index) => {
        const alt = escapeHtml(candidate.altText || candidate.mediaKind);
        const kind = escapeHtml(candidate.mediaKind.replaceAll('_', ' '));
        const date = candidate.postedAt ? ' · ' + escapeHtml(candidate.postedAt) : '';
        return '<article class="card">' +
          '<img src="' + candidate.imageUrl + '" alt="' + alt + '" loading="lazy" />' +
          '<div class="meta"><div class="kind">[' + (index + 1) + '] ' + kind + date + '</div><div class="alt">' + alt + '</div></div>' +
          '<button class="secondary" type="button" data-id="' + candidate.id + '">' + downloadIcon + '<span>Download</span></button>' +
        '</article>';
      }).join('');

      for (const downloadButton of results.querySelectorAll('button[data-id]')) {
        downloadButton.addEventListener('click', () => downloadCandidate(downloadButton));
      }
    }

    async function downloadCandidate(downloadButton) {
      const id = downloadButton.getAttribute('data-id');
      if (!id) return;
      downloadButton.disabled = true;
      downloadButton.innerHTML = '<span>Saving</span>';
      status.textContent = 'Saving selected image…';

      try {
        const response = await fetch('/api/download', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Download failed.');
        status.textContent = payload.message;
        downloadButton.innerHTML = downloadIcon + '<span>' + (payload.status === 'duplicate' ? 'Duplicate' : 'Saved') + '</span>';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        downloadButton.innerHTML = downloadIcon + '<span>Download</span>';
        downloadButton.disabled = false;
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }
  </script>
</body>
</html>`;
}
