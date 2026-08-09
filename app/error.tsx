"use client";

import { useEffect } from "react";
import { ErrorPageShell } from "./error-page-shell";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPageShell
      code="500"
      eyebrow="Something went wrong"
      title="The flow was interrupted."
      description="We couldn’t load this page just now. Try once more, or return home and continue exploring the Coalition’s work."
      primaryAction={(
        <button className="error-button error-button-primary" type="button" onClick={reset}>
          Try again
        </button>
      )}
      secondaryHref="/"
      secondaryLabel="Return home"
    />
  );
}
