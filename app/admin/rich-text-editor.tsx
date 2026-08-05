"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { cmsRichTextExtensions } from "../../lib/cms/rich-text";
import type { RichTextDocument } from "../../lib/cms/types";

type RichTextEditorProps = {
  value: RichTextDocument;
  onChange: (value: RichTextDocument) => void;
  onUpload: (file: File) => Promise<string | undefined>;
  error?: string;
};

export function RichTextEditor({ value, onChange, onUpload, error }: RichTextEditorProps) {
  const uploadInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertImage = async (file: File) => {
    const alt = window.prompt("Describe this image for people using screen readers:", file.name.replace(/\.[^.]+$/, ""));
    if (!alt?.trim()) {
      window.alert("Alternative text is required before inserting an image.");
      return;
    }
    const caption = window.prompt("Optional caption:", "") || "";
    setUploading(true);
    const src = await onUpload(file);
    setUploading(false);
    if (src) editor?.chain().focus().insertContent({ type: "figureImage", attrs: { src, alt: alt.trim(), caption: caption.trim() } }).run();
  };

  const editor = useEditor({
    extensions: cmsRichTextExtensions((files) => { void Promise.all(files.map(insertImage)); }),
    content: value,
    immediatelyRender: false,
    editorProps: { attributes: { class: "cms-rich-editor-content", "aria-label": "Rich text content" } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as RichTextDocument),
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value);
    if (current !== next) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const setLink = () => {
    if (!editor) return;
    const current = String(editor.getAttributes("link").href || "");
    const href = window.prompt("Link URL", current || "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const addYoutube = () => {
    const src = window.prompt("YouTube URL", "https://www.youtube.com/watch?v=");
    if (src?.trim()) editor?.commands.setYoutubeVideo({ src: src.trim(), width: 960, height: 540 });
  };

  if (!editor) return <div className="cms-rich-editor-loading">Loading editor…</div>;

  const command = (label: string, active: boolean, run: () => void) => (
    <button type="button" aria-label={label} title={label} className={active ? "is-active" : ""} onClick={run}>{label}</button>
  );

  return (
    <div className={`cms-rich-editor${error ? " has-error" : ""}`}>
      <div className="cms-rich-toolbar" role="toolbar" aria-label="Text formatting">
        {command("Undo", false, () => editor.chain().focus().undo().run())}
        {command("Redo", false, () => editor.chain().focus().redo().run())}
        <span />
        {command("Paragraph", editor.isActive("paragraph"), () => editor.chain().focus().setParagraph().run())}
        {command("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {command("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        {command("Bold", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
        {command("Italic", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
        {command("Underline", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run())}
        {command("Bullets", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
        {command("Numbers", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
        {command("Quote", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
        {command("Code", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}
        {command("Link", editor.isActive("link"), setLink)}
        {command("Divider", false, () => editor.chain().focus().setHorizontalRule().run())}
        {command("Table", editor.isActive("table"), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {editor.isActive("table") ? command("Add row", false, () => editor.chain().focus().addRowAfter().run()) : null}
        {editor.isActive("table") ? command("Add column", false, () => editor.chain().focus().addColumnAfter().run()) : null}
        {editor.isActive("table") ? command("Delete table", false, () => editor.chain().focus().deleteTable().run()) : null}
        {command("YouTube", false, addYoutube)}
        <button type="button" disabled={uploading} onClick={() => uploadInput.current?.click()}>{uploading ? "Uploading…" : "Image"}</button>
        <input ref={uploadInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void insertImage(file);
          event.target.value = "";
        }} />
      </div>
      <EditorContent editor={editor} />
      {error ? <small className="cms-field-error">{error}</small> : null}
    </div>
  );
}
