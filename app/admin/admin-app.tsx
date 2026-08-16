"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import type { CmsCollection, CmsContent, CmsEntry } from "../../lib/cms/types";
import { cmsRichTextToHtml, mergeCmsBlogIntro } from "../../lib/cms/rich-text";
import { getClientAuth } from "../../lib/cms/firebase-client";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

type AdminAppProps = { configured: boolean; authenticated: boolean; initialContent: CmsContent | null; loginError: string };
type EditorItem = Record<string, unknown>;
type FieldKind = "text" | "textarea" | "repeater" | "select" | "asset" | "date" | "month" | "url";
type Field = { key: string; label: string; kind?: FieldKind; group?: "content" | "media" | "sidebar"; help?: string; options?: string[]; accept?: string };
type CollectionConfig = { label: string; singular: string; titleKey: "title" | "name"; titleLabel: string; description: string; fields: Field[]; create: (position: number) => EditorItem };
type SaveAction = "save-draft" | "publish" | "save-published" | "unpublish";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type DialogTone = "default" | "danger";
type ConfirmDialogOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; tone?: DialogTone };
type PromptDialogOptions = ConfirmDialogOptions & { inputLabel: string; initialValue?: string; placeholder?: string; allowEmpty?: boolean };
type AdminDialogState = (ConfirmDialogOptions & { kind: "confirm" }) | (PromptDialogOptions & { kind: "prompt" });
type AdminDialogApi = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
};

const AdminDialogContext = createContext<AdminDialogApi | null>(null);

const useAdminDialog = () => {
  const context = useContext(AdminDialogContext);
  if (!context) throw new Error("Admin dialogs must be used inside AdminDialogProvider.");
  return context;
};

function AdminDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AdminDialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolver = useRef<((value: boolean | string | null) => void) | null>(null);

  const settle = useCallback((value: boolean | string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve as (value: boolean | string | null) => void;
    setInputValue("");
    setDialog({ ...options, kind: "confirm" });
  }), []);

  const prompt = useCallback((options: PromptDialogOptions) => new Promise<string | null>((resolve) => {
    resolver.current = resolve as (value: boolean | string | null) => void;
    setInputValue(options.initialValue || "");
    setDialog({ ...options, kind: "prompt" });
  }), []);

  useEffect(() => {
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(dialog.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog, settle]);

  const submitDialog = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.kind === "prompt") {
      if (!dialog.allowEmpty && !inputValue.trim()) return;
      settle(inputValue);
      return;
    }
    settle(true);
  };

  return (
    <AdminDialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog ? (
        <div className="cms-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) settle(dialog.kind === "confirm" ? false : null); }}>
          <form className={`cms-dialog is-${dialog.tone || "default"}`} role="alertdialog" aria-modal="true" aria-labelledby="cms-dialog-title" aria-describedby="cms-dialog-message" onSubmit={submitDialog}>
            <div className="cms-dialog-icon" aria-hidden="true">{dialog.tone === "danger" ? "!" : "DCC"}</div>
            <div className="cms-dialog-copy">
              <h2 id="cms-dialog-title">{dialog.title}</h2>
              <p id="cms-dialog-message">{dialog.message}</p>
            </div>
            {dialog.kind === "prompt" ? (
              <label className="cms-dialog-field">
                <span>{dialog.inputLabel}</span>
                <input autoFocus value={inputValue} placeholder={dialog.placeholder} onChange={(event) => setInputValue(event.target.value)} />
              </label>
            ) : null}
            <div className="cms-dialog-actions">
              <button type="button" className="cms-dialog-cancel" onClick={() => settle(dialog.kind === "confirm" ? false : null)}>{dialog.cancelLabel || "Cancel"}</button>
              <button type="submit" className="cms-dialog-confirm" autoFocus={dialog.kind === "confirm"} disabled={dialog.kind === "prompt" && !dialog.allowEmpty && !inputValue.trim()}>{dialog.confirmLabel || "Confirm"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </AdminDialogContext.Provider>
  );
}

const collectionOrder: CmsCollection[] = ["blogPosts", "events", "publications", "reports", "pressCoverage", "members"];
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const collectionRouteBase: Partial<Record<CmsCollection, string>> = {
  blogPosts: "/blog",
  events: "/events",
  publications: "/publications",
  reports: "/reports",
  pressCoverage: "/press",
};
const newWorkflow = () => ({ id: "new", version: 0, publishState: "draft", createdAt: "", updatedAt: "" });

const getTodayDate = () => new Date().toISOString().split("T")[0];
const migrateDates = (next: EditorItem, collection: CmsCollection) => {
  if (collection === "blogPosts") {
    next.body = mergeCmsBlogIntro(next.intro, next.body);
    delete next.intro;
  }
  if ((collection === "reports" || collection === "pressCoverage") && !next.slug) {
    next.slug = slugify(String(next.title || "untitled"));
  }
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
      { key: "excerpt", label: "Excerpt", kind: "textarea" },
      { key: "body", label: "Article body", kind: "textarea", help: "Use headings, lists, images, tables, and video to structure the story." },
      { key: "image", label: "Feature image", kind: "asset", group: "media", accept: "image/*" },
      { key: "imageAlt", label: "Feature image description", group: "media" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled article", slug: `untitled-article-${position + 1}`, date: getTodayDate(), category: "Coalition perspectives", author: "Digital Commerce Coalition", excerpt: "", body: "", takeaways: [], image: "", imageAlt: "", previousSlugs: [] }),
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
    create: (position) => ({ ...newWorkflow(), title: "Untitled report", slug: `untitled-report-${position + 1}`, type: "Coalition report", date: getTodayDate(), description: "", coverImage: "", pdf: null, previousSlugs: [] }),
  },
  pressCoverage: {
    label: "Press", singular: "press item", titleKey: "title", titleLabel: "Press headline", description: "External media coverage and announcements.",
    fields: [
      { key: "title", label: "Headline" }, { key: "publication", label: "Publication", group: "sidebar" },
      { key: "date", label: "Published date", kind: "date", group: "sidebar" }, { key: "url", label: "Article URL", kind: "url" },
    ],
    create: (position) => ({ ...newWorkflow(), title: "Untitled press item", slug: `untitled-press-item-${position + 1}`, publication: "", date: getTodayDate(), url: "https://", previousSlugs: [] }),
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

export function AdminApp(props: AdminAppProps) {
  return <AdminDialogProvider><AdminAppContent {...props} /></AdminDialogProvider>;
}

function AdminAppContent({ configured, authenticated, initialContent, loginError }: AdminAppProps) {
  const router = useRouter();
  const dialog = useAdminDialog();
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
  const [showAnalytics, setShowAnalytics] = useState(false);

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

  const canLeaveEditor = async () => !isDirty || dialog.confirm({
    title: "Discard unsaved changes?",
    message: "Your latest edits have not been saved and will be permanently lost.",
    confirmLabel: "Discard changes",
    tone: "danger",
  });
  const resetEditor = () => { setSelectedId(null); setDraft(null); setSavedSnapshot(""); setFieldErrors({}); setToast({ message: "", type: null }); setStatus("idle"); setSlugUnlocked(false); };
  const closeEditor = async () => { if (await canLeaveEditor()) resetEditor(); };
  const selectCollection = async (collection: CmsCollection, id?: string) => {
    if (!(await canLeaveEditor())) return;
    setActiveCollection(collection); setShowUsers(false); setShowAnalytics(false); resetEditor(); setSearchQuery(""); setStatusFilter("all");
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
    if (!activeCollection || !draft || isNew) return;
    const confirmed = await dialog.confirm({
      title: "Delete this entry?",
      message: `“${itemTitle(draft)}” will be permanently removed. This action cannot be undone.`,
      confirmLabel: "Delete entry",
      tone: "danger",
    });
    if (!confirmed) return;
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
    if (!activeCollection) return;
    const confirmed = await dialog.confirm({
      title: "Delete this entry?",
      message: `“${itemTitle(item as unknown as EditorItem)}” will be permanently removed. This action cannot be undone.`,
      confirmLabel: "Delete entry",
      tone: "danger",
    });
    if (!confirmed) return;
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
          <button className={!activeCollection && !showUsers && !showAnalytics ? "is-active" : ""} onClick={() => void (async () => { if (await canLeaveEditor()) { setActiveCollection(null); setShowUsers(false); setShowAnalytics(false); resetEditor(); } })()}><span className="cms-nav-icon">⌂</span><span>Dashboard</span></button>
          <button className={showAnalytics ? "is-active" : ""} onClick={() => void (async () => { if (await canLeaveEditor()) { setShowAnalytics(true); setShowUsers(false); setActiveCollection(null); resetEditor(); } })()}><span className="cms-nav-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span><span>Analytics</span></button>
          {collectionOrder.map((collection) => <button key={collection} className={activeCollection === collection && !showUsers && !showAnalytics ? "is-active" : ""} onClick={() => void selectCollection(collection)}><span className="cms-nav-icon">{configs[collection].label.charAt(0)}</span><span>{configs[collection].label}</span><span className="cms-nav-count">{getItems(content, collection).length}</span></button>)}
          <button className={showUsers ? "is-active" : ""} onClick={() => void (async () => { if (await canLeaveEditor()) { setShowUsers(true); setShowAnalytics(false); setActiveCollection(null); resetEditor(); } })()}><span className="cms-nav-icon">⚇</span><span>Admin Users</span></button>
        </nav>
        <div className="cms-sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 10px' }}>
            <span className="cms-avatar" style={{ margin: 0, background: '#24252a', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>DC</span>
            <button onClick={handleSignOut} style={{ color: '#858890', fontSize: '13px', fontWeight: 500, padding: 0, border: 'none', background: 'none', cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#fff'} onMouseOut={(e) => e.currentTarget.style.color = '#858890'}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="cms-main">
        {showUsers ? <CmsUsers /> : showAnalytics ? <CmsAnalytics /> : !activeCollection ? <CmsOverview content={content} onOpen={selectCollection} /> : (
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
              <div className="cms-editor-heading"><button className="cms-back-button" onClick={() => void closeEditor()} aria-label={`Back to ${activeConfig?.label}`}>←</button><div className="cms-editor-title-area"><p><button onClick={() => void closeEditor()}>{activeConfig?.label}</button><span>/</span>{isNew ? "New" : "Edit"}</p><label className={`cms-editor-title-field${fieldErrors[titleKey] ? " has-error" : ""}`}><span>{activeConfig?.titleLabel}</span><input value={String(draft[titleKey] || "")} placeholder={`Add ${activeConfig?.titleLabel.toLowerCase()}`} onChange={(event) => updateDraft(titleKey, event.target.value)} />{fieldErrors[titleKey] ? <small className="cms-field-error">{fieldErrors[titleKey]}</small> : null}</label></div></div>
              <div className="cms-editor-header-actions">
                {activeCollection === "blogPosts" || activeCollection === "events" || activeCollection === "publications" || activeCollection === "reports" ? (
                  <div className="cms-view-mode-toggle">
                    <button type="button" className={viewMode === "visual" ? "is-active" : ""} onClick={() => setViewMode("visual")}>Live Visual</button>
                    <button type="button" className={viewMode === "form" ? "is-active" : ""} onClick={() => setViewMode("form")}>Form</button>
                  </div>
                ) : null}
                {!isNew ? <a className="cms-preview-button" href={`/api/cms/preview?collection=${activeCollection}&id=${selectedId}`} target="_blank" rel="noreferrer">Preview ↗</a> : null}
                <button type="button" className="cms-danger-top-button" onClick={isNew ? () => void closeEditor() : () => void deleteItem()}>{isNew ? "Discard" : "Delete"}</button>
                {itemStatus(draft) === "draft" ? <><button className="cms-secondary-button" onClick={() => void saveItem("save-draft")} disabled={status === "saving"}>Save draft</button><button className="cms-primary-button" onClick={() => void saveItem("publish")} disabled={status === "saving"}>Publish</button></> : <><button className="cms-secondary-button" onClick={() => void (async () => { const confirmed = await dialog.confirm({ title: "Unpublish this entry?", message: "The entry will be removed from the public website and returned to drafts.", confirmLabel: "Unpublish" }); if (confirmed) await saveItem("unpublish"); })()} disabled={status === "saving"}>Unpublish</button><button className="cms-primary-button" onClick={() => void saveItem("save-published")} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save changes"}</button></>}
              </div>
            </header>
            <div className={`cms-editor-notice is-${status}`} role="status">{Object.keys(fieldErrors).length ? `Fix ${Object.keys(fieldErrors).length} highlighted field${Object.keys(fieldErrors).length === 1 ? "" : "s"}.` : (isDirty ? "Unsaved changes" : itemStatus(draft) === "published" ? "This entry is live on the website." : "This entry is only visible in the CMS.")}</div>
            
            {activeCollection === "blogPosts" && viewMode === "visual" ? (
              <VisualBlogEditor
                draft={draft}
                updateDraft={updateDraft}
                uploadFile={uploadFile}
                uploadingField={uploadingField}
                fieldErrors={fieldErrors}
              />
            ) : activeCollection === "events" && viewMode === "visual" ? (
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
                      {hasSlug ? <section className="cms-settings-panel"><p className="cms-aside-label">Settings</p><label className={`cms-field${fieldErrors.slug ? " has-error" : ""}`}><span>URL slug</span><input value={String(draft.slug || "")} readOnly={!slugUnlocked} onChange={(event) => updateDraft("slug", slugify(event.target.value))} /><small>{collectionRouteBase[activeCollection]}/{String(draft.slug || "")}</small>{fieldErrors.slug ? <small className="cms-field-error">{fieldErrors.slug}</small> : null}</label>{!slugUnlocked ? <button className="cms-unlock-button" onClick={() => void (async () => { const confirmed = await dialog.confirm({ title: "Edit the published URL?", message: "Changing this URL can affect bookmarks and shared links. The previous URL will continue to resolve.", confirmLabel: "Edit URL" }); if (confirmed) setSlugUnlocked(true); })()}>Edit slug</button> : <p className="cms-settings-warning">Slug editing is unlocked. Save carefully.</p>}</section> : null}
                      {!isNew ? <section><p className="cms-aside-label">Display order</p><div className="cms-order-control"><span>Position {currentIndex + 1} of {items.length}</span><div><button onClick={() => void moveItem(-1)} disabled={currentIndex <= 0}>↑</button><button onClick={() => void moveItem(1)} disabled={currentIndex >= items.length - 1}>↓</button></div></div></section> : null}
                      <section className="cms-danger-zone"><p className="cms-aside-label">Entry actions</p><button onClick={isNew ? () => void closeEditor() : () => void deleteItem()}>{isNew ? "Discard entry" : "Delete entry"}</button></section>
                    </aside>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}
            
            {draft && activeCollection === "members" ? (
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={() => void closeEditor()}>
                <div style={{ width: "100%", maxWidth: "480px", background: "#fff", borderRadius: "12px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh", pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
                  <header style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: "#0f172a" }}>{isNew ? "Add new member" : "Edit member"}</h2>
                    <button onClick={() => void closeEditor()} style={{ background: "transparent", border: 0, fontSize: "20px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "4px" }}>×</button>
                  </header>
                  <div style={{ padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
                    {activeConfig?.fields.map((field) => <CmsField key={field.key} field={field} value={draft[field.key]} error={fieldErrors[field.key]} uploading={uploadingField === field.key} onChange={(value) => updateDraft(field.key, value)} onUpload={async (file) => { const url = await uploadFile(file, field.key); if (url) updateDraft(field.key, url); return url; }} />)}
                  </div>
                  <footer style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                    <button onClick={() => void closeEditor()} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontWeight: 500, cursor: "pointer", fontSize: "13px" }}>Cancel</button>
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

const escapeEditorHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function BlogBodyEditor({
  value,
  onChange,
  error,
  uploadFile,
  uploading,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  uploadFile: (file: File, key?: string) => Promise<string | undefined>;
  uploading: boolean;
}) {
  const dialog = useAdminDialog();
  const [, setEditorRevision] = useState(0);
  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ allowBase64: false }), TableKit.configure({ table: { resizable: true } })],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "cms-blog-editor-content",
        "aria-label": "Article body",
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    onSelectionUpdate: () => setEditorRevision((revision) => revision + 1),
  });

  useEffect(() => {
    if (!editor) return;
    const nextValue = value || "";
    if (editor.getHTML() !== nextValue) editor.commands.setContent(nextValue, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="cms-blog-editor-loading">Loading article editor…</div>;

  const editLink = async () => {
    const previousUrl = String(editor.getAttributes("link").href || "");
    const enteredUrl = await dialog.prompt({
      title: previousUrl ? "Edit link" : "Add a link",
      message: "Use a complete web address, email link, or an internal website path.",
      inputLabel: "Link address",
      initialValue: previousUrl,
      placeholder: "https://example.com",
      confirmLabel: previousUrl ? "Update link" : "Add link",
      allowEmpty: true,
    });
    if (enteredUrl === null) return;
    const url = enteredUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const safeUrl = /^(https?:\/\/|mailto:|\/)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: safeUrl }).run();
  };

  const uploadInlineImage = async (file?: File) => {
    if (!file) return;
    const url = await uploadFile(file, "body");
    if (!url) return;
    const alt = (await dialog.prompt({
      title: "Describe this image",
      message: "A short description helps people using screen readers understand the image.",
      inputLabel: "Image description",
      placeholder: "Describe the subject and relevant context",
      confirmLabel: "Insert image",
      allowEmpty: true,
    }))?.trim() || "";
    editor.chain().focus().setImage({ src: url, alt }).run();
  };

  const uploadAttachment = async (file?: File) => {
    if (!file) return;
    const url = await uploadFile(file, "body");
    if (!url) return;
    if (file.type.startsWith("image/")) {
      const alt = (await dialog.prompt({
        title: "Describe this image",
        message: "A short description helps people using screen readers understand the image.",
        inputLabel: "Image description",
        placeholder: "Describe the subject and relevant context",
        confirmLabel: "Insert image",
        allowEmpty: true,
      }))?.trim() || "";
      editor.chain().focus().setImage({ src: url, alt }).run();
      return;
    }
    editor.chain().focus().insertContent(`<p><a href="${url}">${escapeEditorHtml(file.name)}</a></p>`).run();
  };

  const blockType = editor.isActive("heading", { level: 2 }) ? "heading2" : editor.isActive("heading", { level: 3 }) ? "heading3" : "paragraph";

  return (
    <div className={`cms-blog-editor${error ? " has-error" : ""}`}>
      <div className="cms-blog-toolbar" role="toolbar" aria-label="Article formatting">
        <select
          aria-label="Text style"
          value={blockType}
          onChange={(event) => {
            const type = event.target.value;
            if (type === "heading2") editor.chain().focus().setHeading({ level: 2 }).run();
            else if (type === "heading3") editor.chain().focus().setHeading({ level: 3 }).run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="paragraph">Normal text</option>
          <option value="heading2">Heading 2</option>
          <option value="heading3">Heading 3</option>
        </select>
        <span aria-hidden="true" />
        <button type="button" title="Bold" aria-label="Bold" className={editor.isActive("bold") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" title="Italic" aria-label="Italic" className={editor.isActive("italic") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" title="Underline" aria-label="Underline" className={editor.isActive("underline") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
        <button type="button" title="Opening callout or quote" aria-label="Opening callout or quote" className={`cms-blog-tool-label${editor.isActive("blockquote") ? " is-active" : ""}`} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
        <button type="button" title="Add or edit link" aria-label="Add or edit link" className={`cms-blog-tool-label${editor.isActive("link") ? " is-active" : ""}`} onClick={() => void editLink()}>Link</button>
        <span aria-hidden="true" />
        <button type="button" title="Bulleted list" aria-label="Bulleted list" className={editor.isActive("bulletList") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</button>
        <button type="button" title="Numbered list" aria-label="Numbered list" className={editor.isActive("orderedList") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</button>
        <button type="button" title={editor.isActive("table") ? "Delete table" : "Insert table"} aria-label={editor.isActive("table") ? "Delete table" : "Insert table"} className={`cms-blog-tool-label${editor.isActive("table") ? " is-active" : ""}`} onClick={() => editor.isActive("table") ? editor.chain().focus().deleteTable().run() : editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>{editor.isActive("table") ? "Delete table" : "Table"}</button>
        <label title="Insert image" aria-label="Insert image" className={`cms-blog-tool-label${uploading ? " is-disabled" : ""}`}>Image
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              await uploadInlineImage(file);
              event.target.value = "";
            }}
          />
        </label>
        <label title="Attach image or PDF" aria-label="Attach image or PDF" className={`cms-blog-tool-label cms-blog-attachment${uploading ? " is-disabled" : ""}`}>Attach
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={uploading}
            onChange={async (event) => {
              await uploadAttachment(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" className="cms-blog-tool-label" title="Undo last change" aria-label="Undo last change" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>Undo</button>
        <button type="button" className="cms-blog-tool-label" title="Redo last change" aria-label="Redo last change" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>Redo</button>
      </div>
      <BubbleMenu editor={editor} className="cms-blog-bubble-menu">
        <button type="button" aria-label="Bold" className={editor.isActive("bold") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" aria-label="Italic" className={editor.isActive("italic") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" aria-label="Underline" className={editor.isActive("underline") ? "is-active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
        <button type="button" aria-label="Add or edit link" className={`cms-blog-bubble-label${editor.isActive("link") ? " is-active" : ""}`} onClick={() => void editLink()}>Link</button>
      </BubbleMenu>
      <EditorContent editor={editor} />
      {error ? <small className="cms-field-error">{error}</small> : null}
    </div>
  );
}

function VisualBlogEditor({
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
  const imageSrc = draft.image ? String(draft.image).replace(/^\.\//, "/") : "";
  const bodyValue = cmsRichTextToHtml(draft.body);

  return (
    <div className="cms-live-blog-page">
      <section className="cms-live-blog-hero">
        <div className="cms-live-blog-copy">
          <div className="cms-live-blog-label-row">
            <span>Article</span>
            <input
              className={fieldErrors.category ? "has-error" : ""}
              value={String(draft.category || "")}
              onChange={(event) => updateDraft("category", event.target.value)}
              placeholder="Category"
              aria-label="Article category"
            />
          </div>

          <textarea
            className={`cms-live-blog-title${fieldErrors.title ? " has-error" : ""}`}
            value={String(draft.title || "")}
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder="Write a clear, useful article title…"
            rows={3}
          />
          {fieldErrors.title ? <small className="cms-field-error">{fieldErrors.title}</small> : null}

          <textarea
            className={`cms-live-blog-excerpt${fieldErrors.excerpt ? " has-error" : ""}`}
            value={extractText(draft.excerpt)}
            onChange={(event) => updateDraft("excerpt", event.target.value)}
            placeholder="Summarise the article in one or two sentences. This appears on blog cards and in search results."
            rows={4}
          />
          {fieldErrors.excerpt ? <small className="cms-field-error">{fieldErrors.excerpt}</small> : null}

          <div className="cms-live-blog-meta">
            <label className={fieldErrors.author ? "has-error" : ""}>
              <span>By</span>
              <input value={String(draft.author || "")} onChange={(event) => updateDraft("author", event.target.value)} placeholder="Author name" />
            </label>
            <label className={fieldErrors.date ? "has-error" : ""}>
              <span>Published</span>
              <input type="date" value={String(draft.date || "")} onChange={(event) => updateDraft("date", event.target.value)} />
            </label>
          </div>
        </div>

        <figure className={`cms-live-blog-image${fieldErrors.image ? " has-error" : ""}`}>
          {imageSrc ? (
            <img src={imageSrc} alt={String(draft.imageAlt || "Article feature preview")} />
          ) : (
            <div className="cms-live-blog-image-empty">
              <strong>Feature image</strong>
              <span>Use a square image with a clear focal point.</span>
            </div>
          )}
          <figcaption>
            <input
              value={String(draft.image || "")}
              onChange={(event) => updateDraft("image", event.target.value)}
              placeholder="Paste image URL"
              aria-label="Feature image URL"
            />
            <div>
              <label>
                {uploadingField === "image" ? "Uploading…" : draft.image ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingField === "image"}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      const url = await uploadFile(file, "image");
                      if (url) updateDraft("image", url);
                    }
                    event.target.value = "";
                  }}
                />
              </label>
              {draft.image ? <button type="button" onClick={() => updateDraft("image", "")}>Remove</button> : null}
            </div>
            <input
              className={fieldErrors.imageAlt ? "has-error" : ""}
              value={String(draft.imageAlt || "")}
              onChange={(event) => updateDraft("imageAlt", event.target.value)}
              placeholder="Describe the image for screen readers"
              aria-label="Feature image description"
            />
          </figcaption>
        </figure>
      </section>

      <section className="cms-live-blog-story">
        <article>
          <div className="cms-live-blog-body-heading">
            <div>
              <p className="cms-live-blog-section-label">Story body</p>
              <h2>Build the article</h2>
            </div>
            <p>Start with Quote for a highlighted opening statement, then use descriptive headings to keep the story easy to scan.</p>
          </div>
          <BlogBodyEditor
            value={bodyValue}
            onChange={(value) => updateDraft("body", value)}
            error={fieldErrors.body}
            uploadFile={uploadFile}
            uploading={uploadingField === "body"}
          />
        </article>
      </section>
    </div>
  );
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

const getGreetingForHour = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

function CmsOverview({ content, onOpen }: { content: CmsContent; onOpen: (collection: CmsCollection, id?: string) => void }) {
  const [greeting, setGreeting] = useState("Welcome back");
  const allItems = collectionOrder.flatMap((collection) => getItems(content, collection).map((item) => ({ collection, item })));
  const total = allItems.length; const published = allItems.filter(({ item }) => item.publishState === "published").length;
  const recentItems = [...allItems].sort((left, right) => right.item.updatedAt.localeCompare(left.item.updatedAt)).slice(0, 6);

  useEffect(() => {
    const updateGreeting = () => setGreeting(getGreetingForHour(new Date().getHours()));
    updateGreeting();
    const intervalId = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return <div className="cms-overview"><header className="cms-overview-header"><div><p className="cms-eyebrow">Workspace overview</p><h1>{greeting}</h1><p>Here’s what’s happening across the Coalition website.</p></div></header><section className="cms-stats-grid" aria-label="Content status summary"><div><span>Total entries</span><strong>{total}</strong><small>Across {collectionOrder.length} collections</small></div><div><span>Published</span><strong>{published}</strong><small>Visible on the website</small></div><div><span>Drafts</span><strong>{total - published}</strong><small>Awaiting publication</small></div></section><div className="cms-section-heading"><div><h2>Collections</h2><p>Browse and manage your content types.</p></div></div><section className="cms-overview-grid" aria-label="Content collections">{collectionOrder.map((collection) => <button key={collection} onClick={() => onOpen(collection)}><span className="cms-card-letter">{configs[collection].label.charAt(0)}</span><span className="cms-card-count">{getItems(content, collection).length}</span><strong>{configs[collection].label}</strong><p>{configs[collection].description}</p><span className="cms-card-link">Manage content →</span></button>)}</section><section className="cms-recent-card"><div className="cms-section-heading"><div><h2>Recent content</h2><p>Entries across all collections.</p></div></div><div className="cms-recent-list">{recentItems.map(({ collection, item }) => <button key={item.id} onClick={() => onOpen(collection, item.id)}><span className="cms-recent-icon">{configs[collection].label.charAt(0)}</span><span><strong>{itemTitle(item as unknown as EditorItem)}</strong><small>{configs[collection].label}</small></span><i className={`cms-status-badge is-${item.publishState}`}>{item.publishState}</i><span className="cms-recent-date">{formatUpdatedAt(item.updatedAt)}</span><span>→</span></button>)}</div></section></div>;
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

type AnalyticsData = {
  isLive?: boolean;
  measurementId: string;
  propertyId: string;
  status: string;
  serviceEmail?: string;
  setupNotice?: string;
  errorDetails?: string;
  period: string;
  metrics: {
    totalViews: string;
    uniqueVisitors: string;
    avgDuration: string;
    bounceRate: string;
    viewsGrowth: string;
    visitorsGrowth: string;
  };
  trendData: Array<{ date: string; views: number; visitors: number }>;
  topPages: Array<{ path: string; title: string; views: number; pct: string }>;
  trafficSources: Array<{ name: string; share: number; color: string }>;
  deviceBreakdown: Array<{ type: string; share: number; icon: string }>;
};

function CmsAnalyticsChart({ trendData }: { trendData: Array<{ date: string; views: number; visitors: number }> }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (!trendData || trendData.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
        No page view trend data recorded for this period yet.
      </div>
    );
  }

  const width = 800;
  const height = 220;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const maxViews = Math.max(...trendData.map((d) => d.views), 10);
  const gridCeil = Math.ceil(maxViews / 100) * 100 || maxViews;

  const points = trendData.map((d, i) => {
    const x = paddingLeft + (i / Math.max(trendData.length - 1, 1)) * chartW;
    const y = paddingTop + chartH - (d.views / gridCeil) * chartH;
    return { x, y, date: d.date, views: d.views, visitors: d.visitors };
  });

  const lineD = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    const prev = arr[i - 1];
    const cx1 = prev.x + (pt.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (pt.x - prev.x) / 2;
    const cy2 = pt.y;
    return `${acc} C ${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }, "");

  const areaD = `${lineD} L ${points[points.length - 1].x.toFixed(1)},${(paddingTop + chartH).toFixed(1)} L ${paddingLeft},${(paddingTop + chartH).toFixed(1)} Z`;

  const ySteps = [0, 0.33, 0.66, 1];

  const labelIndices: number[] = [];
  const count = trendData.length;
  const step = Math.max(1, Math.floor(count / 5));
  for (let i = 0; i < count; i += step) labelIndices.push(i);
  if (labelIndices[labelIndices.length - 1] !== count - 1) labelIndices.push(count - 1);

  const activePoint = activeIdx !== null ? points[activeIdx] : null;

  return (
    <div className="cms-svg-chart-wrap">
      <div className="cms-chart-hover-header">
        {activePoint ? (
          <div className="cms-chart-active-info">
            <strong>{activePoint.date}</strong>
            <span style={{ color: "#e11d48", fontWeight: 700 }}>{activePoint.views.toLocaleString()} views</span>
            <span style={{ color: "#64748b" }}>({activePoint.visitors.toLocaleString()} visitors)</span>
          </div>
        ) : (
          <div className="cms-chart-active-info">
            <span style={{ color: "#64748b", fontSize: "12px" }}>Hover over the trend line for daily details</span>
          </div>
        )}
      </div>

      <div style={{ position: "relative", width: "100%", flex: 1, display: "flex", alignItems: "center" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", flex: 1, overflow: "visible", display: "block" }}>
          <defs>
            <linearGradient id="viewsAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.0" />
            </linearGradient>
            <filter id="dotShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#e11d48" floodOpacity="0.3" />
            </filter>
          </defs>

          {ySteps.map((fraction, idx) => {
            const yVal = paddingTop + chartH - fraction * chartH;
            const labelVal = Math.round(fraction * gridCeil);
            return (
              <g key={idx}>
                <line x1={paddingLeft} y1={yVal} x2={width - paddingRight} y2={yVal} stroke="#e2e8f0" strokeDasharray={idx === 0 ? "none" : "3,3"} strokeWidth="1" />
                <text x={paddingLeft - 8} y={yVal + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="500">
                  {labelVal >= 1000 ? `${(labelVal / 1000).toFixed(1)}k` : labelVal}
                </text>
              </g>
            );
          })}

          <path d={areaD} fill="url(#viewsAreaGradient)" />
          <path d={lineD} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {labelIndices.map((idx) => {
            const pt = points[idx];
            if (!pt) return null;
            return (
              <text key={idx} x={pt.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="500">
                {pt.date}
              </text>
            );
          })}

          {activePoint && (
            <g>
              <line x1={activePoint.x} y1={paddingTop} x2={activePoint.x} y2={paddingTop + chartH} stroke="#e11d48" strokeWidth="1.5" strokeDasharray="4,4" />
              <circle cx={activePoint.x} cy={activePoint.y} r="6" fill="#ffffff" stroke="#e11d48" strokeWidth="3" filter="url(#dotShadow)" />
            </g>
          )}

          {points.map((pt, i) => {
            const rectW = chartW / points.length;
            const rectX = pt.x - rectW / 2;
            return (
              <rect
                key={i}
                x={rectX}
                y={paddingTop}
                width={rectW}
                height={chartH}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CmsBarChart({ trendData, period }: { trendData: Array<{ date: string; views: number; visitors: number }>; period: string }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  if (!trendData || trendData.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
        No page view trend data recorded for this period yet.
      </div>
    );
  }

  const maxViews = Math.max(...trendData.map((d) => d.views), 10);
  const gridCeil = Math.ceil(maxViews / 100) * 100 || maxViews;
  const activePoint = activeIdx !== null ? trendData[activeIdx] : null;

  const totalItems = trendData.length;
  const step = period === "7d" ? 1 : period === "30d" ? 5 : 12;

  return (
    <div className="cms-svg-chart-wrap">
      <div className="cms-chart-hover-header">
        {activePoint ? (
          <div className="cms-chart-active-info">
            <strong>{activePoint.date}</strong>
            <span style={{ color: "#e11d48", fontWeight: 700 }}>{activePoint.views.toLocaleString()} views</span>
            <span style={{ color: "#64748b" }}>({activePoint.visitors.toLocaleString()} visitors)</span>
          </div>
        ) : (
          <div className="cms-chart-active-info">
            <span style={{ color: "#64748b", fontSize: "12px" }}>Hover over any bar for daily view breakdown</span>
          </div>
        )}
      </div>

      <div className="cms-bar-chart-container">
        {trendData.map((item, idx) => {
          const heightPct = Math.max(8, Math.round((item.views / gridCeil) * 100));
          const showLabel = idx % step === 0 || idx === totalItems - 1;
          const isHovered = activeIdx === idx;

          return (
            <div
              key={idx}
              className={`cms-bar-col ${isHovered ? "is-hovered" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <div className="cms-bar-col-track">
                <div
                  className="cms-bar-col-fill"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: isHovered ? "#be123c" : "#e11d48",
                  }}
                />
              </div>
              <span className="cms-bar-col-label">{showLabel ? item.date : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CmsAnalytics() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cms/analytics?period=${p}`);
      if (!res.ok) throw new Error("Failed to load analytics data.");
      const result = await res.json();
      setData(result);
      setError("");
    } catch (e: any) {
      setError(e.message || "Could not fetch analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  if (loading && !data) {
    return (
      <div className="cms-overview">
        <header className="cms-page-header">
          <div>
            <p className="cms-eyebrow">Traffic & Insights</p>
            <h1>Analytics Dashboard</h1>
            <p>Loading analytics and Google Analytics metrics…</p>
          </div>
        </header>
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
          Fetching performance metrics…
        </div>
      </div>
    );
  }

  return (
    <div className="cms-overview">
      <header className="cms-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <p className="cms-eyebrow">Traffic & Insights</p>
          <h1>Analytics Dashboard</h1>
          <p>Real-time site traffic, page performance, and Google Analytics 4 integration.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="cms-filter-tabs" aria-label="Time period filter">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                className={period === p ? "is-active" : ""}
                onClick={() => setPeriod(p)}
              >
                {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
              </button>
            ))}
          </div>
          <a
            href="https://analytics.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="cms-primary-button"
            style={{ textDecoration: "none", fontSize: "13px" }}
          >
            <span>↗</span> GA4 Console
          </a>
        </div>
      </header>

      {error ? (
        <div style={{ padding: "14px 18px", background: "#fef2f2", color: "#991b1b", borderRadius: "8px", border: "1px solid #fecaca", marginBottom: "20px", fontSize: "13px" }}>
          {error}
        </div>
      ) : null}

      {data?.errorDetails ? (
        <div style={{ padding: "14px 18px", background: "#fef2f2", color: "#991b1b", borderRadius: "8px", border: "1px solid #fecaca", marginBottom: "20px", fontSize: "13px" }}>
          <strong>Google Analytics API Error:</strong> {data.errorDetails}
          <div style={{ marginTop: "6px", fontSize: "12px" }}>
            Make sure <code>{data.serviceEmail || "your service account"}</code> has the <strong>Viewer</strong> role in Google Analytics Admin &gt; Property Access Management.
          </div>
        </div>
      ) : null}

      <div className="cms-analytics-banner" style={{ background: data?.isLive ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)", borderColor: data?.isLive ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)" }}>
        <div className="cms-analytics-status">
          <span className="cms-pulse-dot" style={{ background: data?.isLive ? "#10b981" : "#f59e0b" }} />
          <span>
            {data?.isLive ? (
              <>
                <strong>Google Analytics 4 Live API:</strong> Tag ID <code>{data?.measurementId}</code> | Property <code>{data?.propertyId}</code>
              </>
            ) : (
              <>
                <strong>Tracking Active:</strong> Tag ID <code>{data?.measurementId || "G-R28WH8G0TH"}</code> is recording visits in Google Analytics.
              </>
            )}
          </span>
        </div>
        <span className="cms-badge-connected" style={{ background: data?.isLive ? "#10b981" : "#f59e0b", color: "#fff" }}>
          {data?.isLive ? "GA4 Live API" : "Tag Active"}
        </span>
      </div>

      {!data?.isLive && (
        <div style={{ padding: "18px 22px", background: "#fff", border: "1px solid var(--cms-line)", borderRadius: "10px", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
          <strong style={{ fontSize: "14px", color: "var(--cms-ink)" }}>⚡ To enable live Google Analytics Data API inside this dashboard:</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginTop: "4px" }}>
            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>1. Add Property ID to .env.local</div>
              <div style={{ color: "#64748b", fontSize: "12px" }}>
                In GA Admin &gt; Property Settings, copy the numeric <strong>Property ID</strong> and add <code>GA_PROPERTY_ID=123456789</code> to <code>.env.local</code>.
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>2. Grant Service Account Access</div>
              <div style={{ color: "#64748b", fontSize: "12px" }}>
                In GA Admin &gt; <strong>Property Access Management</strong>, add <code>{data?.serviceEmail || "firebase-adminsdk-fbsvc@digitalcommercecoalition.iam.gserviceaccount.com"}</code> as <strong>Viewer</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="cms-stats-grid" aria-label="Traffic summary">
        <div>
          <span>Total Page Views</span>
          <strong>{data?.metrics.totalViews}</strong>
          <small>Views across all Coalition pages ({data?.metrics.viewsGrowth})</small>
        </div>

        <div>
          <span>Unique Visitors</span>
          <strong>{data?.metrics.uniqueVisitors}</strong>
          <small>Distinct session users ({data?.metrics.visitorsGrowth})</small>
        </div>

        <div>
          <span>Avg. Session Duration</span>
          <strong>{data?.metrics.avgDuration}</strong>
          <small>Average engagement time</small>
        </div>

        <div>
          <span>Bounce Rate</span>
          <strong>{data?.metrics.bounceRate}</strong>
          <small>Single page view sessions</small>
        </div>
      </section>

      <div className="cms-analytics-main-grid">
        <section className="cms-recent-card cms-chart-card">
          <div className="cms-section-heading" style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--cms-line)", margin: 0 }}>
            <div>
              <h2>Page Views & Traffic Trends</h2>
              <p>Daily view count over the last {period === "7d" ? "7 days" : period === "90d" ? "90 days" : "30 days"}</p>
            </div>
            <div className="cms-filter-tabs" style={{ padding: "2px" }}>
              <button
                className={chartType === "area" ? "is-active" : ""}
                onClick={() => setChartType("area")}
                style={{ padding: "4px 10px", fontSize: "11px" }}
              >
                📈 Line
              </button>
              <button
                className={chartType === "bar" ? "is-active" : ""}
                onClick={() => setChartType("bar")}
                style={{ padding: "4px 10px", fontSize: "11px" }}
              >
                📊 Bars
              </button>
            </div>
          </div>

          <div style={{ padding: "20px 22px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
            {chartType === "area" ? (
              <CmsAnalyticsChart trendData={data?.trendData || []} />
            ) : (
              <CmsBarChart trendData={data?.trendData || []} period={period} />
            )}
          </div>
        </section>

        <section className="cms-recent-card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="cms-section-heading" style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--cms-line)", margin: 0 }}>
            <div>
              <h2>Traffic Sources</h2>
              <p>Channels driving visitors</p>
            </div>
          </div>

          <div className="cms-recent-list" style={{ flex: 1 }}>
            {(!data?.trafficSources || data.trafficSources.length === 0) ? (
              <div style={{ padding: "30px 22px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                No traffic source data recorded yet.
              </div>
            ) : (
              data.trafficSources.map((source, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) 50px", gap: "14px", alignItems: "center", padding: "12px 22px", borderBottom: "1px solid #eff0f2", background: "#fff" }}>
                  <span className="cms-recent-icon" style={{ background: source.color }}>{source.name.charAt(0)}</span>
                  <div>
                    <strong style={{ fontSize: "12px", color: "var(--cms-ink)", display: "block" }}>{source.name}</strong>
                    <div className="cms-progress-bg" style={{ marginTop: "4px", height: "6px" }}>
                      <div className="cms-progress-fill" style={{ width: `${source.share}%`, backgroundColor: source.color }} />
                    </div>
                  </div>
                  <span style={{ fontFamily: '"Beaufort for LOL", Georgia, serif', fontSize: "18px", fontWeight: 700, color: "var(--cms-ink)", textAlign: "right" }}>{source.share}%</span>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: "18px 22px 20px", borderTop: "1px solid var(--cms-line)", background: "#fafafb" }}>
            <div className="cms-section-heading" style={{ marginBottom: "12px" }}>
              <div>
                <h2>Device Breakdown</h2>
                <p>Session devices</p>
              </div>
            </div>
            <div className="cms-device-grid">
              {(!data?.deviceBreakdown || data.deviceBreakdown.length === 0) ? (
                <div style={{ padding: "12px", textAlign: "center", color: "#64748b", fontSize: "12px", gridColumn: "1 / -1" }}>
                  No device data recorded yet.
                </div>
              ) : (
                data.deviceBreakdown.map((dev, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", padding: "12px", border: "1px solid var(--cms-line)", borderRadius: "8px", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span className="cms-recent-icon" style={{ width: "26px", height: "26px", fontSize: "10px" }}>{dev.type.charAt(0)}</span>
                      <span style={{ fontFamily: '"Beaufort for LOL", Georgia, serif', fontSize: "18px", fontWeight: 700, color: "var(--cms-ink)" }}>{dev.share}%</span>
                    </div>
                    <strong style={{ fontSize: "12px", color: "var(--cms-ink)" }}>{dev.type}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="cms-recent-card" style={{ marginTop: "28px" }}>
        <div className="cms-section-heading" style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--cms-line)", margin: 0 }}>
          <div>
            <h2>Top Performing Content & Pages</h2>
            <p>Ranked by total page views across the site</p>
          </div>
        </div>
        <div className="cms-analytics-table-wrap">
          <div className="cms-content-table" role="table" aria-label="Top pages" style={{ minWidth: "560px" }}>
            <div className="cms-table-head" role="row" style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 100px 140px", padding: "12px 22px", background: "#f8fafc", borderBottom: "1px solid var(--cms-line)", fontWeight: 700, fontSize: "11px", color: "var(--cms-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              <span>Page Path</span>
              <span>Title / Section</span>
              <span>Views</span>
              <span>Traffic Share</span>
            </div>
            {(!data?.topPages || data.topPages.length === 0) ? (
              <div style={{ padding: "30px 22px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                No page view data recorded yet.
              </div>
            ) : (
              data.topPages.map((pg, idx) => (
                <div key={idx} className="cms-table-row" role="row" style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 100px 140px", alignItems: "center", padding: "14px 22px", borderBottom: "1px solid #eff0f2", background: "#fff" }}>
                  <span className="cms-table-title">
                    <code style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: "5px", fontSize: "12px", color: "var(--cms-ink)", fontWeight: 600, wordBreak: "break-all" }}>{pg.path}</code>
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--cms-ink)", fontWeight: 600 }}>{pg.title}</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: '"Beaufort for LOL", Georgia, serif', color: "var(--cms-ink)" }}>{pg.views.toLocaleString()}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="cms-progress-bg" style={{ flex: 1, height: "6px" }}>
                      <div className="cms-progress-fill" style={{ width: pg.pct, backgroundColor: "var(--cms-accent)", height: "100%", borderRadius: "3px" }} />
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--cms-muted)", minWidth: "30px" }}>{pg.pct}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CmsUsers() {
  const dialog = useAdminDialog();
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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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
        setToast({ message: `Successfully added ${email} as ${newRole === "superadmin" ? "Super Admin" : "Admin"}`, type: "success" });
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
        setToast({ message: `Updated ${targetEmail} role to ${role === "superadmin" ? "Super Admin" : "Admin"}`, type: "success" });
        await fetchUsers();
      } else {
        const data = await res.json();
        setToast({ message: data.error || "Failed to update user role", type: "error" });
      }
    } catch {
      setToast({ message: "Network error updating role.", type: "error" });
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
        setToast({ message: `Password reset successfully for ${resetPasswordTarget.email}`, type: "success" });
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
    const confirmed = await dialog.confirm({
      title: "Revoke CMS access?",
      message: `${userEmail} will no longer be able to sign in or manage website content.`,
      confirmLabel: "Revoke access",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const res = await fetch("/api/cms/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        setToast({ message: `Access revoked for ${userEmail}`, type: "success" });
        await fetchUsers();
      } else {
        const data = await res.json();
        setToast({ message: data.error || "Failed to delete user", type: "error" });
      }
    } catch {
      setToast({ message: "Network error deleting user.", type: "error" });
    }
  };

  const filteredUsers = users.filter((u) =>
    (u.email || "").toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const isSuperAdmin = currentUserRole === "superadmin";

  return (
    <div className="cms-overview">
      {toast && (
        <div className={`cms-toast is-${toast.type}`}>
          {toast.message}
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
