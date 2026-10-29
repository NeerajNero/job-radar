/** Minimal, dependency-free HTML → plain text for job descriptions. */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[ent.toLowerCase()] ?? match;
  });
}

const BLOCK_CLOSE = /<\/(p|div|li|h[1-6]|tr|ul|ol|section|article|header|footer|blockquote|pre|table|dd|dt)>/gi;

/** Strip tags, decode entities, collapse whitespace (newlines kept between blocks). */
export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse ships entity-encoded HTML ("&lt;p&gt;"); decode once to expose real tags.
  if (!/<[a-z!/]/i.test(s) && /&lt;/i.test(s)) s = decodeEntities(s);
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(BLOCK_CLOSE, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s
    .replace(/ /g, " ")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}
