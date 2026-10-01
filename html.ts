export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
      nav a { margin-right: 1rem; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      th, td { text-align: left; border-bottom: 1px solid #ddd; padding: 0.4rem 0.6rem; }
      .severity-low { color: #2a7a2a; }
      .severity-medium { color: #a86b00; }
      .severity-high { color: #b00020; font-weight: bold; }
      form.inline { display: inline; }
      fieldset { border: 1px solid #ccc; margin: 1rem 0; }
      label { display: block; margin: 0.5rem 0 0.2rem; }
    </style>
  </head>
  <body>
    <nav><a href="/">Inspections</a><a href="/readme/">About</a></nav>
    ${body}
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
