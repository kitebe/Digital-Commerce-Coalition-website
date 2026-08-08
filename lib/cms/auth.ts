import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

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

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/serviceaccounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyFirebaseIdToken(token: string, projectId: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return payload;
  } catch (error) {
    console.error("Firebase ID token verification failed:", error);
    return null;
  }
}

const getSecretKey = () => {
  const secret = getSecret() || "default-fallback-secret-for-dev-only";
  return new TextEncoder().encode(secret);
};

export async function createSessionToken(email: string, uid: string) {
  const secretKey = getSecretKey();
  const token = await new SignJWT({ email, uid })
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
    return payload as { email: string; uid: string };
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
    const email = firebasePayload.email;
    const allowed = process.env.ALLOWED_CMS_USERS
      ? process.env.ALLOWED_CMS_USERS.split(",").map((e) => e.trim().toLowerCase())
      : [];
    if (allowed.length > 0 && !allowed.includes(email.toLowerCase())) {
      console.warn(`User ${email} is authenticated but not in ALLOWED_CMS_USERS`);
      return false;
    }
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

