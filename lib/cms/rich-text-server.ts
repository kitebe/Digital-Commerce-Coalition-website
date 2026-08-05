import "server-only";

import { generateHTML } from "@tiptap/html";
import { cmsRichTextExtensions } from "./rich-text";
import type { RichTextDocument } from "./types";

export const renderRichText = (document: RichTextDocument) =>
  generateHTML(document, cmsRichTextExtensions());
