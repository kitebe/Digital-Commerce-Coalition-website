import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerAuth } from "./firebase-server";
import { jwtVerify, SignJWT } from "jose";

export const CMS_SESSION_COOKIE = "dcc_cms_session";

const getPassword = () => process.env.CMS_PASSWORD;
const getSecret = () => process.env.CMS_SECRET || getPassword();

const hash = (value: string) =>
  createHmac("sha256", getSecret() || "unconfigured")
    .update(value)
    .digest("hex");

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const isCmsConfigured = () =>
  Boolean(getPassword()) || Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

export const verifyCmsPassword = (password: string) => {
  const configuredPassword = getPassword();
  if (!configuredPassword) return false;
  return safeEqual(hash(password), hash(configuredPassword));
};

export const getCmsSessionToken = () => hash("dcc-cms-authenticated");

export async function verifyFirebaseIdToken(token: string, projectId: string) {
  try {
    const auth = getServerAuth();
    if (!auth) throw new Error("Firebase Admin Auth is not configured");
    const payload = await auth.verifyIdToken(token);
    console.log("Firebase Auth Admin JWT Payload verified successfully.");
    return payload;
  } catch (error: any) {
    console.error("Firebase ID token verification failed via Admin SDK:", error);
    return { error: error.message || String(error) };
  }
}

const getSecretKey = () => {
  const secret = getSecret() || "default-fallback-secret-for-dev-only";
  return new TextEncoder().encode(secret);
};

export async function createSessionToken(email: string, uid: string, role: "superadmin" | "admin" = "superadmin") {
  const secretKey = getSecretKey();
  const token = await new SignJWT({ email, uid, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
  return token;
}

export async function verifySessionToken(token: string) {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    return payload as { email: string; uid: string; role?: "superadmin" | "admin" };
  } catch (error) {
    return null;
  }
}

export async function isCmsAuthenticated() {
  if (!isCmsConfigured()) return false;
  const token = (await cookies()).get(CMS_SESSION_COOKIE)?.value;
  if (!token) return false;

  // 1. Try Firebase-based session token
  const firebasePayload = await verifySessionToken(token);
  if (firebasePayload) {
    return true;
  }

  // 2. Try old static password token
  const configuredPassword = getPassword();
  if (configuredPassword) {
    return safeEqual(token, getCmsSessionToken());
  }

  return false;
}

export async function getCurrentUser() {
  const token = (await cookies()).get(CMS_SESSION_COOKIE)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

