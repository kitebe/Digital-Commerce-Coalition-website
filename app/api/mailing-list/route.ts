import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirestoreDb } from "../../../lib/cms/firebase-server";

export const runtime = "nodejs";
const signupSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
});
const success = () => NextResponse.json({ message: "You’re on the list! We’ll email you about future Coalition events." });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Please sign up through our website." }, { status: 403 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2048) {
    return NextResponse.json({ error: "Please submit a valid email address." }, { status: 413 });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Please submit a valid email address." }, { status: 400 });
  }
  const result = signupSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Enter a valid email address and agree to receive event updates." }, { status: 400 });
  }
  if (result.data.website) return success();
  try {
    const db = getFirestoreDb();
    if (!db) throw new Error("Mailing list storage is not configured.");
    const { email } = result.data;
    const id = createHash("sha256").update(email).digest("hex");
    const ref = db.collection("mailingListSubscribers").doc(id);
    // An email has one entry; repeat submissions preserve its original consent date.
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (!existing.exists) transaction.create(ref, {
        email, subscribedAt: new Date().toISOString(), source: "events",
        consent: "I agree to receive email updates about Coalition events.",
      });
    });
    return success();
  } catch (error) {
    console.error("Mailing list signup failed:", error);
    return NextResponse.json({ error: "We couldn’t save your signup. Please try again shortly." }, { status: 503 });
  }
}
