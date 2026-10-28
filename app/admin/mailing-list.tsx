"use client";

import { useEffect, useState } from "react";

type Subscriber = { email: string; subscribedAt: string; source: string };

export function CmsMailingList() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch("/api/cms/mailing-list", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load subscribers.");
        setSubscribers(data.subscribers);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message || "Could not load subscribers."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const filtered = subscribers.filter((subscriber) => subscriber.email.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <header className="cms-page-header"><div><p className="cms-eyebrow">Stay connected</p><h1>Mailing list</h1><p>People who signed up for Coalition event updates.</p></div><a className="cms-primary-button" href="/api/cms/mailing-list?format=csv">Export CSV</a></header>
    <section className="cms-library-card" aria-label="Mailing list subscribers">
      <div className="cms-library-toolbar"><label className="cms-search-field"><input aria-label="Search subscribers" placeholder="Search email addresses…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="cms-preview-button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Refresh</button></div>
      {loading ? <p className="cms-table-empty" role="status">Loading subscribers…</p> : error ? <p className="cms-table-empty" role="alert">{error}</p> : <>
        <p className="cms-mailing-count">{subscribers.length} {subscribers.length === 1 ? "subscriber" : "subscribers"}</p>
        <div className="cms-mailing-table"><table><thead><tr><th>Email address</th><th>Signed up</th><th>Source</th></tr></thead><tbody>{filtered.map((subscriber) => <tr key={subscriber.email}><td>{subscriber.email}</td><td>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(subscriber.subscribedAt))}</td><td>{subscriber.source}</td></tr>)}</tbody></table></div>
        {!filtered.length && <p className="cms-table-empty">{query ? "No matching subscribers." : "No signups yet. New subscribers will appear here."}</p>}
      </>}
    </section>
  </>;
}
