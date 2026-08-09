import type { Metadata } from "next";
import { ErrorPageShell } from "./error-page-shell";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <ErrorPageShell
      code="404"
      eyebrow="Page not found"
      title="This page took a wrong turn."
      description="The link may be outdated, or the page may have moved. Let’s get you back to the Coalition’s latest work and ideas."
    />
  );
}
