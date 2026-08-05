import { NextResponse } from "next/server";
import {
  CMS_SESSION_COOKIE,
  getCmsSessionToken,
  isCmsAuthenticated,
  isCmsConfigured,
  verifyCmsPassword,
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
      { error: "Set CMS_PASSWORD before signing in." },
      { status: 503 },
    );
  }

  let password = "";
  if (isFormSubmission) {
    const formData = await request.formData();
    const submittedPassword = formData.get("password");
    password = typeof submittedPassword === "string" ? submittedPassword : "";
  } else {
    const body = (await request.json().catch(() => null)) as
      | { password?: unknown }
      | null;
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
