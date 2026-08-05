"use client";

import { useEffect } from "react";

type DynamicHead = {
  titleSelector: string;
  descriptionSelector: string;
};

type LegacyRuntimeProps = {
  pageKey: string;
  runtime: string;
  dynamicHead?: DynamicHead;
};

declare global {
  interface Window {
    __dccLegacyRuntimes?: Set<string>;
  }
}

export function LegacyRuntime({
  pageKey,
  runtime,
  dynamicHead,
}: LegacyRuntimeProps) {
  useEffect(() => {
    const runtimeKey = `${pageKey}:${window.location.pathname}:${window.location.search}`;
    const executedRuntimes = (window.__dccLegacyRuntimes ??= new Set());

    // React runs effects twice in development Strict Mode. The legacy scripts
    // attach listeners and build cards imperatively, so they must execute once.
    if (executedRuntimes.has(runtimeKey)) return;
    executedRuntimes.add(runtimeKey);

    const script = document.createElement("script");
    script.textContent = runtime;
    document.body.append(script);
    script.remove();

    const syncDynamicHead = () => {
      if (!dynamicHead) return;

      const title = document
        .querySelector(dynamicHead.titleSelector)
        ?.textContent?.trim();
      const description = document
        .querySelector(dynamicHead.descriptionSelector)
        ?.textContent?.trim();

      if (title) document.title = `${title} | Digital Commerce Coalition`;
      if (description) {
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute("content", description);
      }
    };

    syncDynamicHead();

    // Next can finish reconciling streamed metadata after passive effects.
    // Reapply query-driven detail metadata after that reconciliation completes.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncDynamicHead);
    });
  }, [dynamicHead, pageKey, runtime]);

  return null;
}
