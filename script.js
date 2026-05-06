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
  let activeIndex = -1;
  let frame = null;

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
      renderDial();
    });
  };

  renderDial();
  window.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", scheduleRender);
  stackedDial.addEventListener("change", scheduleRender);
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

    Array.from(node.childNodes).forEach(walk);
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
      ].join(", "),
    ),
  );

  const revealTargets = Array.from(
    document.querySelectorAll(
      [
        ".hero-copy",
        ".hero-art",
        ".about-copy",
        ".about-orbits article",
        ".section-heading",
        ".focus-card",
        ".council .section-kicker",
        ".logo-row",
        ".contact .section-kicker",
        ".contact a",
        ".site-footer > div",
      ].join(", "),
    ),
  );

  document.querySelectorAll(".about-orbits article, .focus-card").forEach((element, index) => {
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

setupRevealAnimations();
