const workBubbles = Array.from(document.querySelectorAll("[data-work-bubble]"));

if (workBubbles.length === 4) {
  const slotClasses = [
    "is-center",
    "is-left",
    "is-right",
    "is-hidden",
    "is-hidden-left",
    "is-hidden-right",
  ];
  const hiddenSlots = ["is-hidden", "is-hidden-left", "is-hidden-right"];
  const stackedDial = window.matchMedia("(max-width: 759px)");
  const workScroll = document.querySelector(".work-scroll");
  const workSection = document.querySelector(".work");
  const diamondRails = document.querySelector(".diamond-rails");
  let activeIndex = -1;
  let frame = null;
  let railsPinned = false;

  const syncDiamondRails = () => {
    if (!diamondRails || !workScroll || !workSection || stackedDial.matches) {
      diamondRails?.classList.remove("is-pinned");
      railsPinned = false;
      return;
    }

    const rootStyles = window.getComputedStyle(document.documentElement);
    const diamondGap =
      Number.parseFloat(rootStyles.getPropertyValue("--diamond-gap")) || 0;
    const stickyTop =
      Number.parseFloat(window.getComputedStyle(workSection).top) || 0;
    const workRect = workScroll.getBoundingClientRect();
    const rawOffset = stickyTop - workRect.top;
    const maxOffset = Math.max(
      0,
      workRect.height -
        workSection.getBoundingClientRect().height,
    );
    const shouldPin = rawOffset > 0 && rawOffset < maxOffset;

    if (diamondGap > 0 && !railsPinned && shouldPin) {
      const mainTop = diamondRails.parentElement.getBoundingClientRect().top;
      const phase =
        ((((mainTop + 22 - stickyTop) % diamondGap) + diamondGap) % diamondGap);

      diamondRails.style.setProperty(
        "--pinned-diamond-phase",
        `${Number(phase.toFixed(3))}px`,
      );
    }

    if (shouldPin === railsPinned) return;

    railsPinned = shouldPin;
    diamondRails.classList.toggle("is-pinned", shouldPin);
  };

  const getSlot = (index, currentIndex) => {
    const offset = (index - currentIndex + workBubbles.length) % workBubbles.length;

    if (offset === 0) return "is-center";
    if (offset === 1) return "is-right";
    if (offset === workBubbles.length - 1) return "is-left";
    return "is-hidden";
  };

  const getCurrentSlot = (bubble) =>
    slotClasses.find((slotClass) => bubble.classList.contains(slotClass));

  const isHiddenSlot = (slot) => hiddenSlots.includes(slot);

  const getHiddenEntrySlot = (direction) =>
    direction < 0 ? "is-hidden-left" : "is-hidden-right";

  const getHiddenExitSlot = (currentSlot, direction) => {
    if (currentSlot === "is-left" || direction > 0) return "is-hidden-left";
    if (currentSlot === "is-right" || direction < 0) return "is-hidden-right";
    return getHiddenEntrySlot(direction);
  };

  const applySlot = (bubble, slot, { instant = false } = {}) => {
    if (instant) bubble.classList.add("no-motion");

    bubble.classList.remove(...slotClasses);
    bubble.classList.add(slot);
    bubble.setAttribute(
      "aria-hidden",
      !stackedDial.matches && isHiddenSlot(slot) ? "true" : "false",
    );

    if (!instant) return;
    void bubble.offsetHeight;
    bubble.classList.remove("no-motion");
  };

  const getActiveIndex = () => {
    if (!workScroll || !workSection || stackedDial.matches) return 0;

    const rect = workScroll.getBoundingClientRect();
    const stickyTop = Number.parseFloat(window.getComputedStyle(workSection).top) || 0;
    const workHeight = workSection.getBoundingClientRect().height;
    const scrollDistance = workHeight * 0.75;
    const startDelay = workHeight * 0.18;
    const progress = Math.min(
      1,
      Math.max(0, (stickyTop - rect.top - startDelay) / scrollDistance),
    );

    if (progress <= 0.005) return 0;

    return Math.min(
      workBubbles.length - 1,
      Math.ceil(progress * (workBubbles.length - 1)),
    );
  };

  const renderDial = () => {
    const nextActive = getActiveIndex();

    if (nextActive === activeIndex && !stackedDial.matches) return;
    const direction = activeIndex < 0 ? 1 : Math.sign(nextActive - activeIndex) || 1;
    activeIndex = nextActive;
    const hiddenEntrySlot = getHiddenEntrySlot(direction);

    workBubbles.forEach((bubble, index) => {
      const currentSlot = getCurrentSlot(bubble) || hiddenEntrySlot;
      const nextSlot = getSlot(index, activeIndex);

      if (isHiddenSlot(nextSlot)) {
        applySlot(
          bubble,
          isHiddenSlot(currentSlot)
            ? hiddenEntrySlot
            : getHiddenExitSlot(currentSlot, direction),
          { instant: isHiddenSlot(currentSlot) && !stackedDial.matches },
        );
        return;
      }

      if (isHiddenSlot(currentSlot) && !stackedDial.matches) {
        applySlot(bubble, hiddenEntrySlot, { instant: true });
        window.requestAnimationFrame(() => {
          applySlot(bubble, nextSlot);
        });
        return;
      }

      applySlot(bubble, nextSlot);
    });
  };

  const scheduleRender = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      syncDiamondRails();
      renderDial();
    });
  };

  syncDiamondRails();
  renderDial();
  window.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", () => {
    syncDiamondRails();
    scheduleRender();
  });
  window.addEventListener("load", syncDiamondRails);
  document.fonts?.ready?.then(syncDiamondRails);
  stackedDial.addEventListener("change", () => {
    syncDiamondRails();
    scheduleRender();
  });
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const wrapWordsForReveal = (element) => {
  if (element.dataset.textRevealReady === "true") return;

  const counter = { value: 0 };

  const wrapTextNode = (textNode) => {
    const parts = textNode.textContent.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    parts.forEach((part) => {
      if (!part) return;

      if (/^\s+$/.test(part)) {
        fragment.append(part);
        return;
      }

      const word = document.createElement("span");
      word.className = "reveal-word";
      word.style.setProperty("--word-index", counter.value);
      word.textContent = part;
      counter.value += 1;
      fragment.append(word);
    });

    textNode.replaceWith(fragment);
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) wrapTextNode(node);
      return;
    }

    const display = window.getComputedStyle(node).display;
    const keepsDirectTextTogether =
      display === "flex" || display === "inline-flex";

    Array.from(node.childNodes).forEach((child) => {
      if (keepsDirectTextTogether && child.nodeType === Node.TEXT_NODE) return;
      walk(child);
    });
  };

  walk(element);
  element.dataset.textRevealReady = "true";
};

const setupRevealAnimations = () => {
  const textTargets = Array.from(
    document.querySelectorAll(
      [
        ".hero-copy h1",
        ".about-copy h2",
        ".about-copy p",
        ".section-kicker",
        ".focus-card h3",
        ".focus-card p",
        ".work-bubble h2",
        ".work-bubble h3",
        ".work-bubble p",
        ".contact a",
        ".events-hero h1",
        ".events-hero .events-eyebrow",
        ".events-intro",
        ".events-section-heading .events-eyebrow",
        ".events-section-heading h2",
        ".events-empty-copy h3",
        ".events-empty-copy > p",
        ".archive-copy h3",
        ".archive-copy > p",
        ".events-contact .events-eyebrow",
        ".events-contact h2",
        ".events-contact a",
        ".event-detail-copy .events-eyebrow",
        ".event-detail-title",
        ".event-detail-summary",
        ".event-detail-article .events-eyebrow",
        ".event-detail-article h2",
        ".event-detail-article > p",
        ".event-topics h3",
        ".event-topic-list li",
        ".event-facts-title",
        ".event-facts dd",
        ".event-detail-contact .events-eyebrow",
        ".event-detail-contact h2",
        ".event-detail-contact a",
        ".blog-section-heading .blog-eyebrow",
        ".blog-section-heading h2",
        ".blog-card-label",
        ".blog-card h2",
        ".blog-card-excerpt",
        ".blog-card-footer",
        ".blog-contact .blog-eyebrow",
        ".blog-contact h2",
        ".blog-contact a",
        ".blog-post-hero .blog-eyebrow",
        ".blog-post-hero h1",
        ".blog-post-excerpt",
        ".blog-post-meta",
        ".blog-post-paragraphs p",
        ".blog-post-contact .blog-eyebrow",
        ".blog-post-contact h2",
        ".blog-post-contact a",
        ".press-section-heading .press-eyebrow",
        ".press-section-heading h2",
        ".press-card .press-publication",
        ".press-card h2",
        ".press-card-footer",
        ".press-contact .press-eyebrow",
        ".press-contact h2",
        ".press-contact a",
        ".publications-section-heading .publications-eyebrow",
        ".publications-section-heading h2",
        ".publication-card .publication-meta",
        ".publication-card h2",
        ".publication-card-description",
        ".publication-card-actions",
        ".publications-contact .publications-eyebrow",
        ".publications-contact h2",
        ".publications-contact a",
        ".publication-detail-copy .publications-eyebrow",
        ".publication-detail-copy h1",
        ".publication-detail-description",
        ".publication-facts dd",
        ".publication-about .publications-eyebrow",
        ".publication-about h2",
        ".publication-about-copy > p",
        ".publication-theme-list li",
        ".trust-hero .blog-eyebrow",
        ".trust-hero h1",
        ".trust-meta",
        ".trust-deck p",
        ".trust-body-aside .blog-eyebrow",
        ".trust-body-aside > p",
        ".trust-lead",
        ".trust-reading-section h2",
        ".trust-reading-section div > p",
        ".trust-quote",
        ".trust-takeaways .blog-eyebrow",
        ".trust-takeaways h2",
        ".trust-takeaways li",
        ".trust-next .blog-eyebrow",
        ".trust-next h2",
        ".trust-next a",
      ].join(", "),
    ),
  );

  const revealTargets = Array.from(
    document.querySelectorAll(
      [
        ".hero-copy",
        ".hero-art",
        ".about-copy",
        ".about-visual",
        ".section-heading",
        ".focus-card",
        ".council .section-kicker",
        ".logo-row",
        ".contact .section-kicker",
        ".contact a",
        ".site-footer > div",
        ".events-hero-copy",
        ".events-hero-art",
        ".events-section-heading",
        ".events-empty-state",
        ".past-events-archive",
        ".events-contact .events-eyebrow",
        ".events-contact-row",
        ".event-detail-copy",
        ".event-detail-image-wrap",
        ".event-detail-article",
        ".event-detail-aside",
        ".event-detail-contact",
        ".blog-section-heading",
        ".blog-card",
        ".blog-contact",
        ".blog-post-hero .blog-back-link",
        ".blog-post-image-wrap",
        ".blog-post-content",
        ".blog-post-contact",
        ".press-section-heading",
        ".press-card",
        ".press-contact",
        ".publications-section-heading",
        ".publication-card",
        ".publications-contact",
        ".publication-back-link",
        ".publication-detail-copy",
        ".publication-detail-cover",
        ".publication-about > div",
        ".trust-hero-copy",
        ".trust-hero-image",
        ".trust-deck",
        ".trust-body-aside",
        ".trust-body-content",
        ".trust-takeaways",
        ".trust-next",
      ].join(", "),
    ),
  );

  document.querySelectorAll(".about-visual, .focus-card").forEach((element, index) => {
    element.style.setProperty("--reveal-delay", `${index * 90}ms`);
  });

  if (reducedMotion.matches) {
    [...revealTargets, ...textTargets].forEach((element) => {
      element.classList.add("is-visible");
    });
    return;
  }

  textTargets.forEach((element) => {
    wrapWordsForReveal(element);
    element.classList.add("text-reveal");
  });

  revealTargets.forEach((element) => {
    element.classList.add("reveal");
  });

  const animatedTargets = Array.from(new Set([...revealTargets, ...textTargets]));

  if (!("IntersectionObserver" in window)) {
    animatedTargets.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.12,
    },
  );

  animatedTargets.forEach((element) => revealObserver.observe(element));
};

const setupMobileMenu = () => {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.querySelector(".mobile-menu");

  if (!header || !toggle || !menu) return;

  const setOpen = (isOpen) => {
    header.classList.toggle("is-menu-open", isOpen);
    document.body.classList.toggle("is-menu-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  };

  toggle.addEventListener("click", () => {
    setOpen(!header.classList.contains("is-menu-open"));
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
};

setupRevealAnimations();
setupMobileMenu();
