import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

export const isCmsConfigured = () => Boolean(getPassword());

export const verifyCmsPassword = (password: string) => {
  const configuredPassword = getPassword();
  if (!configuredPassword) return false;
  return safeEqual(hash(password), hash(configuredPassword));
};

export const getCmsSessionToken = () => hash("dcc-cms-authenticated");

export async function isCmsAuthenticated() {
  if (!isCmsConfigured()) return false;
  const token = (await cookies()).get(CMS_SESSION_COOKIE)?.value;
  return Boolean(token && safeEqual(token, getCmsSessionToken()));
}
