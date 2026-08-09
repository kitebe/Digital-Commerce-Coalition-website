import type { RichTextNode } from "./types";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const safeLink = (value: unknown) => {
  const href = String(value || "").trim();
  return /^(https?:\/\/|mailto:|\/)/i.test(href) ? href : "";
};

const renderMarks = (text: string, marks: RichTextNode["marks"] = []) =>
  marks.reduce((html, mark) => {
    if (mark.type === "bold") return `<strong>${html}</strong>`;
    if (mark.type === "italic") return `<em>${html}</em>`;
    if (mark.type === "underline") return `<u>${html}</u>`;
    if (mark.type === "strike") return `<s>${html}</s>`;
    if (mark.type === "code") return `<code>${html}</code>`;
    if (mark.type === "link") {
      const href = safeLink(mark.attrs?.href);
      return href ? `<a href="${escapeHtml(href)}">${html}</a>` : html;
    }
    return html;
  }, text);

const renderNode = (node: RichTextNode): string => {
  if (node.type === "text") return renderMarks(escapeHtml(node.text), node.marks);

  const children = (node.content || []).map(renderNode).join("");
  if (node.type === "doc") return children;
  if (node.type === "paragraph") return `<p>${children || "<br>"}</p>`;
  if (node.type === "heading") {
    const level = Number(node.attrs?.level) === 3 ? 3 : 2;
    return `<h${level}>${children}</h${level}>`;
  }
  if (node.type === "bulletList") return `<ul>${children}</ul>`;
  if (node.type === "orderedList") return `<ol>${children}</ol>`;
  if (node.type === "listItem") return `<li>${children}</li>`;
  if (node.type === "blockquote") return `<blockquote>${children}</blockquote>`;
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  if (node.type === "codeBlock") return `<pre><code>${children}</code></pre>`;
  if (node.type === "figureImage") {
    const src = String(node.attrs?.src || "");
    if (!src) return "";
    const alt = escapeHtml(node.attrs?.alt);
    const caption = String(node.attrs?.caption || "").trim();
    return `<figure data-cms-image><img src="${escapeHtml(src)}" alt="${alt}">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
  }
  if (node.type === "table") return `<table><tbody>${children}</tbody></table>`;
  if (node.type === "tableRow") return `<tr>${children}</tr>`;
  if (node.type === "tableHeader") return `<th>${children}</th>`;
  if (node.type === "tableCell") return `<td>${children}</td>`;
  return children;
};

export const cmsRichTextToHtml = (value: unknown): string => {
  if (typeof value === "string") return value.trim() === "[object Object]" ? "" : value;
  if (Array.isArray(value)) return value.map((item) => cmsRichTextToHtml(item)).join("");
  if (!value || typeof value !== "object") return "";
  return renderNode(value as RichTextNode);
};

const normalizePlainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Moves the retired lead field into the article body without duplicating it. */
export const mergeCmsBlogIntro = (intro: unknown, body: unknown): string => {
  const bodyHtml = cmsRichTextToHtml(body);
  const introText = String(intro ?? "").trim();
  if (!introText) return bodyHtml;

  const normalizedIntro = normalizePlainText(introText);
  const normalizedBody = normalizePlainText(bodyHtml);
  if (bodyHtml.includes("data-blog-intro") || normalizedBody.startsWith(normalizedIntro)) {
    return bodyHtml;
  }

  const introHtml = escapeHtml(introText).replace(/\r?\n/g, "<br>");
  return `<blockquote data-blog-intro="true"><p>${introHtml}</p></blockquote>${bodyHtml}`;
};
