import { NextResponse } from "next/server";
import { isCmsAuthenticated } from "../../../../lib/cms/auth";
import { getFirestoreDb } from "../../../../lib/cms/firebase-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const csvCell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  if (!(await isCmsAuthenticated())) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    const db = getFirestoreDb();
    if (!db) throw new Error("Mailing list storage is not configured.");
    const snapshot = await db.collection("mailingListSubscribers").orderBy("subscribedAt", "desc").get();
    const subscribers = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { email: String(data.email || ""), subscribedAt: String(data.subscribedAt || ""), source: String(data.source || ""), consent: String(data.consent || "") };
    });
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const rows = [["Email", "Subscribed at", "Source", "Consent"], ...subscribers.map((s) => [s.email, s.subscribedAt, s.source, s.consent])];
      return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="coalition-mailing-list.csv"' },
      });
    }
    return NextResponse.json({ subscribers }, { headers });
  } catch (error) {
    console.error("Mailing list read failed:", error);
    return NextResponse.json({ error: "Could not load subscribers. Please try again." }, { status: 503, headers });
  }
}
