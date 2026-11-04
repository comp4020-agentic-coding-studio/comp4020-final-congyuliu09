export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Hand-drawn, rounded-stroke icons as inline SVG — no icon font or library,
// consistent with the zero-runtime-dependency stack (PROCESS.md). Each one
// inherits currentColor so it picks up whatever text colour it's placed in,
// and rounded linecap/linejoin is what makes them read as "friendly" rather
// than technical line icons.
export type IconName = "car" | "camera" | "shield" | "bolt" | "clipboard" | "wrench" | "user" | "guest" | "key" | "logout";

const ICON_PATHS: Record<IconName, string> = {
  car: '<path d="M4 16.5V12l2-5a2 2 0 0 1 1.9-1.4h8.2A2 2 0 0 1 18 7l2 5v4.5" /><path d="M3.5 16.5h17a.5.5 0 0 1 .5.5v1.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V18H6v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V17a.5.5 0 0 1 .5-.5Z" /><circle cx="7.5" cy="14" r="1.3" /><circle cx="16.5" cy="14" r="1.3" />',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" /><circle cx="12" cy="13" r="3.2" /><circle cx="17" cy="10" r="0.6" fill="currentColor" stroke="none" />',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 3 7 7 9 4-2 7-4.8 7-9V6Z" /><path d="m9 12 2 2 4-4.2" />',
  bolt: '<path d="M13 3 6 13h5l-1 8 7-10h-5Z" />',
  clipboard: '<rect x="5.5" y="4.5" width="13" height="16" rx="2" /><rect x="9" y="3" width="6" height="3" rx="1" /><path d="M9 11h6M9 14.5h6M9 18h4" />',
  wrench: '<path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.6L4 17l2 2 6.1-6.1a3.5 3.5 0 0 0 4.6-4.6l-2.3 2.3-2-2Z" />',
  user: '<circle cx="12" cy="8.5" r="3.2" /><path d="M5.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />',
  guest: '<circle cx="12" cy="8.5" r="3.2" stroke-dasharray="2.2 2.2" /><path d="M5.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke-dasharray="2.2 2.2" />',
  key: '<circle cx="8" cy="15" r="3.3" /><path d="m10.3 12.7 7.2-7.2M15 7.5l2 2M17.5 5l2 2" />',
  logout: '<path d="M14 7V5.5A1.5 1.5 0 0 0 12.5 4h-6A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h6a1.5 1.5 0 0 0 1.5-1.5V17" /><path d="M9 12h11m0 0-3-3m3 3-3 3" />',
};

export function icon(name: IconName, opts: { size?: number; class?: string } = {}): string {
  const size = opts.size ?? 18;
  const cls = opts.class ? ` class="${escapeHtml(opts.class)}"` : "";
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align: -3px; flex-shrink: 0;">${ICON_PATHS[name]}</svg>`;
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #070b16;
        --surface: #0f1729;
        --surface-raised: #141f38;
        --border: #233052;
        --border-glow: #3a5ba0;
        --text: #e9edf7;
        --text-muted: #7c87a8;
        --accent: #00e5ff;
        --accent-2: #7b61ff;
        --accent-glow: rgba(0, 229, 255, 0.45);
        --low: #34ffa0;
        --low-bg: rgba(52, 255, 160, 0.12);
        --low-glow: rgba(52, 255, 160, 0.55);
        --medium: #ffc233;
        --medium-bg: rgba(255, 194, 51, 0.12);
        --medium-glow: rgba(255, 194, 51, 0.55);
        --high: #ff3d6e;
        --high-bg: rgba(255, 61, 110, 0.14);
        --high-glow: rgba(255, 61, 110, 0.65);
        --radius: 12px;
        --font-display: "Rajdhani", -apple-system, system-ui, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Consolas, monospace;
        color-scheme: dark;
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }
      * { box-sizing: border-box; }
      html { overflow-x: hidden; }
      body {
        font-family: var(--font-display);
        font-size: 1.05rem;
        margin: 0;
        color: var(--text);
        line-height: 1.5;
        overflow-x: hidden;
        background:
          radial-gradient(ellipse 1200px 600px at 15% -10%, rgba(123, 97, 255, 0.16), transparent 60%),
          radial-gradient(ellipse 1000px 700px at 100% 0%, rgba(0, 229, 255, 0.10), transparent 55%),
          repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.02) 0px, rgba(255, 255, 255, 0.02) 1px, transparent 1px, transparent 40px),
          repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0px, rgba(255, 255, 255, 0.02) 1px, transparent 1px, transparent 40px),
          var(--bg);
        background-attachment: fixed;
        min-height: 100vh;
      }
      nav {
        position: sticky;
        top: env(safe-area-inset-top, 0px);
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.25rem 0.5rem;
        padding: 0.9rem 1.5rem;
        background: rgba(15, 23, 41, 0.85);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--border);
        z-index: 10;
      }
      nav .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 700;
        font-size: 1.15rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        text-decoration: none;
        margin-right: auto;
        color: var(--text);
      }
      nav .brand span {
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      nav .brand svg { color: var(--accent); }
      .icon-accent { color: var(--accent); }
      a svg { display: inline-block; }
      nav a {
        color: var(--text-muted);
        text-decoration: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      nav a:hover { color: var(--accent); background: rgba(0, 229, 255, 0.08); }
      main {
        max-width: 62rem;
        margin: 0 auto;
        padding: 2rem 1.5rem 3.5rem;
      }
      h1 {
        font-size: 1.9rem;
        font-weight: 700;
        margin: 0 0 0.3rem;
        letter-spacing: 0.01em;
        text-shadow: 0 0 20px var(--accent-glow);
      }
      h2 {
        font-size: 0.95rem;
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin: 2.25rem 0 0.9rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      h2::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--border-glow), transparent); }
      .lede { color: var(--text-muted); margin: 0 0 1.75rem; font-size: 1rem; }
      .card {
        background: linear-gradient(180deg, var(--surface-raised), var(--surface));
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1.4rem 1.6rem;
        margin-bottom: 1.75rem;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02), 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      .chip {
        display: inline-block;
        font-family: var(--font-mono);
        font-size: 0.82rem;
        font-weight: 600;
        background: rgba(0, 229, 255, 0.1);
        border: 1px solid rgba(0, 229, 255, 0.3);
        border-radius: 6px;
        padding: 0.1rem 0.55rem;
        color: var(--accent);
      }
      .stat-row { display: flex; flex-wrap: wrap; gap: 2rem; margin: 0 0 0.25rem; }
      .stat { min-width: 7rem; }
      .stat .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 600; }
      .stat .value { font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; color: var(--text); }
      .table-wrap {
        overflow-x: auto;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      table { border-collapse: collapse; width: 100%; min-width: 30rem; background: var(--surface); }
      th {
        text-align: left;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent);
        background: var(--surface-raised);
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border);
        font-weight: 700;
      }
      td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.95rem; }
      tbody tr:last-child td { border-bottom: none; }
      tbody tr { transition: background 0.15s ease; }
      tbody tr:hover { background: rgba(0, 229, 255, 0.05); }
      a { color: var(--accent); }
      .empty { color: var(--text-muted); font-style: italic; padding: 0.6rem 0; }
      .badge {
        display: inline-block;
        padding: 0.2rem 0.7rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-family: var(--font-mono);
      }
      .severity-low { background: var(--low-bg); color: var(--low); box-shadow: 0 0 10px -2px var(--low-glow) inset, 0 0 8px -3px var(--low-glow); }
      .severity-medium { background: var(--medium-bg); color: var(--medium); box-shadow: 0 0 10px -2px var(--medium-glow) inset, 0 0 8px -3px var(--medium-glow); }
      .severity-high { background: var(--high-bg); color: var(--high); box-shadow: 0 0 10px -2px var(--high-glow) inset, 0 0 8px -3px var(--high-glow); animation: pulse-high 2s ease-in-out infinite; }
      @keyframes pulse-high {
        0%, 100% { box-shadow: 0 0 10px -2px var(--high-glow) inset, 0 0 8px -3px var(--high-glow); }
        50% { box-shadow: 0 0 16px -1px var(--high-glow) inset, 0 0 16px -2px var(--high-glow); }
      }
      @keyframes row-land {
        from { background: rgba(0, 229, 255, 0.22); }
        to { background: transparent; }
      }
      tr.just-landed { animation: row-land 1.6s ease-out; }
      fieldset {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin: 1.75rem 0 0;
        padding: 1.1rem 1.4rem 1.4rem;
        background: rgba(255, 255, 255, 0.015);
      }
      legend {
        padding: 0 0.5rem;
        color: var(--accent);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
      }
      label { display: block; font-size: 0.78rem; color: var(--text-muted); margin: 0.95rem 0 0.35rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
      label:first-of-type { margin-top: 0.2rem; }
      input, select {
        width: 100%;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 7px;
        padding: 0.6rem 0.8rem;
        color: var(--text);
        font-size: 0.98rem;
        font-family: var(--font-display);
      }
      input:focus, select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-glow);
      }
      button {
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        color: #06101f;
        border: none;
        border-radius: 8px;
        padding: 0.65rem 1.4rem;
        font-size: 1rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        cursor: pointer;
        margin-top: 1.1rem;
        box-shadow: 0 0 18px -4px var(--accent-glow);
        transition: transform 0.1s ease, box-shadow 0.15s ease;
      }
      button:hover { box-shadow: 0 0 24px -2px var(--accent-glow); transform: translateY(-1px); }
      button:active { transform: translateY(0); }
      .btn-link {
        display: inline-block;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        color: #06101f;
        text-decoration: none;
        border-radius: 8px;
        padding: 0.6rem 1.3rem;
        font-weight: 700;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        box-shadow: 0 0 18px -4px var(--accent-glow);
      }
      .btn-link:hover { box-shadow: 0 0 24px -2px var(--accent-glow); }
      .live-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--low);
        box-shadow: 0 0 8px 1px var(--low-glow);
        margin-right: 0.4rem;
        animation: blink 1.8s ease-in-out infinite;
      }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      @media (max-width: 600px) {
        main { padding: 1.25rem 1rem 2.5rem; }
        .card { padding: 1.1rem; }
        nav { padding: 0.75rem 1rem; }
        nav .brand { font-size: 1rem; width: 100%; margin-right: 0; }
        nav a { font-size: 0.78rem; padding: 0.35rem 0.5rem; }
        h1 { font-size: 1.5rem; }
        .stat-row { gap: 1.1rem; }
      }
    </style>
  </head>
  <body>
    <nav>
      <a href="/" class="brand">${icon("car", { size: 20 })}<span>CarCheck</span></a>
      <a href="/">Inspections</a><a href="/readme/">About</a>
    </nav>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

// A minimal markdown renderer: ATX headings, paragraphs, unordered/ordered
// lists, and inline `code`/**bold**/*italic*/[links](url). Everything else is
// escaped verbatim. Covers what README.md actually uses; not a general
// markdown implementation.
export function markdownToHtml(md: string): string {
  const inline = (s: string): string =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => `<a href="${href}">${text}</a>`);

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
      list = null;
    }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);

    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (unordered) {
      flushParagraph();
      if (list?.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(unordered[1]);
    } else if (ordered) {
      flushParagraph();
      if (list?.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(ordered[1]);
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();

  return out.join("\n");
}
