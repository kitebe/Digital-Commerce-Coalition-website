"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { CmsCollection, CmsContent, CmsEntry } from "../../lib/cms/types";
import { getClientAuth } from "../../lib/cms/firebase-client";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

type AdminAppProps = { configured: boolean; authenticated: boolean; initialContent: CmsContent | null; loginError: string };
type EditorItem = Record<string, unknown>;
type FieldKind = "text" | "textarea" | "repeater" | "select" | "asset" | "date" | "month" | "url";
type Field = { key: string; label: string; kind?: FieldKind; group?: "content" | "media" | "sidebar"; help?: string; options?: string[]; accept?: string };
type CollectionConfig = { label: string; singular: string; titleKey: "title" | "name"; titleLabel: string; description: string; fields: Field[]; create: (position: number) => EditorItem };
type SaveAction = "save-draft" | "publish" | "save-published" | "unpublish";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const collectionOrder: CmsCollection[] = ["blogPosts", "events", "publications", "reports", "pressCoverage", "members"];
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const newWorkflow = () => ({ id: "new", version: 0, publishState: "draft", createdAt: "", updatedAt: "" });

const getTodayDate = () => new Date().toISOString().split("T")[0];
const migrateDates = (next: EditorItem, collection: CmsCollection) => {
  if (collection === "publications" || collection === "reports" || collection === "pressCoverage") {
    if (!next.date) next.date = getTodayDate();
    else if (String(next.date).length === 7) next.date = `${next.date}-01`;
  } else if (collection === "events") {
    if (!next.eventDate) next.eventDate = getTodayDate();
    else if (String(next.eventDate).length === 7) next.eventDate = `${next.eventDate}-01`;
  }
};
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const configs: Record<CmsCollection, CollectionConfig> = {
  blogPosts: {
    label: "Articles", singular: "article", titleKey: "title", titleLabel: "Article title", description: "Long-form perspectives shown in the Coalition blog.",
    fields: [
      { key: "title", label: "Title" }, { key: "date", label: "Published date", kind: "date", group: "sidebar" },
      { key: "category", label: "Category", group: "sidebar" }, { key: "author", label: "Author", group: "sidebar" },
      { key: "excerpt", label: "Excerpt", kind: "textarea" }, { key: "intro", label: "Lead paragraph", kind: "textarea" },
      { key: "body", label: "Article body", kind: "textarea", help: "Use headings, lists, images, tables, and video to structure the story." },
      { key: "takeaways", label: "Key takeaways", kind: "repeater", help: "One takeaway per line." },
      { key: "image", label: "Feature image", kind: "asset", group: "media", accept: "image/*" },
      { key: "imageAlt", label: "Feature image description", group: "media" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled article", slug: `untitled-article-${position + 1}`, date: getTodayDate(), category: "Coalition perspectives", author: "Digital Commerce Coalition", excerpt: "", intro: "", body: "", takeaways: [], image: "", imageAlt: "", previousSlugs: [] }),
  },
  events: {
    label: "Events", singular: "event", titleKey: "title", titleLabel: "Event title", description: "Upcoming and past Coalition convenings.",
    fields: [
      { key: "title", label: "Title" }, { key: "eventDate", label: "Event date", kind: "date", group: "sidebar" },
      { key: "format", label: "Format", group: "sidebar" }, { key: "location", label: "Location", group: "sidebar" },
      { key: "summary", label: "Summary", kind: "textarea" },
      { key: "body", label: "Event details", kind: "textarea" },
      { key: "topics", label: "Topics", kind: "repeater", help: "One topic per line." },
      { key: "linkLabel", label: "Link label" },
      { key: "aboutEyebrow", label: "About eyebrow" },
      { key: "aboutHeading", label: "About headline" },
      { key: "topicsHeading", label: "Topics headline" },
      { key: "image", label: "Event image", kind: "asset", group: "media", accept: "image/*" },
      { key: "imageAlt", label: "Event image description", group: "media" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled event", slug: `untitled-event-${position + 1}`, eventDate: getTodayDate(), format: "Roundtable", location: "", summary: "", body: "", topics: [], linkLabel: "Read more", image: "", imageAlt: "", aboutEyebrow: "About the event", aboutHeading: "Bringing shared priorities into focus.", topicsHeading: "What the conversation explores", previousSlugs: [] }),
  },
  publications: {
    label: "Publications", singular: "publication", titleKey: "title", titleLabel: "Publication title", description: "Briefs, perspectives, and downloadable publications.",
    fields: [
      { key: "title", label: "Title" }, { key: "shortTitle", label: "Short title" },
      { key: "type", label: "Publication type", group: "sidebar" }, { key: "date", label: "Published date", kind: "date", group: "sidebar" },
      { key: "pages", label: "Length", group: "sidebar" }, { key: "description", label: "Card description", kind: "textarea" },
      { key: "body", label: "Publication details", kind: "textarea" },
      { key: "themes", label: "Themes", kind: "repeater" },
      { key: "coverImage", label: "Cover image", kind: "asset", group: "media", accept: "image/*" },
      { key: "accent", label: "Cover accent", kind: "select", group: "media", options: ["cyan", "lavender", "violet"] },
      { key: "pdf", label: "PDF", kind: "asset", group: "media", accept: "application/pdf" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled publication", shortTitle: "Untitled", slug: `untitled-publication-${position + 1}`, type: "Coalition brief", date: getTodayDate(), pages: null, description: "", body: "", coverImage: "", accent: "cyan", pdf: null, themes: [], previousSlugs: [] }),
  },
  reports: {
    label: "Reports", singular: "report", titleKey: "title", titleLabel: "Report title", description: "Coalition reports and downloadable reviews.",
    fields: [
      { key: "title", label: "Title" }, { key: "type", label: "Report type", group: "sidebar" },
      { key: "date", label: "Published date", kind: "date", group: "sidebar" }, { key: "description", label: "Description", kind: "textarea" },
      { key: "coverImage", label: "Cover image", kind: "asset", group: "media", accept: "image/*" },
      { key: "pdf", label: "PDF", kind: "asset", group: "media", accept: "application/pdf" },
    ],
    create: () => ({ ...newWorkflow(), title: "Untitled report", type: "Coalition report", date: getTodayDate(), description: "", coverImage: "", pdf: null }),
  },
  pressCoverage: {
    label: "Press", singular: "press item", titleKey: "title", titleLabel: "Press headline", description: "External media coverage and announcements.",
    fields: [
      { key: "title", label: "Headline" }, { key: "publication", label: "Publication", group: "sidebar" },
      { key: "date", label: "Published date", kind: "date", group: "sidebar" }, { key: "url", label: "Article URL", kind: "url" },
    ],
    create: () => ({ ...newWorkflow(), title: "Untitled press item", publication: "", date: getTodayDate(), url: "https://" }),
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
const formatDateOnly = (value: unknown) => {
  if (!value) return "—";
  const str = String(value);
  return str.split("T")[0];
};
const itemDate = (item: EditorItem) => formatDateOnly(item.date || item.eventDate || item.updatedAt);
const formatUpdatedAt = (value: unknown) => {
  if (!value) return "Not saved yet";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
};
const snapshot = (item: EditorItem | null) => item ? JSON.stringify(item) : "";

export function AdminApp({ configured, authenticated, initialContent, loginError }: AdminAppProps) {
  const router = useRouter();
  const handleSignOut = async () => {
    const auth = getClientAuth();
    if (auth) {
      await auth.signOut().catch((e) => console.error("Firebase signOut error", e));
    }
    await fetch("/api/cms/session", { method: "DELETE" });
    router.refresh();
  };
  const [content, setContent] = useState(initialContent);
  const [activeCollection, setActiveCollection] = useState<CmsCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorItem | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | null }>({ message: "", type: null });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [slugUnlocked, setSlugUnlocked] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "form">("visual");
  const [showUsers, setShowUsers] = useState(false);

  const items = useMemo(() => content && activeCollection ? getItems(content, activeCollection) : [], [activeCollection, content]);
  const isNew = selectedId === "new";
  const isDirty = Boolean(draft && snapshot(draft) !== savedSnapshot);

  useEffect(() => {
    document.body.className = "cms-body";
    
    // Read from hash on mount
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const col = params.get("collection") as CmsCollection;
      const id = params.get("id");
      if (col && configs[col] && initialContent) {
        setActiveCollection(col);
        if (id) {
          if (id === "new") {
            const next = configs[col].create(getItems(initialContent, col).length);
            setSelectedId("new"); setDraft(next); setSavedSnapshot(snapshot(next)); setSlugUnlocked(true);
          } else {
            const item = getItems(initialContent, col).find((entry) => entry.id === id);
            if (item) {
              const next = clone(item as unknown as EditorItem);
              migrateDates(next, col);
              setSelectedId(item.id); setDraft(next); setSavedSnapshot(snapshot(next));
            }
          }
        }
      }
    }
    
    return () => { document.body.classList.remove("cms-body"); };
  }, [initialContent]);

  useEffect(() => {
    // Sync state to hash to persist on reload
    const params = new URLSearchParams();
    if (activeCollection) {
      params.set("collection", activeCollection);
      if (selectedId) params.set("id", selectedId);
      window.history.replaceState(null, "", `#${params.toString()}`);
    } else {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [activeCollection, selectedId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
  useEffect(() => {
    if (toast.type) {
      const timer = setTimeout(() => setToast({ message: "", type: null }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const canLeaveEditor = () => !isDirty || window.confirm("Discard your unsaved changes?");
  const resetEditor = () => { setSelectedId(null); setDraft(null); setSavedSnapshot(""); setFieldErrors({}); setToast({ message: "", type: null }); setStatus("idle"); setSlugUnlocked(false); };
  const selectCollection = (collection: CmsCollection, id?: string) => {
    if (!canLeaveEditor()) return;
    setActiveCollection(collection); setShowUsers(false); resetEditor(); setSearchQuery(""); setStatusFilter("all");
    if (id && content) {
      const item = getItems(content, collection).find((entry) => entry.id === id);
      if (item) { const next = clone(item as unknown as EditorItem); migrateDates(next, collection); setSelectedId(item.id); setDraft(next); setSavedSnapshot(snapshot(next)); }
    }
  };
  const selectItem = (item: CmsEntry) => {
    const next = clone(item as unknown as EditorItem);
    if (activeCollection) migrateDates(next, activeCollection);
    setSelectedId(item.id); setDraft(next); setSavedSnapshot(snapshot(next)); setFieldErrors({}); setToast({ message: "", type: null }); setStatus("idle"); setSlugUnlocked(false);
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
    setStatus("idle");
  };
  const parseResponse = async (response: Response) => await response.json() as { content?: CmsContent; error?: string; fieldErrors?: Record<string, string> };
  const applySaveResult = (result: { content?: CmsContent; error?: string; fieldErrors?: Record<string, string> }, response: Response, wasNew: boolean) => {
    if (!response.ok || !result.content || !activeCollection) {
      setStatus("error"); setToast({ message: result.error || "Could not save this entry.", type: "error" }); setFieldErrors(result.fieldErrors || {}); return false;
    }
    setContent(result.content);
    const refreshedItems = getItems(result.content, activeCollection);
    const saved = wasNew ? refreshedItems.at(-1) : refreshedItems.find((entry) => entry.id === selectedId);
    if (saved) { const next = clone(saved as unknown as EditorItem); setSelectedId(saved.id); setDraft(next); setSavedSnapshot(snapshot(next)); }
    setFieldErrors({}); setStatus("saved"); return true;
  };
  const saveItem = async (action: SaveAction) => {
    if (!activeCollection || !draft) return;
    setStatus("saving");
    const wasNew = isNew;
    const response = await fetch("/api/cms/content", {
      method: wasNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wasNew
        ? { collection: activeCollection, action, item: draft }
        : { collection: activeCollection, action, id: selectedId, version: draft.version, item: draft }),
    });
    const result = await parseResponse(response);
    if (applySaveResult(result, response, wasNew)) {
      setToast({ message: action === "publish" || action === "save-published" ? "Published changes saved." : action === "unpublish" ? "Entry moved to drafts." : "Draft saved.", type: "success" });
      setSlugUnlocked(false);
    }
  };
  const createItem = () => {
    if (!activeCollection) return;
    const next = configs[activeCollection].create(items.length);
    setSelectedId("new"); setDraft(next); setSavedSnapshot(snapshot(next)); setFieldErrors({}); setToast({ message: "", type: null }); setStatus("idle"); setSlugUnlocked(true);
  };
  const deleteItem = async () => {
    if (!activeCollection || !draft || isNew || !window.confirm(`Delete “${itemTitle(draft)}”? This cannot be undone.`)) return;
    setStatus("saving");
    const response = await fetch("/api/cms/content", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: activeCollection, id: selectedId, version: draft.version }) });
    const result = await parseResponse(response);
    if (!response.ok || !result.content) { setStatus("error"); setToast({ message: result.error || "Could not delete this entry.", type: "error" }); return; }
    setContent(result.content); resetEditor();
    setToast({ message: "Entry deleted.", type: "success" });
  };
  const moveItem = async (direction: -1 | 1) => {
    if (!activeCollection || !selectedId || isNew) return;
    const index = items.findIndex((item) => item.id === selectedId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= items.length) return;
    const ordered = [...items]; [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    const response = await fetch("/api/cms/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: activeCollection, action: "reorder", orderedIds: ordered.map((item) => item.id) }) });
    const result = await parseResponse(response);
    if (response.ok && result.content) setContent(result.content); else { setStatus("error"); setToast({ message: result.error || "Could not change display order.", type: "error" }); }
  };

  const moveItemInList = async (id: string, direction: -1 | 1) => {
    if (!activeCollection) return;
    const index = items.findIndex((item) => item.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= items.length) return;
    const ordered = [...items]; [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    const response = await fetch("/api/cms/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: activeCollection, action: "reorder", orderedIds: ordered.map((item) => item.id) }) });
    const result = await parseResponse(response);
    if (response.ok && result.content) setContent(result.content); else { setToast({ message: result.error || "Could not change display order.", type: "error" }); }
  };

  const deleteItemFromList = async (item: CmsEntry) => {
    if (!activeCollection || !window.confirm(`Delete “${itemTitle(item as unknown as EditorItem)}”? This cannot be undone.`)) return;
    const response = await fetch("/api/cms/content", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: activeCollection, id: item.id, version: item.version }) });
    const result = await parseResponse(response);
    if (!response.ok || !result.content) { setToast({ message: result.error || "Could not delete this entry.", type: "error" }); return; }
    setContent(result.content);
    if (selectedId === item.id) resetEditor();
    setToast({ message: "Entry deleted.", type: "success" });
  };
  const uploadFile = async (file: File, fieldKey = "body") => {
    setUploadingField(fieldKey);
    const body = new FormData(); body.append("file", file);
    const response = await fetch("/api/cms/media", { method: "POST", body });
    const result = await response.json() as { url?: string; error?: string };
    setUploadingField(null);
    if (!response.ok || !result.url) { setStatus("error"); setToast({ message: result.error || "Upload failed.", type: "error" }); return undefined; }
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
        <a className="cms-brand" href="/admin" aria-label="Digital Commerce Coalition CMS" style={{ padding: "6px 2px 0", marginBottom: "44px" }}><img src="/assets/Dcc_logo.svg" alt="Digital Commerce Coalition" style={{ height: "48px", width: "auto", maxWidth: "205px", objectFit: "contain" }} /></a>
        <nav className="cms-nav" aria-label="CMS sections">
          <button className={!activeCollection && !showUsers ? "is-active" : ""} onClick={() => { if (canLeaveEditor()) { setActiveCollection(null); setShowUsers(false); resetEditor(); } }}><span className="cms-nav-icon">⌂</span><span>Dashboard</span></button>
          {collectionOrder.map((collection) => <button key={collection} className={activeCollection === collection && !showUsers ? "is-active" : ""} onClick={() => selectCollection(collection)}><span className="cms-nav-icon">{configs[collection].label.charAt(0)}</span><span>{configs[collection].label}</span><span className="cms-nav-count">{getItems(content, collection).length}</span></button>)}
          <button className={showUsers ? "is-active" : ""} onClick={() => { if (canLeaveEditor()) { setShowUsers(true); setActiveCollection(null); resetEditor(); } }}><span className="cms-nav-icon">⚇</span><span>Admin Users</span></button>
        </nav>
        <div className="cms-sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 10px' }}>
            <span className="cms-avatar" style={{ margin: 0, background: '#24252a', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>DC</span>
            <button onClick={handleSignOut} style={{ color: '#858890', fontSize: '13px', fontWeight: 500, padding: 0, border: 'none', background: 'none', cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#fff'} onMouseOut={(e) => e.currentTarget.style.color = '#858890'}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="cms-main">
        {showUsers ? <CmsUsers /> : !activeCollection ? <CmsOverview content={content} onOpen={selectCollection} /> : (
          <>
            {(!draft || activeCollection === "members") ? (
              <>
            <header className="cms-page-header"><div><p className="cms-eyebrow">Content library</p><h1>{activeConfig?.label}</h1><p>{activeConfig?.description}</p></div><button className="cms-primary-button" onClick={createItem}><span>＋</span> New {activeConfig?.singular}</button></header>
            <section className="cms-library-card">
              <div className="cms-library-toolbar"><label className="cms-search-field"><span>⌕</span><input aria-label="Search content" placeholder={`Search ${activeConfig?.label.toLowerCase()}…`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label><div className="cms-filter-tabs" aria-label="Filter by status">{(["all", "published", "draft"] as const).map((filter) => <button key={filter} className={statusFilter === filter ? "is-active" : ""} onClick={() => setStatusFilter(filter)}>{filter === "all" ? `All ${items.length}` : filter === "published" ? `Published ${publishedCount}` : `Drafts ${draftCount}`}</button>)}</div></div>
              {activeCollection === "members" ? (() => {
                const isFiltered = searchQuery.trim() !== "" || statusFilter !== "all";
                return (
                  <div className="cms-content-table cms-members-table" role="table" aria-label="Members">
                    <div className="cms-table-head" role="row" style={{ display: "flex", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
                      <span style={{ width: "80px", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Logo</span>
                      <span style={{ flex: 1, color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Title</span>
                      <span style={{ width: "120px", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Order</span>
                      <span style={{ width: "80px", textAlign: "right", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}></span>
                    </div>
                    {filteredItems.map((item) => {
                      const typedItem = item as unknown as EditorItem;
                      const actualIndex = items.findIndex((i) => i.id === item.id);
                      return (
                        <div className="cms-table-row cms-member-row" key={item.id} role="row" style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }} onClick={() => selectItem(item)}>
                          <div style={{ width: "80px", height: "40px", display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
                            {typedItem.logo ? <img src={String(typedItem.logo).replace(/^\.\//, "/")} alt="" style={{ maxWidth: "60px", maxHeight: "100%", objectFit: "contain" }} /> : <div style={{ width: "40px", height: "40px", background: "#f1f5f9", borderRadius: "4px" }} />}
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingRight: "16px" }}>
                            <strong style={{ fontSize: "14px", color: "#0f172a" }}>{String(typedItem.name || "Untitled")}</strong>
                            <small style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>{item.id}</small>
                          </div>
                          <div style={{ width: "120px", display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => void moveItemInList(item.id, -1)} disabled={isFiltered || actualIndex <= 0} style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px", color: "#64748b", cursor: isFiltered || actualIndex <= 0 ? "not-allowed" : "pointer", opacity: isFiltered || actualIndex <= 0 ? 0.4 : 1 }}>↑</button>
                            <button onClick={() => void moveItemInList(item.id, 1)} disabled={isFiltered || actualIndex >= items.length - 1} style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px", color: "#64748b", cursor: isFiltered || actualIndex >= items.length - 1 ? "not-allowed" : "pointer", opacity: isFiltered || actualIndex >= items.length - 1 ? 0.4 : 1 }}>↓</button>
                          </div>
                          <div style={{ width: "140px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => void selectItem(item)} style={{ color: "#2563eb", background: "transparent", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, padding: "8px" }}>Edit</button>
                            <button onClick={() => void deleteItemFromList(item)} style={{ color: "#ef4444", background: "transparent", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, padding: "8px" }}>Delete</button>
                          </div>
                        </div>
                      );
                    })}
                    {!filteredItems.length ? <div className="cms-table-empty"><strong>No matching members</strong><span>Try another search.</span></div> : null}
                  </div>
                );
              })() : (
                <div className="cms-content-table" role="table" aria-label={`${activeConfig?.label} content`}>
                  <div className="cms-table-head" role="row"><span>Title</span><span>Type</span><span>Status</span><span>Date</span><span /></div>
                  {filteredItems.map((item) => <button className="cms-table-row" key={item.id} onClick={() => selectItem(item)} role="row"><span className="cms-table-title"><strong>{itemTitle(item as unknown as EditorItem)}</strong><small>{"slug" in item ? item.slug : item.id}</small></span><span>{itemDetail(activeCollection, item as unknown as EditorItem)}</span><span><i className={`cms-status-badge is-${item.publishState}`}>{item.publishState}</i></span><span>{itemDate(item as unknown as EditorItem)}</span><span className="cms-row-arrow">→</span></button>)}
                  {!filteredItems.length ? <div className="cms-table-empty"><strong>No matching content</strong><span>Try another search or status filter.</span></div> : null}
                </div>
              )}
            </section>
          </>
        ) : null}
            
        {draft && activeCollection !== "members" ? (
              <section className="cms-editor-view">
            <header className="cms-editor-header">
              <div className="cms-editor-heading"><button className="cms-back-button" onClick={() => { if (canLeaveEditor()) resetEditor(); }} aria-label={`Back to ${activeConfig?.label}`}>←</button><div className="cms-editor-title-area"><p><button onClick={() => { if (canLeaveEditor()) resetEditor(); }}>{activeConfig?.label}</button><span>/</span>{isNew ? "New" : "Edit"}</p><label className={`cms-editor-title-field${fieldErrors[titleKey] ? " has-error" : ""}`}><span>{activeConfig?.titleLabel}</span><input value={String(draft[titleKey] || "")} placeholder={`Add ${activeConfig?.titleLabel.toLowerCase()}`} onChange={(event) => updateDraft(titleKey, event.target.value)} />{fieldErrors[titleKey] ? <small className="cms-field-error">{fieldErrors[titleKey]}</small> : null}</label></div></div>
              <div className="cms-editor-header-actions">
                {activeCollection === "events" || activeCollection === "publications" || activeCollection === "reports" ? (
                  <div className="cms-view-mode-toggle">
                    <button type="button" className={viewMode === "visual" ? "is-active" : ""} onClick={() => setViewMode("visual")}>Live Visual</button>
                    <button type="button" className={viewMode === "form" ? "is-active" : ""} onClick={() => setViewMode("form")}>Form</button>
                  </div>
                ) : null}
                {!isNew ? <a className="cms-preview-button" href={`/api/cms/preview?collection=${activeCollection}&id=${selectedId}`} target="_blank" rel="noreferrer">Preview ↗</a> : null}
                <button type="button" className="cms-danger-top-button" onClick={isNew ? () => { if (canLeaveEditor()) resetEditor(); } : () => void deleteItem()}>{isNew ? "Discard" : "Delete"}</button>
                {itemStatus(draft) === "draft" ? <><button className="cms-secondary-button" onClick={() => void saveItem("save-draft")} disabled={status === "saving"}>Save draft</button><button className="cms-primary-button" onClick={() => void saveItem("publish")} disabled={status === "saving"}>Publish</button></> : <><button className="cms-secondary-button" onClick={() => { if (window.confirm("Unpublish this entry and move it to drafts?")) void saveItem("unpublish"); }} disabled={status === "saving"}>Unpublish</button><button className="cms-primary-button" onClick={() => void saveItem("save-published")} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save changes"}</button></>}
              </div>
            </header>
            <div className={`cms-editor-notice is-${status}`} role="status">{Object.keys(fieldErrors).length ? `Fix ${Object.keys(fieldErrors).length} highlighted field${Object.keys(fieldErrors).length === 1 ? "" : "s"}.` : (isDirty ? "Unsaved changes" : itemStatus(draft) === "published" ? "This entry is live on the website." : "This entry is only visible in the CMS.")}</div>
            
            {activeCollection === "events" && viewMode === "visual" ? (
              <VisualEventEditor
                draft={draft}
                updateDraft={updateDraft}
                uploadFile={uploadFile}
                uploadingField={uploadingField}
                fieldErrors={fieldErrors}
              />
            ) : activeCollection === "publications" && viewMode === "visual" ? (
              <VisualPublicationEditor
                draft={draft}
                updateDraft={updateDraft}
                uploadFile={uploadFile}
                uploadingField={uploadingField}
                fieldErrors={fieldErrors}
              />
            ) : activeCollection === "reports" && viewMode === "visual" ? (
              <VisualReportEditor
                draft={draft}
                updateDraft={updateDraft}
                uploadFile={uploadFile}
                uploadingField={uploadingField}
                fieldErrors={fieldErrors}
              />
            ) : (
              <div className="cms-editor-layout">
                <div className="cms-editor-content">
                  {contentFields.length ? <EditorSection title="Content" description="The main information visitors will see.">{contentFields.map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={uploadingField === field.key} onChange={(value) => updateDraft(field.key, value)} onUpload={async (file) => { const url = await uploadFile(file, field.key); if (url) updateDraft(field.key, url); return url; }} />)}</EditorSection> : null}
                  {activeConfig?.fields.some((field) => field.group === "media") ? <EditorSection title="Media" description="Images and downloadable files used by this entry.">{activeConfig.fields.filter((field) => field.group === "media").map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={uploadingField === field.key} onChange={(value) => updateDraft(field.key, value)} onUpload={async (file) => { const url = await uploadFile(file, field.key); if (url) updateDraft(field.key, url); return url; }} />)}</EditorSection> : null}
                </div>
                  {(activeCollection as string) !== "members" ? (
                    <aside className="cms-editor-aside">
                      <header className="cms-inspector-header"><div><strong>Entry settings</strong><span>{isNew ? `New ${activeConfig?.singular}` : `Updated ${formatUpdatedAt(draft.updatedAt)}`}</span></div><i className={`cms-status-badge is-${itemStatus(draft)}`}>{itemStatus(draft)}</i></header>
                      {sidebarFields.length ? <section className="cms-document-details"><p className="cms-aside-label">{activeConfig?.singular} details</p><div className="cms-sidebar-fields">{sidebarFields.map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={false} onChange={(value) => updateDraft(field.key, value)} onUpload={async () => undefined} />)}</div></section> : null}
                      {hasSlug ? <section className="cms-settings-panel"><p className="cms-aside-label">Settings</p><label className={`cms-field${fieldErrors.slug ? " has-error" : ""}`}><span>URL slug</span><input value={String(draft.slug || "")} readOnly={!slugUnlocked} onChange={(event) => updateDraft("slug", slugify(event.target.value))} /><small>/{activeCollection === "events" ? "event?event=" : activeCollection === "publications" ? "publication?slug=" : "blog-post?post="}{String(draft.slug || "")}</small>{fieldErrors.slug ? <small className="cms-field-error">{fieldErrors.slug}</small> : null}</label>{!slugUnlocked ? <button className="cms-unlock-button" onClick={() => { if (window.confirm("Changing a published URL can affect shared links. The previous URL will continue to resolve.")) setSlugUnlocked(true); }}>Edit slug</button> : <p className="cms-settings-warning">Slug editing is unlocked. Save carefully.</p>}</section> : null}
                      {!isNew ? <section><p className="cms-aside-label">Display order</p><div className="cms-order-control"><span>Position {currentIndex + 1} of {items.length}</span><div><button onClick={() => void moveItem(-1)} disabled={currentIndex <= 0}>↑</button><button onClick={() => void moveItem(1)} disabled={currentIndex >= items.length - 1}>↓</button></div></div></section> : null}
                      <section className="cms-danger-zone"><p className="cms-aside-label">Entry actions</p><button onClick={isNew ? () => { if (canLeaveEditor()) resetEditor(); } : () => void deleteItem()}>{isNew ? "Discard entry" : "Delete entry"}</button></section>
                    </aside>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}
            
            {draft && activeCollection === "members" ? (
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={() => { if (canLeaveEditor()) resetEditor(); }}>
                <div style={{ width: "100%", maxWidth: "480px", background: "#fff", borderRadius: "12px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh", pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
                  <header style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: "#0f172a" }}>{isNew ? "Add new member" : "Edit member"}</h2>
                    <button onClick={() => { if (canLeaveEditor()) resetEditor(); }} style={{ background: "transparent", border: 0, fontSize: "20px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "4px" }}>×</button>
                  </header>
                  <div style={{ padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
                    {activeConfig?.fields.map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={uploadingField === field.key} onChange={(value) => updateDraft(field.key, value)} onUpload={async (file) => { const url = await uploadFile(file, field.key); if (url) updateDraft(field.key, url); return url; }} />)}
                  </div>
                  <footer style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                    <button onClick={() => { if (canLeaveEditor()) resetEditor(); }} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontWeight: 500, cursor: "pointer", fontSize: "13px" }}>Cancel</button>
                    <button onClick={() => void saveItem("publish")} disabled={status === "saving" || uploadingField !== null} style={{ padding: "8px 16px", borderRadius: "6px", border: 0, background: "#0f172a", color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: "13px" }}>{status === "saving" ? "Saving..." : (isNew ? "Add member" : "Save changes")}</button>
                  </footer>
                </div>
              </div>
            ) : null}

            {toast.type && (
              <div className={`cms-toast is-${toast.type}`}>
                {toast.message}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EditorSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="cms-editor-section"><header><h2>{title}</h2><p>{description}</p></header><div className="cms-form">{children}</div></section>;
}

function VisualEventEditor({
  draft,
  updateDraft,
  uploadFile,
  uploadingField,
  fieldErrors,
}: {
  draft: EditorItem;
  updateDraft: (key: string, value: unknown) => void;
  uploadFile: (file: File, key?: string) => Promise<string | undefined>;
  uploadingField: string | null;
  fieldErrors: Record<string, string>;
}) {
  const [newTopic, setNewTopic] = useState("");
  const topics = (Array.isArray(draft.topics) ? draft.topics : []) as string[];

  const handleAddTopic = () => {
    if (!newTopic.trim()) return;
    updateDraft("topics", [...topics, newTopic.trim()]);
    setNewTopic("");
  };

  const handleUpdateTopic = (index: number, val: string) => {
    const updated = [...topics];
    updated[index] = val;
    updateDraft("topics", updated);
  };

  const handleRemoveTopic = (indexToRemove: number) => {
    updateDraft("topics", topics.filter((_, i) => i !== indexToRemove));
  };

  const imageSrc = draft.image ? String(draft.image).replace(/^\.\//, "/") : "";

  return (
    <div className="cms-live-event-page">
      {/* 1. HERO SECTION (Cyan Background) */}
      <section className="event-detail-hero cms-live-hero-section">
        <div className="event-detail-copy">
          <div className="cms-live-eyebrow-row">
            <span className="events-eyebrow">Event</span>
            <div className="cms-live-format-wrap">
              <span className="cms-live-format-label">🏷️ Format:</span>
              <select
                className="cms-live-format-select"
                value={String(draft.format || "Roundtable")}
                onChange={(e) => updateDraft("format", e.target.value)}
                title="Select format"
              >
                <option value="Roundtable">Roundtable</option>
                <option value="Webinar">Webinar</option>
                <option value="Workshop">Workshop</option>
                <option value="Summit">Summit</option>
                <option value="Conference">Conference</option>
                <option value="Panel">Panel</option>
              </select>
            </div>
          </div>

          <textarea
            className={`event-detail-title cms-live-title-input${fieldErrors.title ? " has-error" : ""}`}
            placeholder="Coalition event title..."
            value={String(draft.title || "")}
            onChange={(e) => updateDraft("title", e.target.value)}
            rows={2}
          />
          {fieldErrors.title && <small className="cms-field-error">{fieldErrors.title}</small>}

          <textarea
            className="event-detail-summary cms-live-summary-input"
            placeholder="Add summary / lead overview..."
            value={String(draft.summary || "")}
            onChange={(e) => updateDraft("summary", e.target.value)}
            rows={3}
          />

          <div className="cms-live-meta">
            <div className="cms-live-pill" title="Event Date">
              <span className="cms-live-pill-tag">📅 Date</span>
              <input
                type="date"
                value={String(draft.eventDate || "")}
                onChange={(e) => updateDraft("eventDate", e.target.value)}
              />
            </div>
            <div className="cms-live-pill" title="Event Location">
              <span className="cms-live-pill-tag">📍 Location</span>
              <input
                type="text"
                placeholder="e.g. Bengaluru / New Delhi / Virtual"
                value={String(draft.location || "")}
                onChange={(e) => updateDraft("location", e.target.value)}
              />
            </div>
          </div>
        </div>

        <figure className="event-detail-image-wrap cms-live-image-wrap">
          {imageSrc ? (
            <img id="event-detail-image" src={imageSrc} alt={String(draft.imageAlt || "Event preview")} />
          ) : (
            <div className="cms-live-arch-empty">
              <span>🖼️ Arch Hero Image</span>
              <small>Upload image or paste image link below</small>
            </div>
          )}
          <div className="cms-live-image-overlay">
            <input
              type="text"
              className="cms-live-url-input"
              placeholder="Paste image URL (Unsplash, etc)..."
              value={String(draft.image || "")}
              onChange={(e) => updateDraft("image", e.target.value)}
            />
            <div className="cms-live-upload-actions">
              <label className="cms-live-upload-btn">
                {uploadingField === "image" ? "Uploading…" : "📁 Upload file"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingField === "image"}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = await uploadFile(file, "image");
                      if (url) updateDraft("image", url);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {draft.image ? (
                <button
                  type="button"
                  className="cms-live-remove-btn"
                  onClick={() => updateDraft("image", "")}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <input
              type="text"
              className="cms-live-alt-input"
              placeholder="Image description (Alt text)..."
              value={String(draft.imageAlt || "")}
              onChange={(e) => updateDraft("imageAlt", e.target.value)}
            />
          </div>
        </figure>
      </section>

      {/* 2. BODY SECTION (Lavender Background) */}
      <section className="event-detail-body cms-live-body-section cms-live-body-clean">
        <article className="event-detail-article cms-live-article-centered">
          <input
            className="cms-live-about-eyebrow events-eyebrow"
            placeholder="About the event"
            value={String(draft.aboutEyebrow ?? "About the event")}
            onChange={(e) => updateDraft("aboutEyebrow", e.target.value)}
          />
          <textarea
            className="cms-live-about-heading"
            placeholder="Bringing shared priorities into focus."
            value={String(draft.aboutHeading ?? "Bringing shared priorities into focus.")}
            onChange={(e) => updateDraft("aboutHeading", e.target.value)}
            rows={2}
          />
          
          <div className="cms-live-rich-wrapper">
            <textarea
              className="cms-live-summary-input"
              style={{ minHeight: "200px" }}
              placeholder="Event details (HTML supported)..."
              value={extractText(draft.body)}
              onChange={(e) => updateDraft("body", e.target.value)}
            />
          </div>

          <div className="event-topics cms-live-topics-section">
            <input
              className="cms-live-topics-heading"
              placeholder="What the conversation explores"
              value={String(draft.topicsHeading ?? "What the conversation explores")}
              onChange={(e) => updateDraft("topicsHeading", e.target.value)}
            />
            <ul className="event-topic-list cms-live-topic-list">
              {topics.map((topic, i) => (
                <li key={i} className="cms-live-topic-item">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => handleUpdateTopic(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="cms-live-topic-delete"
                    onClick={() => handleRemoveTopic(i)}
                    title="Remove topic"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="cms-live-add-topic-row">
              <input
                type="text"
                placeholder="Add a new discussion topic and press Enter..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTopic();
                  }
                }}
              />
              <button type="button" onClick={handleAddTopic}>＋ Add topic</button>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function VisualPublicationEditor({
  draft,
  updateDraft,
  uploadFile,
  uploadingField,
  fieldErrors,
}: {
  draft: EditorItem;
  updateDraft: (key: string, value: unknown) => void;
  uploadFile: (file: File, key?: string) => Promise<string | undefined>;
  uploadingField: string | null;
  fieldErrors: Record<string, string>;
}) {
  const coverSrc = draft.coverImage ? String(draft.coverImage).replace(/^\.\//, "/") : "";

  return (
    <div className={`cms-live-publication-page is-${draft.accent || "lavender"}`}>
      <section className="cms-live-pub-card-section">
        <div className="cms-live-pub-card-container">
          <figure className="cms-live-pub-card-image">
            {coverSrc ? (
              <img src={coverSrc} alt="" />
            ) : (
              <div className="cms-live-arch-empty" style={{ color: "rgba(255,255,255,0.7)" }}>
                <span>🖼️ Cover Image</span>
                <small>Upload image</small>
              </div>
            )}
            <div className="cms-live-image-overlay">
              <div className="cms-live-upload-actions">
                <label className="cms-live-upload-btn">
                  {uploadingField === "coverImage" ? "Uploading…" : "🖼️ Upload Cover"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingField === "coverImage"}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = await uploadFile(file, "coverImage");
                        if (url) updateDraft("coverImage", url);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                {draft.coverImage ? (
                  <button
                    type="button"
                    className="cms-live-remove-btn"
                    onClick={() => updateDraft("coverImage", "")}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </figure>
          
          <div className="cms-live-pub-card-content">
            <div className="cms-live-pub-card-eyebrow">
              <input
                className="cms-live-pub-type-input-inline"
                value={String(draft.type || "")}
                onChange={(e) => updateDraft("type", e.target.value)}
                placeholder="Type (e.g. COALITION BRIEF)"
              />
              <span>•</span>
              <input
                className="cms-live-pub-date-input-inline"
                type="date"
                value={String(draft.date || "")}
                onChange={(e) => updateDraft("date", e.target.value)}
              />
            </div>
            
            <textarea
              className={`cms-live-pub-card-title${fieldErrors.title ? " has-error" : ""}`}
              placeholder="Publication title..."
              value={String(draft.title || "")}
              onChange={(e) => updateDraft("title", e.target.value)}
              rows={2}
            />
            {fieldErrors.title && <small className="cms-field-error" style={{ marginBottom: "12px" }}>{fieldErrors.title}</small>}

            <textarea
              className="cms-live-pub-card-desc"
              placeholder="A practical framework for strengthening consumer confidence..."
              value={String(draft.description || "")}
              onChange={(e) => updateDraft("description", e.target.value)}
              rows={4}
            />

            <div className="cms-live-pub-card-footer">
              <label className="cms-live-pub-card-download-btn">
                {uploadingField === "pdf" ? "Uploading PDF..." : (draft.pdf ? "Replace PDF" : "Upload PDF")}
                <span className="cms-live-pdf-icon">↓</span>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploadingField === "pdf"}
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = await uploadFile(file, "pdf");
                      if (url) updateDraft("pdf", url);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              
              <div className="cms-live-pub-card-pages">
                <input
                  type="text"
                  placeholder="Length (e.g. 12 pages)"
                  value={String(draft.pages || "")}
                  onChange={(e) => updateDraft("pages", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

function VisualReportEditor({
  draft,
  updateDraft,
  uploadFile,
  uploadingField,
  fieldErrors,
}: {
  draft: Record<string, any>;
  updateDraft: (key: string, value: unknown) => void;
  uploadFile: (file: File, fieldKey: string) => Promise<string | undefined>;
  uploadingField: string | null;
  fieldErrors: Record<string, string>;
}) {
  const coverSrc = draft.coverImage ? String(draft.coverImage).replace(/^\.\//, "/") : "";

  return (
    <div className="cms-live-publication-page">
      <section className="cms-live-pub-card-section">
        <div className="cms-live-pub-card-container">
          <figure className="cms-live-pub-card-image">
            {coverSrc ? (
              <img src={coverSrc} alt="" />
            ) : (
              <div className="cms-live-arch-empty" style={{ color: "rgba(255,255,255,0.7)" }}>
                <span>🖼️ Cover Image</span>
                <small>Upload image</small>
              </div>
            )}
            <div className="cms-live-image-overlay">
              <div className="cms-live-upload-actions">
                <label className="cms-live-upload-btn">
                  {uploadingField === "coverImage" ? "Uploading…" : "🖼️ Upload Cover"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingField === "coverImage"}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = await uploadFile(file, "coverImage");
                        if (url) updateDraft("coverImage", url);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                {draft.coverImage ? (
                  <button
                    type="button"
                    className="cms-live-remove-btn"
                    onClick={() => updateDraft("coverImage", "")}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </figure>
          
          <div className="cms-live-pub-card-content">
            <div className="cms-live-pub-card-eyebrow">
              <input
                className="cms-live-pub-type-input-inline"
                value={String(draft.type || "")}
                onChange={(e) => updateDraft("type", e.target.value)}
                placeholder="Type (e.g. REPORT)"
              />
              <span>•</span>
              <input
                className="cms-live-pub-date-input-inline"
                type="date"
                value={String(draft.date || "")}
                onChange={(e) => updateDraft("date", e.target.value)}
              />
            </div>
            
            <textarea
              className={`cms-live-pub-card-title${fieldErrors.title ? " has-error" : ""}`}
              placeholder="Report title..."
              value={String(draft.title || "")}
              onChange={(e) => updateDraft("title", e.target.value)}
              rows={2}
            />
            {fieldErrors.title && <small className="cms-field-error" style={{ marginBottom: "12px" }}>{fieldErrors.title}</small>}

            <textarea
              className="cms-live-pub-card-desc"
              placeholder="Report description..."
              value={String(draft.description || "")}
              onChange={(e) => updateDraft("description", e.target.value)}
              rows={4}
            />

            <div className="cms-live-pub-card-footer">
              <label className="cms-live-pub-card-download-btn">
                {uploadingField === "pdf" ? "Uploading PDF..." : (draft.pdf ? "Replace PDF" : "Upload PDF")}
                <span className="cms-live-pdf-icon">↓</span>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploadingField === "pdf"}
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = await uploadFile(file, "pdf");
                      if (url) updateDraft("pdf", url);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const extractText = (val: any): string => {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.join("\n");
  if (val && typeof val === "object") {
    if (val.text) return val.text;
    if (val.content && Array.isArray(val.content)) return val.content.map(extractText).join("\n");
    return "";
  }
  return val == null ? "" : String(val);
};

function CmsField({ field, value, error, uploading, onChange, onUpload }: { field: Field; value: unknown; error?: string; uploading: boolean; onChange: (value: unknown) => void; onUpload: (file: File) => Promise<string | undefined> }) {
  const stringValue = extractText(value);
  return (
    <label className={`cms-field cms-field-${field.kind || "text"}${error ? " has-error" : ""}`}>
      <span>{field.label}</span>{field.help ? <small>{field.help}</small> : null}
      {field.kind === "textarea" || field.kind === "repeater" ? <textarea rows={field.kind === "repeater" ? 5 : 4} value={stringValue} onChange={(event) => onChange(field.kind === "repeater" ? event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) : event.target.value)} /> : field.kind === "select" ? <select value={stringValue} onChange={(event) => onChange(event.target.value)}>{field.options?.map((option) => <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>)}</select> : field.kind === "asset" ? <div className="cms-asset-field"><input placeholder="Paste image URL or upload file..." value={stringValue} onChange={(event) => onChange(event.target.value)} /><label className="cms-upload-button">{uploading ? "Uploading…" : stringValue ? "Replace" : "Upload"}<input type="file" accept={field.accept} disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.target.value = ""; }} /></label>{stringValue ? <button type="button" className="cms-remove-asset" onClick={() => onChange(field.key === "pdf" ? null : "")}>Remove</button> : null}{stringValue && field.accept?.includes("image") ? <img className="cms-asset-preview" src={stringValue.replace(/^\.\//, "/")} alt="" /> : null}</div> : <input type={field.kind === "date" ? "date" : field.kind === "month" ? "month" : field.kind === "url" ? "url" : "text"} value={stringValue} onChange={(event) => onChange(event.target.value)} />}
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firebaseError, setFirebaseError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const auth = getClientAuth();
  const isFirebaseActive = auth !== null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setIsLoading(true);
    setFirebaseError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();
      const response = await fetch("/api/cms/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Authentication failed on backend.");
      }
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setFirebaseError(err.message || "Failed to sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setIsLoading(true);
    setFirebaseError("");

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      const response = await fetch("/api/cms/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const resultJson = await response.json();
      if (!response.ok) {
        throw new Error(resultJson.error || "Authentication failed on backend.");
      }
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setFirebaseError(err.message || "Failed to sign in with Google.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isFirebaseActive) {
    return (
      <main className="cms-auth-page">
        <section className="cms-login-card">
          <a href="/" className="cms-login-brand">
            <img src="/assets/Dcc_logo.svg" alt="Digital Commerce Coalition" />
          </a>
          <p className="cms-eyebrow">Content studio</p>
          <h1>Welcome back</h1>
          <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '14px' }}>Sign in to continue.</p>
          
          <form onSubmit={handleEmailSignIn}>
            <label>
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </label>
            {firebaseError || error ? (
              <p className="cms-auth-error">{firebaseError || error}</p>
            ) : null}
            <button className="cms-primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="cms-login-divider">
            <span>or</span>
          </div>

          <button
            className="cms-secondary-button cms-google-button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" className="google-icon" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Sign in with Google</span>
          </button>

          <a className="cms-back-link" href="/">← Back to website</a>
        </section>
      </main>
    );
  }

  // Original fallback UI if Firebase is not active
  return (
    <main className="cms-auth-page">
      <section className="cms-login-card">
        <a href="/" className="cms-login-brand">
          <img src="/assets/Dcc_logo.svg" alt="Digital Commerce Coalition" />
        </a>
        <p className="cms-eyebrow">Content studio</p>
        <h1>Welcome back</h1>
        <p>Sign in to manage website content.</p>
        <form action="/api/cms/session" method="post">
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" autoFocus required />
          </label>
          {error ? <p className="cms-auth-error">{error}</p> : null}
          <button className="cms-primary-button" type="submit">Sign in</button>
        </form>
        <a className="cms-back-link" href="/">← Back to website</a>
      </section>
    </main>
  );
}

function CmsSetup() {
  return <main className="cms-auth-page"><section className="cms-login-card cms-setup-card"><p className="cms-eyebrow">Setup required</p><h1>Secure your content studio</h1><p>Add these values to <code>.env.local</code>, then restart the development server.</p><pre>CMS_PASSWORD=your-strong-password{"\n"}CMS_SECRET=your-long-random-secret</pre><a className="cms-back-link" href="/">← Back to website</a></section></main>;
}

function CmsUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<"superadmin" | "admin">("superadmin");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<{ uid: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"superadmin" | "admin">("admin");
  const [isCreating, setIsCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cms/users");
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
        if (data.currentUserRole) setCurrentUserRole(data.currentUserRole);
        if (data.currentUserEmail) setCurrentUserEmail(data.currentUserEmail);
      } else {
        setError(data.error || "Failed to load users");
      }
    } catch {
      setError("Network error fetching users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsCreating(true);
    setActionError("");
    try {
      const res = await fetch("/api/cms/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmail("");
        setPassword("");
        setNewRole("admin");
        setShowAddModal(false);
        setToast(`Successfully added ${email} as ${newRole === "superadmin" ? "Super Admin" : "Admin"}`);
        await fetchUsers();
      } else {
        setActionError(data.error || "Failed to create user");
      }
    } catch {
      setActionError("Failed to connect to server.");
    } finally {
      setIsCreating(false);
    }
  };

  const updateUserRole = async (uid: string, targetEmail: string, role: "superadmin" | "admin") => {
    try {
      const res = await fetch("/api/cms/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, role }),
      });
      if (res.ok) {
        setToast(`Updated ${targetEmail} role to ${role === "superadmin" ? "Super Admin" : "Admin"}`);
        await fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update user role");
      }
    } catch {
      alert("Network error updating role.");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordTarget || !newPassword) return;
    setIsResetting(true);
    setResetError("");
    try {
      const res = await fetch("/api/cms/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: resetPasswordTarget.uid, password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast(`Password reset successfully for ${resetPasswordTarget.email}`);
        setResetPasswordTarget(null);
        setNewPassword("");
      } else {
        setResetError(data.error || "Failed to update password.");
      }
    } catch {
      setResetError("Network error resetting password.");
    } finally {
      setIsResetting(false);
    }
  };

  const deleteUser = async (uid: string, userEmail: string) => {
    if (!window.confirm(`Revoke CMS access for ${userEmail}?`)) return;
    try {
      const res = await fetch("/api/cms/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        setToast(`Access revoked for ${userEmail}`);
        await fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete user");
      }
    } catch {
      alert("Network error deleting user.");
    }
  };

  const filteredUsers = users.filter((u) =>
    (u.email || "").toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const isSuperAdmin = currentUserRole === "superadmin";

  return (
    <div className="cms-overview">
      {toast && (
        <div className="cms-editor-notice is-saved" style={{ position: "fixed", top: "20px", right: "20px", zIndex: 100, background: "#10b981", color: "#fff", padding: "12px 20px", borderRadius: "8px", fontWeight: 600, boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
          ✓ {toast}
        </div>
      )}

      <header className="cms-page-header">
        <div>
          <p className="cms-eyebrow">Settings & Access</p>
          <h1>Admin Users</h1>
          <p>Manage team members authorized to access and edit content in the Coalition CMS.</p>
        </div>
        {isSuperAdmin && (
          <button className="cms-primary-button" onClick={() => setShowAddModal(true)}>
            <span>＋</span> Add user
          </button>
        )}
      </header>

      {!isSuperAdmin && (
        <div style={{ padding: "14px 18px", background: "#eff6ff", color: "#1e40af", borderRadius: "8px", border: "1px solid #bfdbfe", marginBottom: "20px", fontSize: "13px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px" }}>🔒</span>
          <span>You are logged in as an <strong>Admin</strong>. Only <strong>Super Admins</strong> can add, edit, or revoke user accounts.</span>
        </div>
      )}

      {error ? (
        <div style={{ padding: "16px", background: "#fef2f2", color: "#ef4444", borderRadius: "8px", border: "1px solid #fecaca", marginBottom: "20px" }}>
          {error}
        </div>
      ) : null}

      <section className="cms-library-card">
        <div className="cms-library-toolbar">
          <label className="cms-search-field">
            <span>⌕</span>
            <input
              aria-label="Search users"
              placeholder="Search user emails…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <div className="cms-filter-tabs">
            <button className="is-active">All users ({filteredUsers.length})</button>
          </div>
        </div>

        <div className="cms-content-table" role="table" aria-label="Admin Users">
          <div className="cms-table-head" role="row" style={{ gridTemplateColumns: "minmax(250px, 2fr) 130px 130px 130px 170px" }}>
            <span>User Account</span>
            <span>Role</span>
            <span>Date Added</span>
            <span>Last Active</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>

          {loading ? (
            <div className="cms-table-empty">
              <strong>Loading users…</strong>
              <span>Fetching Firebase Auth records.</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="cms-table-empty">
              <strong>No matching user accounts</strong>
              <span>Try a different search term or add a new admin.</span>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const initials = (user.email || "U").slice(0, 2).toUpperCase();
              const isUserSuperAdmin = user.role === "superadmin";

              return (
                <div
                  className="cms-table-row"
                  key={user.uid}
                  role="row"
                  style={{ gridTemplateColumns: "minmax(250px, 2fr) 130px 130px 130px 170px", cursor: "default" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: isUserSuperAdmin ? "#e11d48" : "#0f172a",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>
                    <div className="cms-table-title">
                      <strong>{user.email} {user.email === currentUserEmail ? <span style={{ color: "#2563eb", fontSize: "11px", fontWeight: 500 }}>(You)</span> : null}</strong>
                      <small style={{ fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>UID: {user.uid}</small>
                    </div>
                  </div>

                  <div>
                    {isSuperAdmin ? (
                      <select
                        value={user.role || "admin"}
                        onChange={(e) => updateUserRole(user.uid, user.email, e.target.value as "superadmin" | "admin")}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid #cbd5e1",
                          background: isUserSuperAdmin ? "#fff1f2" : "#f8fafc",
                          color: isUserSuperAdmin ? "#be123c" : "#334155",
                          cursor: "pointer",
                        }}
                      >
                        <option value="superadmin">Super Admin</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span
                        className="cms-status-badge"
                        style={{
                          background: isUserSuperAdmin ? "#fff1f2" : "#f1f5f9",
                          color: isUserSuperAdmin ? "#be123c" : "#475569",
                        }}
                      >
                        {isUserSuperAdmin ? "Super Admin" : "Admin"}
                      </span>
                    )}
                  </div>

                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {user.creationTime ? new Date(user.creationTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </span>

                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {user.lastSignInTime ? new Date(user.lastSignInTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never signed in"}
                  </span>

                  <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                    {isSuperAdmin ? (
                      <>
                        <button
                          onClick={() => {
                            setResetPasswordTarget({ uid: user.uid, email: user.email });
                            setNewPassword("");
                            setResetError("");
                          }}
                          style={{
                            color: "#2563eb",
                            background: "none",
                            border: "1px solid #bfdbfe",
                            padding: "5px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Reset Password"
                        >
                          Password
                        </button>
                        {user.email !== currentUserEmail ? (
                          <button
                            onClick={() => deleteUser(user.uid, user.email)}
                            style={{
                              color: "#ef4444",
                              background: "none",
                              border: "1px solid #fecaca",
                              padding: "5px 10px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Revoke User"
                          >
                            Revoke
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {showAddModal && isSuperAdmin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ width: "100%", maxWidth: "440px", background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p className="cms-eyebrow" style={{ margin: 0 }}>New Credentials</p>
                <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Add Admin User</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", fontSize: "20px", color: "#64748b", cursor: "pointer" }}>✕</button>
            </div>

            <form onSubmit={createUser} style={{ padding: "24px 28px", display: "grid", gap: "18px" }}>
              {actionError && (
                <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#ef4444", borderRadius: "6px", fontSize: "13px", border: "1px solid #fecaca" }}>
                  {actionError}
                </div>
              )}

              <label className="cms-field" style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Email Address</span>
                <input
                  type="email"
                  placeholder="admin@digitalcommercecoalition.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ width: "100%", minHeight: "44px", padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                />
              </label>

              <label className="cms-field" style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Password</span>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{ width: "100%", minHeight: "44px", padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                />
              </label>

              <label className="cms-field" style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>User Access Role</span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "superadmin" | "admin")}
                  style={{ width: "100%", minHeight: "44px", padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", outline: "none", background: "#fff" }}
                >
                  <option value="admin">Admin (Can edit content, cannot manage users)</option>
                  <option value="superadmin">Super Admin (Full access: can edit content & manage users)</option>
                </select>
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  className="cms-secondary-button"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cms-primary-button"
                  disabled={isCreating}
                >
                  {isCreating ? "Creating account…" : "Create user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetPasswordTarget && isSuperAdmin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ width: "100%", maxWidth: "420px", background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p className="cms-eyebrow" style={{ margin: 0 }}>Security</p>
                <h2 style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Reset Password</h2>
              </div>
              <button onClick={() => setResetPasswordTarget(null)} style={{ background: "none", border: "none", fontSize: "18px", color: "#64748b", cursor: "pointer" }}>✕</button>
            </div>

            <form onSubmit={handleResetPassword} style={{ padding: "20px 24px", display: "grid", gap: "16px" }}>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                Setting a new password for <strong>{resetPasswordTarget.email}</strong>.
              </p>

              {resetError && (
                <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#ef4444", borderRadius: "6px", fontSize: "13px", border: "1px solid #fecaca" }}>
                  {resetError}
                </div>
              )}

              <label className="cms-field" style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>New Password</span>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  style={{ width: "100%", minHeight: "44px", padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  className="cms-secondary-button"
                  onClick={() => setResetPasswordTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cms-primary-button"
                  disabled={isResetting}
                >
                  {isResetting ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
