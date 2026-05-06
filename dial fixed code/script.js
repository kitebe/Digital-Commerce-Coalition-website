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
    const scrollDistance = workSection.getBoundingClientRect().height * 0.75;
    const progress = Math.min(1, Math.max(0, -rect.top / scrollDistance));

    return Math.min(workBubbles.length - 1, Math.floor(progress * workBubbles.length));
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
