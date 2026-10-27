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

// Track the actual page DOM: revisiting a URL creates new markup that needs
// initialization, while Strict Mode's second effect uses the same markup.
const executedRoots = new WeakSet<Element>();

export function LegacyRuntime({
  pageKey,
  runtime,
  dynamicHead,
}: LegacyRuntimeProps) {
  useEffect(() => {
    const root = document.querySelector(".next-page-root");
    if (!root || executedRoots.has(root)) return;
    executedRoots.add(root);

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
