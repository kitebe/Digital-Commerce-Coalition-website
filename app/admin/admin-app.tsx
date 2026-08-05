"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { emptyRichTextDocument } from "../../lib/cms/rich-text";
import type { CmsCollection, CmsContent, CmsEntry, RichTextDocument } from "../../lib/cms/types";
import { RichTextEditor } from "./rich-text-editor";

type AdminAppProps = { configured: boolean; authenticated: boolean; initialContent: CmsContent | null; loginError: string };
type EditorItem = Record<string, unknown>;
type FieldKind = "text" | "textarea" | "repeater" | "select" | "asset" | "date" | "month" | "url" | "richText";
type Field = { key: string; label: string; kind?: FieldKind; group?: "content" | "media" | "sidebar"; help?: string; options?: string[]; accept?: string };
type CollectionConfig = { label: string; singular: string; titleKey: "title" | "name"; titleLabel: string; description: string; fields: Field[]; create: (position: number) => EditorItem };
type SaveAction = "save-draft" | "publish" | "save-published" | "unpublish";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const collectionOrder: CmsCollection[] = ["blogPosts", "events", "publications", "reports", "pressCoverage", "members"];
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const newWorkflow = () => ({ id: "new", version: 0, publishState: "draft", createdAt: "", updatedAt: "" });

const configs: Record<CmsCollection, CollectionConfig> = {
  blogPosts: {
    label: "Articles", singular: "article", titleKey: "title", titleLabel: "Article title", description: "Long-form perspectives shown in the Coalition blog.",
    fields: [
      { key: "title", label: "Title" }, { key: "date", label: "Published date", kind: "date", group: "sidebar" },
      { key: "category", label: "Category", group: "sidebar" }, { key: "author", label: "Author", group: "sidebar" },
      { key: "excerpt", label: "Excerpt", kind: "textarea" }, { key: "intro", label: "Lead paragraph", kind: "textarea" },
      { key: "body", label: "Article body", kind: "richText", help: "Use headings, lists, images, tables, and video to structure the story." },
      { key: "takeaways", label: "Key takeaways", kind: "repeater", help: "One takeaway per line." },
      { key: "image", label: "Feature image", kind: "asset", group: "media", accept: "image/*" },
      { key: "imageAlt", label: "Feature image description", group: "media" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled article", slug: `untitled-article-${position + 1}`, date: "", category: "Coalition perspectives", author: "Digital Commerce Coalition", excerpt: "", intro: "", body: emptyRichTextDocument(), takeaways: [], image: "", imageAlt: "", previousSlugs: [] }),
  },
  events: {
    label: "Events", singular: "event", titleKey: "title", titleLabel: "Event title", description: "Upcoming and past Coalition convenings.",
    fields: [
      { key: "title", label: "Title" }, { key: "eventDate", label: "Event date", kind: "date", group: "sidebar" },
      { key: "format", label: "Format", group: "sidebar" }, { key: "location", label: "Location", group: "sidebar" },
      { key: "summary", label: "Summary", kind: "textarea" },
      { key: "body", label: "Event details", kind: "richText" },
      { key: "topics", label: "Topics", kind: "repeater", help: "One topic per line." },
      { key: "linkLabel", label: "Link label" },
      { key: "image", label: "Event image", kind: "asset", group: "media", accept: "image/*" },
      { key: "imageAlt", label: "Event image description", group: "media" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled event", slug: `untitled-event-${position + 1}`, eventDate: "", format: "Roundtable", location: "", summary: "", body: emptyRichTextDocument(), topics: [], linkLabel: "Read more", image: "", imageAlt: "", previousSlugs: [] }),
  },
  publications: {
    label: "Publications", singular: "publication", titleKey: "title", titleLabel: "Publication title", description: "Briefs, perspectives, and downloadable publications.",
    fields: [
      { key: "title", label: "Title" }, { key: "shortTitle", label: "Short title" },
      { key: "type", label: "Publication type", group: "sidebar" }, { key: "date", label: "Published month", kind: "month", group: "sidebar" },
      { key: "pages", label: "Length", group: "sidebar" }, { key: "description", label: "Card description", kind: "textarea" },
      { key: "body", label: "Publication details", kind: "richText" },
      { key: "themes", label: "Themes", kind: "repeater" },
      { key: "coverImage", label: "Cover image", kind: "asset", group: "media", accept: "image/*" },
      { key: "accent", label: "Cover accent", kind: "select", group: "media", options: ["cyan", "lavender", "violet"] },
      { key: "pdf", label: "PDF", kind: "asset", group: "media", accept: "application/pdf" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled publication", shortTitle: "Untitled", slug: `untitled-publication-${position + 1}`, type: "Coalition brief", date: "", pages: null, description: "", body: emptyRichTextDocument(), coverImage: "", accent: "cyan", pdf: null, themes: [], previousSlugs: [] }),
  },
  reports: {
    label: "Reports", singular: "report", titleKey: "title", titleLabel: "Report title", description: "Coalition reports and downloadable reviews.",
    fields: [
      { key: "title", label: "Title" }, { key: "type", label: "Report type", group: "sidebar" },
      { key: "date", label: "Published month", kind: "month", group: "sidebar" }, { key: "description", label: "Description", kind: "textarea" },
      { key: "coverImage", label: "Cover image", kind: "asset", group: "media", accept: "image/*" },
      { key: "pdf", label: "PDF", kind: "asset", group: "media", accept: "application/pdf" },
    ],
    create: () => ({ ...newWorkflow(), title: "Untitled report", type: "Coalition report", date: "", description: "", coverImage: "", pdf: null }),
  },
  pressCoverage: {
    label: "Press", singular: "press item", titleKey: "title", titleLabel: "Press headline", description: "External media coverage and announcements.",
    fields: [
      { key: "title", label: "Headline" }, { key: "publication", label: "Publication", group: "sidebar" },
      { key: "date", label: "Published date", kind: "date", group: "sidebar" }, { key: "url", label: "Article URL", kind: "url" },
    ],
    create: () => ({ ...newWorkflow(), title: "Untitled press item", publication: "", date: "", url: "https://" }),
  },
  members: {
    label: "Members", singular: "member", titleKey: "name", titleLabel: "Organisation name", description: "Organisations shown in the homepage Members section.",
    fields: [
      { key: "name", label: "Organisation name" },
      { key: "logo", label: "Logo", kind: "asset", group: "media", accept: "image/jpeg,image/png,image/webp,image/gif" },
      { key: "logoAlt", label: "Accessible logo text", group: "media", help: "Usually the organisation name." },
    ],
    create: () => ({ ...newWorkflow(), name: "Untitled member", logo: "", logoAlt: "" }),
  },
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const getItems = (content: CmsContent, collection: CmsCollection) => content[collection] as CmsEntry[];
const itemTitle = (item: EditorItem) => String(item.title || item.name || item.publication || "Untitled item");
const itemDetail = (collection: CmsCollection, item: EditorItem) => collection === "members" ? "Homepage member" : String(item.category || item.type || item.publication || item.format || "Content");
const itemStatus = (item: EditorItem) => item.publishState === "draft" ? "draft" : "published";
const itemDate = (item: EditorItem) => String(item.date || item.eventDate || item.updatedAt || "—");
const formatUpdatedAt = (value: unknown) => {
  if (!value) return "Not saved yet";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
};
const snapshot = (item: EditorItem | null) => item ? JSON.stringify(item) : "";

export function AdminApp({ configured, authenticated, initialContent, loginError }: AdminAppProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [activeCollection, setActiveCollection] = useState<CmsCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorItem | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [slugUnlocked, setSlugUnlocked] = useState(false);

  const items = useMemo(() => content && activeCollection ? getItems(content, activeCollection) : [], [activeCollection, content]);
  const isNew = selectedId === "new";
  const isDirty = Boolean(draft && snapshot(draft) !== savedSnapshot);

  useEffect(() => {
    document.body.className = "cms-body";
    return () => { document.body.classList.remove("cms-body"); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const canLeaveEditor = () => !isDirty || window.confirm("Discard your unsaved changes?");
  const resetEditor = () => { setSelectedId(null); setDraft(null); setSavedSnapshot(""); setFieldErrors({}); setMessage(""); setStatus("idle"); setSlugUnlocked(false); };
  const selectCollection = (collection: CmsCollection, id?: string) => {
    if (!canLeaveEditor()) return;
    setActiveCollection(collection); resetEditor(); setSearchQuery(""); setStatusFilter("all");
    if (id && content) {
      const item = getItems(content, collection).find((entry) => entry.id === id);
      if (item) { const next = clone(item as unknown as EditorItem); setSelectedId(item.id); setDraft(next); setSavedSnapshot(snapshot(next)); }
    }
  };
  const selectItem = (item: CmsEntry) => {
    const next = clone(item as unknown as EditorItem);
    setSelectedId(item.id); setDraft(next); setSavedSnapshot(snapshot(next)); setFieldErrors({}); setMessage(""); setStatus("idle"); setSlugUnlocked(false);
  };
  const updateDraft = (key: string, value: unknown) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (isNew && key === "title") next.slug = slugify(String(value)) || "untitled";
      if (isNew && activeCollection === "members" && key === "name" && !String(current.logoAlt || "").trim()) next.logoAlt = String(value);
      return next;
    });
    setFieldErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setStatus("idle"); setMessage("");
  };
  const parseResponse = async (response: Response) => await response.json() as { content?: CmsContent; error?: string; fieldErrors?: Record<string, string> };
  const applySaveResult = (result: { content?: CmsContent; error?: string; fieldErrors?: Record<string, string> }, response: Response, wasNew: boolean) => {
    if (!response.ok || !result.content || !activeCollection) {
      setStatus("error"); setMessage(result.error || "Could not save this entry."); setFieldErrors(result.fieldErrors || {}); return false;
    }
    setContent(result.content);
    const refreshedItems = getItems(result.content, activeCollection);
    const saved = wasNew ? refreshedItems.at(-1) : refreshedItems.find((entry) => entry.id === selectedId);
    if (saved) { const next = clone(saved as unknown as EditorItem); setSelectedId(saved.id); setDraft(next); setSavedSnapshot(snapshot(next)); }
    setFieldErrors({}); setStatus("saved"); return true;
  };
  const saveItem = async (action: SaveAction) => {
    if (!activeCollection || !draft) return;
    setStatus("saving"); setMessage("");
    const wasNew = isNew;
    const response = await fetch("/api/cms/content", {
      method: wasNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wasNew
        ? { collection: activeCollection, action, item: draft }
        : { collection: activeCollection, action, id: selectedId, version: draft.version, item: draft }),
    });
    const result = await parseResponse(response);
    if (applySaveResult(result, response, wasNew)) {
      setMessage(action === "publish" || action === "save-published" ? "Published changes saved." : action === "unpublish" ? "Entry moved to drafts." : "Draft saved.");
      setSlugUnlocked(false);
    }
  };
  const createItem = () => {
    if (!activeCollection) return;
    const next = configs[activeCollection].create(items.length);
    setSelectedId("new"); setDraft(next); setSavedSnapshot(snapshot(next)); setFieldErrors({}); setMessage(""); setStatus("idle"); setSlugUnlocked(true);
  };
  const deleteItem = async () => {
    if (!activeCollection || !draft || isNew || !window.confirm(`Delete “${itemTitle(draft)}”? This cannot be undone.`)) return;
    setStatus("saving");
    const response = await fetch("/api/cms/content", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: activeCollection, id: selectedId, version: draft.version }) });
    const result = await parseResponse(response);
    if (!response.ok || !result.content) { setStatus("error"); setMessage(result.error || "Could not delete this entry."); return; }
    setContent(result.content); resetEditor();
  };
  const moveItem = async (direction: -1 | 1) => {
    if (!activeCollection || !selectedId || isNew) return;
    const index = items.findIndex((item) => item.id === selectedId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= items.length) return;
    const ordered = [...items]; [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    const response = await fetch("/api/cms/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: activeCollection, action: "reorder", orderedIds: ordered.map((item) => item.id) }) });
    const result = await parseResponse(response);
    if (response.ok && result.content) setContent(result.content); else { setStatus("error"); setMessage(result.error || "Could not change display order."); }
  };
  const uploadFile = async (file: File, fieldKey = "body") => {
    setUploadingField(fieldKey); setMessage("");
    const body = new FormData(); body.append("file", file);
    const response = await fetch("/api/cms/media", { method: "POST", body });
    const result = await response.json() as { url?: string; error?: string };
    setUploadingField(null);
    if (!response.ok || !result.url) { setStatus("error"); setMessage(result.error || "Upload failed."); return undefined; }
    return result.url;
  };

  if (!configured) return <CmsSetup />;
  if (!authenticated || !content) return <CmsLogin error={loginError} />;

  const activeConfig = activeCollection ? configs[activeCollection] : null;
  const filteredItems = items.filter((item) => itemTitle(item as unknown as EditorItem).toLowerCase().includes(searchQuery.toLowerCase().trim()) && (statusFilter === "all" || itemStatus(item as unknown as EditorItem) === statusFilter));
  const publishedCount = items.filter((item) => item.publishState === "published").length;
  const draftCount = items.length - publishedCount;
  const currentIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : -1;
  const hasSlug = Boolean(draft && "slug" in draft);
  const titleKey = activeConfig?.titleKey || "title";
  const contentFields = activeConfig?.fields.filter((field) => (field.group || "content") === "content" && field.key !== titleKey) || [];
  const sidebarFields = activeConfig?.fields.filter((field) => field.group === "sidebar") || [];

  return (
    <div className="cms-shell">
      <aside className="cms-sidebar">
        <a className="cms-brand" href="/admin" aria-label="Digital Commerce Coalition CMS"><span className="cms-brand-mark">DCC</span><span><strong>Coalition CMS</strong><small>Content workspace</small></span></a>
        <nav className="cms-nav" aria-label="CMS sections">
          <button className={!activeCollection ? "is-active" : ""} onClick={() => { if (canLeaveEditor()) { setActiveCollection(null); resetEditor(); } }}><span className="cms-nav-icon">⌂</span><span>Dashboard</span></button>
          {collectionOrder.map((collection) => <button key={collection} className={activeCollection === collection ? "is-active" : ""} onClick={() => selectCollection(collection)}><span className="cms-nav-icon">{configs[collection].label.charAt(0)}</span><span>{configs[collection].label}</span><span className="cms-nav-count">{getItems(content, collection).length}</span></button>)}
        </nav>
        <div className="cms-sidebar-footer"><a href="/" target="_blank" rel="noreferrer">View website ↗</a><button onClick={async () => { await fetch("/api/cms/session", { method: "DELETE" }); router.refresh(); }}>Sign out</button></div>
      </aside>
      <main className="cms-main">
        <header className="cms-topbar"><div><span className="cms-live-dot" /> Website connected</div><div className="cms-topbar-actions"><a href="/" target="_blank" rel="noreferrer">Open website ↗</a><span className="cms-avatar">DC</span></div></header>
        {!activeCollection ? <CmsOverview content={content} onOpen={selectCollection} /> : !draft ? (
          <>
            <header className="cms-page-header"><div><p className="cms-eyebrow">Content library</p><h1>{activeConfig?.label}</h1><p>{activeConfig?.description}</p></div><button className="cms-primary-button" onClick={createItem}><span>＋</span> New {activeConfig?.singular}</button></header>
            <section className="cms-library-card">
              <div className="cms-library-toolbar"><label className="cms-search-field"><span>⌕</span><input aria-label="Search content" placeholder={`Search ${activeConfig?.label.toLowerCase()}…`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label><div className="cms-filter-tabs" aria-label="Filter by status">{(["all", "published", "draft"] as const).map((filter) => <button key={filter} className={statusFilter === filter ? "is-active" : ""} onClick={() => setStatusFilter(filter)}>{filter === "all" ? `All ${items.length}` : filter === "published" ? `Published ${publishedCount}` : `Drafts ${draftCount}`}</button>)}</div></div>
              <div className="cms-content-table" role="table" aria-label={`${activeConfig?.label} content`}>
                <div className="cms-table-head" role="row"><span>Title</span><span>Type</span><span>Status</span><span>Date</span><span /></div>
                {filteredItems.map((item) => <button className="cms-table-row" key={item.id} onClick={() => selectItem(item)} role="row"><span className="cms-table-title"><strong>{itemTitle(item as unknown as EditorItem)}</strong><small>{"slug" in item ? item.slug : item.id}</small></span><span>{itemDetail(activeCollection, item as unknown as EditorItem)}</span><span><i className={`cms-status-badge is-${item.publishState}`}>{item.publishState}</i></span><span>{itemDate(item as unknown as EditorItem)}</span><span className="cms-row-arrow">→</span></button>)}
                {!filteredItems.length ? <div className="cms-table-empty"><strong>No matching content</strong><span>Try another search or status filter.</span></div> : null}
              </div>
            </section>
          </>
        ) : (
          <section className="cms-editor-view">
            <header className="cms-editor-header">
              <div className="cms-editor-heading"><button className="cms-back-button" onClick={() => { if (canLeaveEditor()) resetEditor(); }} aria-label={`Back to ${activeConfig?.label}`}>←</button><div className="cms-editor-title-area"><p><button onClick={() => { if (canLeaveEditor()) resetEditor(); }}>{activeConfig?.label}</button><span>/</span>{isNew ? "New" : "Edit"}</p><label className={`cms-editor-title-field${fieldErrors[titleKey] ? " has-error" : ""}`}><span>{activeConfig?.titleLabel}</span><input value={String(draft[titleKey] || "")} placeholder={`Add ${activeConfig?.titleLabel.toLowerCase()}`} onChange={(event) => updateDraft(titleKey, event.target.value)} />{fieldErrors[titleKey] ? <small className="cms-field-error">{fieldErrors[titleKey]}</small> : null}</label></div></div>
              <div className="cms-editor-header-actions">
                {!isNew ? <a className="cms-preview-button" href={`/api/cms/preview?collection=${activeCollection}&id=${selectedId}`} target="_blank" rel="noreferrer">Preview ↗</a> : null}
                {itemStatus(draft) === "draft" ? <><button className="cms-secondary-button" onClick={() => void saveItem("save-draft")} disabled={status === "saving"}>Save draft</button><button className="cms-primary-button" onClick={() => void saveItem("publish")} disabled={status === "saving"}>Publish</button></> : <><button className="cms-secondary-button" onClick={() => { if (window.confirm("Unpublish this entry and move it to drafts?")) void saveItem("unpublish"); }} disabled={status === "saving"}>Unpublish</button><button className="cms-primary-button" onClick={() => void saveItem("save-published")} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save changes"}</button></>}
              </div>
            </header>
            <div className={`cms-editor-notice is-${status}`} role="status">{Object.keys(fieldErrors).length ? `Fix ${Object.keys(fieldErrors).length} highlighted field${Object.keys(fieldErrors).length === 1 ? "" : "s"}.` : message || (isDirty ? "Unsaved changes" : itemStatus(draft) === "published" ? "This entry is live on the website." : "This entry is only visible in the CMS.")}</div>
            <div className="cms-editor-layout">
              <div className="cms-editor-content">
                {contentFields.length ? <EditorSection title="Content" description="The main information visitors will see.">{contentFields.map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={uploadingField === field.key} onChange={(value) => updateDraft(field.key, value)} onUpload={async (file) => { const url = await uploadFile(file, field.key); if (url) updateDraft(field.key, url); return url; }} />)}</EditorSection> : null}
                {activeConfig?.fields.some((field) => field.group === "media") ? <EditorSection title="Media" description="Images and downloadable files used by this entry.">{activeConfig.fields.filter((field) => field.group === "media").map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={uploadingField === field.key} onChange={(value) => updateDraft(field.key, value)} onUpload={async (file) => { const url = await uploadFile(file, field.key); if (url) updateDraft(field.key, url); return url; }} />)}</EditorSection> : null}
              </div>
              <aside className="cms-editor-aside">
                <header className="cms-inspector-header"><div><strong>Entry settings</strong><span>{isNew ? `New ${activeConfig?.singular}` : `Updated ${formatUpdatedAt(draft.updatedAt)}`}</span></div><i className={`cms-status-badge is-${itemStatus(draft)}`}>{itemStatus(draft)}</i></header>
                {sidebarFields.length ? <section className="cms-document-details"><p className="cms-aside-label">{activeConfig?.singular} details</p><div className="cms-sidebar-fields">{sidebarFields.map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={false} onChange={(value) => updateDraft(field.key, value)} onUpload={async () => undefined} />)}</div></section> : null}
                {hasSlug ? <section className="cms-settings-panel"><p className="cms-aside-label">Settings</p><label className={`cms-field${fieldErrors.slug ? " has-error" : ""}`}><span>URL slug</span><input value={String(draft.slug || "")} readOnly={!slugUnlocked} onChange={(event) => updateDraft("slug", slugify(event.target.value))} /><small>/{activeCollection === "events" ? "event?event=" : activeCollection === "publications" ? "publication?slug=" : "blog-post?post="}{String(draft.slug || "")}</small>{fieldErrors.slug ? <small className="cms-field-error">{fieldErrors.slug}</small> : null}</label>{!slugUnlocked ? <button className="cms-unlock-button" onClick={() => { if (window.confirm("Changing a published URL can affect shared links. The previous URL will continue to resolve.")) setSlugUnlocked(true); }}>Edit slug</button> : <p className="cms-settings-warning">Slug editing is unlocked. Save carefully.</p>}</section> : null}
                {!isNew ? <section><p className="cms-aside-label">Display order</p><div className="cms-order-control"><span>Position {currentIndex + 1} of {items.length}</span><div><button onClick={() => void moveItem(-1)} disabled={currentIndex <= 0}>↑</button><button onClick={() => void moveItem(1)} disabled={currentIndex >= items.length - 1}>↓</button></div></div></section> : null}
                <section className="cms-danger-zone"><p className="cms-aside-label">Entry actions</p><button onClick={isNew ? () => { if (canLeaveEditor()) resetEditor(); } : () => void deleteItem()}>{isNew ? "Discard entry" : "Delete entry"}</button></section>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function EditorSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="cms-editor-section"><header><h2>{title}</h2><p>{description}</p></header><div className="cms-form">{children}</div></section>;
}

function CmsField({ field, value, error, uploading, onChange, onUpload }: { field: Field; value: unknown; error?: string; uploading: boolean; onChange: (value: unknown) => void; onUpload: (file: File) => Promise<string | undefined> }) {
  const stringValue = Array.isArray(value) ? value.join("\n") : value == null ? "" : String(value);
  if (field.kind === "richText") return <div className="cms-field cms-field-richText"><span>{field.label}</span>{field.help ? <small>{field.help}</small> : null}<RichTextEditor value={(value || emptyRichTextDocument()) as RichTextDocument} onChange={onChange} onUpload={onUpload} error={error} /></div>;
  return (
    <label className={`cms-field cms-field-${field.kind || "text"}${error ? " has-error" : ""}`}>
      <span>{field.label}</span>{field.help ? <small>{field.help}</small> : null}
      {field.kind === "textarea" || field.kind === "repeater" ? <textarea rows={field.kind === "repeater" ? 5 : 4} value={stringValue} onChange={(event) => onChange(field.kind === "repeater" ? event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) : event.target.value)} /> : field.kind === "select" ? <select value={stringValue} onChange={(event) => onChange(event.target.value)}>{field.options?.map((option) => <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>)}</select> : field.kind === "asset" ? <div className="cms-asset-field"><input value={stringValue} onChange={(event) => onChange(event.target.value)} /><label className="cms-upload-button">{uploading ? "Uploading…" : stringValue ? "Replace" : "Upload"}<input type="file" accept={field.accept} disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.target.value = ""; }} /></label>{stringValue ? <button type="button" className="cms-remove-asset" onClick={() => onChange(field.key === "pdf" ? null : "")}>Remove</button> : null}{stringValue && field.accept?.includes("image") ? <img className="cms-asset-preview" src={stringValue.replace(/^\.\//, "/")} alt="" /> : null}</div> : <input type={field.kind === "date" ? "date" : field.kind === "month" ? "month" : field.kind === "url" ? "url" : "text"} value={stringValue} onChange={(event) => onChange(event.target.value)} />}
      {error ? <small className="cms-field-error">{error}</small> : null}
    </label>
  );
}

function CmsOverview({ content, onOpen }: { content: CmsContent; onOpen: (collection: CmsCollection, id?: string) => void }) {
  const allItems = collectionOrder.flatMap((collection) => getItems(content, collection).map((item) => ({ collection, item })));
  const total = allItems.length; const published = allItems.filter(({ item }) => item.publishState === "published").length;
  const recentItems = [...allItems].sort((left, right) => right.item.updatedAt.localeCompare(left.item.updatedAt)).slice(0, 6);
  return <div className="cms-overview"><header className="cms-overview-header"><div><p className="cms-eyebrow">Workspace overview</p><h1>Good afternoon</h1><p>Here’s what’s happening across the Coalition website.</p></div></header><section className="cms-stats-grid" aria-label="Content status summary"><div><span>Total entries</span><strong>{total}</strong><small>Across {collectionOrder.length} collections</small></div><div><span>Published</span><strong>{published}</strong><small>Visible on the website</small></div><div><span>Drafts</span><strong>{total - published}</strong><small>Awaiting publication</small></div></section><div className="cms-section-heading"><div><h2>Collections</h2><p>Browse and manage your content types.</p></div></div><section className="cms-overview-grid" aria-label="Content collections">{collectionOrder.map((collection) => <button key={collection} onClick={() => onOpen(collection)}><span className="cms-card-letter">{configs[collection].label.charAt(0)}</span><span className="cms-card-count">{getItems(content, collection).length}</span><strong>{configs[collection].label}</strong><p>{configs[collection].description}</p><span className="cms-card-link">Manage content →</span></button>)}</section><section className="cms-recent-card"><div className="cms-section-heading"><div><h2>Recent content</h2><p>Entries across all collections.</p></div></div><div className="cms-recent-list">{recentItems.map(({ collection, item }) => <button key={item.id} onClick={() => onOpen(collection, item.id)}><span className="cms-recent-icon">{configs[collection].label.charAt(0)}</span><span><strong>{itemTitle(item as unknown as EditorItem)}</strong><small>{configs[collection].label}</small></span><i className={`cms-status-badge is-${item.publishState}`}>{item.publishState}</i><span className="cms-recent-date">{formatUpdatedAt(item.updatedAt)}</span><span>→</span></button>)}</div></section></div>;
}

function CmsLogin({ error }: { error: string }) {
  return <main className="cms-auth-page"><section className="cms-login-card"><a href="/" className="cms-login-brand"><img src="/assets/Dcc_logo.svg" alt="Digital Commerce Coalition" /></a><p className="cms-eyebrow">Content studio</p><h1>Welcome back</h1><p>Sign in to manage website content.</p><form action="/api/cms/session" method="post"><label><span>Password</span><input name="password" type="password" autoComplete="current-password" autoFocus required /></label>{error ? <p className="cms-auth-error">{error}</p> : null}<button className="cms-primary-button" type="submit">Sign in</button></form><a className="cms-back-link" href="/">← Back to website</a></section></main>;
}

function CmsSetup() {
  return <main className="cms-auth-page"><section className="cms-login-card cms-setup-card"><p className="cms-eyebrow">Setup required</p><h1>Secure your content studio</h1><p>Add these values to <code>.env.local</code>, then restart the development server.</p><pre>CMS_PASSWORD=your-strong-password{"\n"}CMS_SECRET=your-long-random-secret</pre><a className="cms-back-link" href="/">← Back to website</a></section></main>;
}
