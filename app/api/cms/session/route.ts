import { NextResponse } from "next/server";
import {
  CMS_SESSION_COOKIE,
  getCmsSessionToken,
  isCmsAuthenticated,
  isCmsConfigured,
  verifyCmsPassword,
  verifyFirebaseIdToken,
  createSessionToken,
} from "../../../../lib/cms/auth";

export const dynamic = "force-dynamic";

const isSecureRequest = (request: Request) => {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  return forwardedProtocol
    ? forwardedProtocol === "https"
    : new URL(request.url).protocol === "https:";
};

export async function GET() {
  return NextResponse.json({
    configured: isCmsConfigured(),
    authenticated: await isCmsAuthenticated(),
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const isFormSubmission =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  if (!isCmsConfigured()) {
    if (isFormSubmission) {
      return NextResponse.redirect(new URL("/admin?error=setup", request.url), 303);
    }
    return NextResponse.json(
      { error: "Set Firebase credentials or CMS_PASSWORD before signing in." },
      { status: 503 },
    );
  }

  let body: { password?: unknown; idToken?: unknown } | null = null;
  if (!isFormSubmission) {
    body = (await request.json().catch(() => null)) as { password?: unknown; idToken?: unknown } | null;
  }

  // 1. Check if Firebase ID token is provided
  const idToken = typeof body?.idToken === "string" ? body.idToken : "";
  if (idToken) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: "Firebase is not configured on the server." }, { status: 500 });
    }
    const payload = await verifyFirebaseIdToken(idToken, projectId);
    if (!payload || "error" in payload) {
      return NextResponse.json({ error: `Firebase JWT verification error: ${payload && "error" in payload ? payload.error : "Verification failed"}` }, { status: 401 });
    }
    const email = typeof payload.email === "string" ? payload.email : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!email || !sub) {
      return NextResponse.json({ error: "Invalid or expired Firebase ID token. Missing email or sub." }, { status: 401 });
    }

    // Determine user role from Firebase custom claims or default to superadmin
    let role: "superadmin" | "admin" = "superadmin";
    try {
      const auth = (await import("../../../../lib/cms/firebase-server")).getServerAuth();
      if (auth) {
        const userRecord = await auth.getUser(sub);
        if (userRecord.customClaims?.role === "admin") {
          role = "admin";
        }
      }
    } catch (err) {
      console.error("Error fetching user custom claims:", err);
    }

    const sessionToken = await createSessionToken(email, sub, role);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(CMS_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(request),
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  }

  // 2. Fall back to old static password logic
  let password = "";
  if (isFormSubmission) {
    const formData = await request.formData();
    const submittedPassword = formData.get("password");
    password = typeof submittedPassword === "string" ? submittedPassword : "";
  } else {
    password = typeof body?.password === "string" ? body.password : "";
  }

  if (!verifyCmsPassword(password)) {
    if (isFormSubmission) {
      return NextResponse.redirect(new URL("/admin?error=invalid", request.url), 303);
    }
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = isFormSubmission
    ? NextResponse.redirect(new URL("/admin", request.url), 303)
    : NextResponse.json({ authenticated: true });
  response.cookies.set(CMS_SESSION_COOKIE, getCmsSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(CMS_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}

