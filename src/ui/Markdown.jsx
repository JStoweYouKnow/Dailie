import { useMemo } from "react";
import { safeHref } from "../lib/safeUrl";

/**
 * A small Markdown renderer for imported and typed notes.
 *
 * It builds React elements rather than setting innerHTML, so imported documents can
 * never inject markup into the app. Anything it does not recognise falls through as
 * plain text — the words always survive.
 */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;

// Word exports escape punctuation ("delivery\."), which would otherwise show the
// backslash to the reader.
const ESCAPED = /\\([\\`*_{}\[\]()#+\-.!>~|])/g;
const unescape = (s) => String(s || "").replace(ESCAPED, "$1");

function renderInline(text, keyPrefix) {
  const out = [];
  const parts = String(text || "").split(INLINE);

  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyPrefix}-${i}`;

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(
        <code key={key} style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em", background: "var(--panel-raised)", padding: "1px 5px", borderRadius: 4 }}>
          {part.slice(1, -1)}
        </code>
      );
      return;
    }
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      out.push(<strong key={key}>{unescape(part.slice(2, -2))}</strong>);
      return;
    }
    if (part.startsWith("~~") && part.endsWith("~~")) {
      out.push(<span key={key} style={{ textDecoration: "line-through", opacity: 0.75 }}>{unescape(part.slice(2, -2))}</span>);
      return;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      out.push(<em key={key}>{unescape(part.slice(1, -1))}</em>);
      return;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = link[2];
      // Only ever follow links the browser can safely open.
      const safe = safeHref(href) || null;
      out.push(safe
        ? <a key={key} href={safe} target="_blank" rel="noreferrer noopener" style={{ color: "var(--accent)" }}>{unescape(link[1])}</a>
        : <span key={key}>{unescape(link[1])}</span>);
      return;
    }
    out.push(<span key={key}>{unescape(part)}</span>);
  });

  return out;
}

function parseBlocks(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Fenced code
    if (/^\s*```/.test(line)) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    // Table: a header row followed by a separator row.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: body.join(" ") });
      continue;
    }

    const bullet = /^\s*([-*+])\s+(.*)$/;
    const numbered = /^\s*(\d+)\.\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items = [];
      while (i < lines.length && (bullet.test(lines[i]) || numbered.test(lines[i]))) {
        const m = lines[i].match(ordered ? numbered : bullet);
        items.push(m ? m[2] : lines[i]);
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: consecutive non-blank lines that start nothing else.
    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^\s{0,3}#{1,6}\s/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s/.test(lines[i]) &&
      !/^\s{0,3}>/.test(lines[i]) && !/^\s*```/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ") });
    else i += 1;
  }

  return blocks;
}

export default function Markdown({ source, style, compact }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  const gap = compact ? 6 : 10;

  if (!blocks.length) return null;

  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--bone)", ...style }}>
      {blocks.map((b, i) => {
        const key = `b-${i}`;
        if (b.type === "heading") {
          const size = [17, 15.5, 14.5, 13.5, 13, 12.5][b.level - 1] || 13;
          return (
            <div key={key} className="md-display" style={{ fontSize: size, fontWeight: 800, margin: `${i ? gap + 4 : 0}px 0 ${gap - 4}px`, color: "var(--bone)" }}>
              {renderInline(b.text, key)}
            </div>
          );
        }
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={key} style={{ margin: `${gap - 4}px 0`, paddingLeft: 20 }}>
              {b.items.map((item, j) => (
                <li key={`${key}-${j}`} style={{ marginBottom: 3 }}>{renderInline(item, `${key}-${j}`)}</li>
              ))}
            </Tag>
          );
        }
        if (b.type === "quote") {
          return (
            <div key={key} style={{ margin: `${gap}px 0`, paddingLeft: 12, borderLeft: "2px solid var(--accent)", color: "var(--dim)" }}>
              {renderInline(b.text, key)}
            </div>
          );
        }
        if (b.type === "code") {
          return (
            <pre key={key} className="md-scroll" style={{ margin: `${gap}px 0`, padding: 11, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, overflowX: "auto", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--dim)" }}>
              {b.text}
            </pre>
          );
        }
        if (b.type === "rule") {
          return <div key={key} style={{ height: 1, background: "var(--rule)", margin: `${gap + 4}px 0` }} />;
        }
        if (b.type === "table") {
          return (
            <div key={key} className="md-scroll" style={{ overflowX: "auto", margin: `${gap}px 0`, border: "1px solid var(--rule)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--panel-raised)" }}>
                    {b.header.map((h, j) => (
                      <th key={j} style={{ padding: "7px 10px", textAlign: "left", color: "var(--dim)", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {renderInline(h, `${key}-h-${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r} style={{ borderTop: "1px solid var(--rule)" }}>
                      {row.map((cell, c) => (
                        <td key={c} style={{ padding: "7px 10px" }}>{renderInline(cell, `${key}-${r}-${c}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={key} style={{ margin: `${i ? gap : 0}px 0 0` }}>{renderInline(b.text, key)}</p>
        );
      })}
    </div>
  );
}
