"use client";

import { useEffect } from "react";
import { ErrorPageShell } from "./error-page-shell";

export default function GlobalError({
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
    <html lang="en">
      <head>
        <title>Something went wrong | Digital Commerce Coalition</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="stylesheet" href="/styles.css" />
        <link rel="stylesheet" href="/error-pages.css" />
      </head>
      <body>
        <ErrorPageShell
          code="500"
          eyebrow="Unexpected error"
          title="We’ve reached a temporary roadblock."
          description="The website can’t complete your request right now. Please try again, or start fresh from the homepage."
          primaryAction={(
            <button className="error-button error-button-primary" type="button" onClick={reset}>
              Try again
            </button>
          )}
          secondaryHref="/"
          secondaryLabel="Return home"
        />
      </body>
    </html>
  );
}
