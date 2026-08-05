import { AdminApp } from "./admin-app";
import { isCmsAuthenticated, isCmsConfigured } from "../../lib/cms/auth";
import { readCmsContent } from "../../lib/cms/store";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = isCmsConfigured();
  const authenticated = configured && (await isCmsAuthenticated());
  const { error } = await searchParams;

  return (
    <AdminApp
      configured={configured}
      authenticated={authenticated}
      initialContent={authenticated ? readCmsContent() : null}
      loginError={error === "invalid" ? "Incorrect password." : ""}
    />
  );
}
