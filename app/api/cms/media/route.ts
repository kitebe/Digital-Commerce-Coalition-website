import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { isCmsAuthenticated } from "../../../../lib/cms/auth";
import { getStorageBucket } from "../../../../lib/cms/firebase-server";

export const dynamic = "force-dynamic";

const allowedTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

export async function POST(request: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  if (!allowedTypes[file.type]) {
    return NextResponse.json(
      { error: "Upload a JPG, PNG, WebP, GIF, or PDF file." },
      { status: 415 },
    );
  }

  if (file.size > 12 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Files must be smaller than 12 MB." },
      { status: 413 },
    );
  }

  const originalExtension = extname(file.name).toLowerCase();
  const extension = allowedTypes[file.type] || originalExtension;
  const baseName = file.name
    .replace(originalExtension, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "upload";
  const filename = `${baseName}-${randomUUID().slice(0, 8)}${extension}`;

  const bucket = getStorageBucket();
  if (bucket) {
    try {
      const token = randomUUID();
      const fileRef = bucket.file(`uploads/${filename}`);
      await fileRef.save(Buffer.from(await file.arrayBuffer()), {
        metadata: {
          contentType: file.type,
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(`uploads/${filename}`)}?alt=media&token=${token}`;
      return NextResponse.json({ url });
    } catch (error) {
      console.error("Firebase Storage upload failed, falling back to disk:", error);
    }
  }

  // Fallback to local disk
  const uploadDirectory = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(join(uploadDirectory, filename), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/uploads/${filename}` });
}

