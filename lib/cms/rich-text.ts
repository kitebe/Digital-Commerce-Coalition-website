import { Extension, mergeAttributes, Node, type Extensions, type JSONContent } from "@tiptap/core";
import FileHandler from "@tiptap/extension-file-handler";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";
import type { RichTextDocument, RichTextNode } from "./types";

export const emptyRichTextDocument = (): RichTextDocument => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

export const paragraphsToRichText = (paragraphs: string[]): RichTextDocument => ({
  type: "doc",
  content: paragraphs.length
    ? paragraphs.map((paragraph) => ({
        type: "paragraph",
        content: paragraph ? [{ type: "text", text: paragraph }] : undefined,
      }))
    : [{ type: "paragraph" }],
});

export const richTextToPlainText = (document: RichTextDocument) => {
  const parts: string[] = [];
  const visit = (node: RichTextNode) => {
    if (node.text) parts.push(node.text);
    node.content?.forEach(visit);
    if (["paragraph", "heading", "blockquote", "codeBlock"].includes(node.type || "")) {
      parts.push("\n");
    }
  };
  visit(document);
  return parts.join(" ").replace(/\s+/g, " ").trim();
};

export const FigureImage = Node.create({
  name: "figureImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-cms-image]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const image = element.querySelector("img");
          return {
            src: image?.getAttribute("src") || "",
            alt: image?.getAttribute("alt") || "",
            caption: element.querySelector("figcaption")?.textContent || "",
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { caption, ...imageAttributes } = HTMLAttributes;
    const children: unknown[] = [
      "img",
      mergeAttributes(imageAttributes, { loading: "lazy" }),
    ];
    return caption
      ? ["figure", { "data-cms-image": "" }, children, ["figcaption", {}, String(caption)]]
      : ["figure", { "data-cms-image": "" }, children];
  },
});

const CleanPastedMarkup = Extension.create({
  name: "cleanPastedMarkup",
  transformPastedHTML(html) {
    return html
      .replace(/\s(?:style|class|id)=("[^"]*"|'[^']*')/gi, "")
      .replace(/<(?:script|style|iframe)[^>]*>[\s\S]*?<\/(?:script|style|iframe)>/gi, "");
  },
});

export const cmsRichTextExtensions = (onFiles?: (files: File[]) => void): Extensions => [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      defaultProtocol: "https",
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      isAllowedUri: (url, context) =>
        context.defaultValidate(url) && /^(https?:|mailto:|\/)/i.test(url),
    },
  }),
  FigureImage,
  CleanPastedMarkup,
  TableKit.configure({ table: { resizable: true } }),
  Youtube.configure({ nocookie: true, controls: true }),
  FileHandler.configure({
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    onDrop: (_editor, files) => onFiles?.(files),
    onPaste: (_editor, files) => onFiles?.(files),
  }),
];

export const asTiptapContent = (document: RichTextDocument): JSONContent => document;
