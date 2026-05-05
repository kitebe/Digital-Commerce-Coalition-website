const workBubbles = Array.from(document.querySelectorAll("[data-work-bubble]"));

if (workBubbles.length === 4) {
  const slotClasses = ["is-center", "is-left", "is-right", "is-hidden"];
  const stackedDial = window.matchMedia("(max-width: 759px)");
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

  const applySlot = (bubble, slot, { instant = false } = {}) => {
    if (instant) bubble.classList.add("no-motion");

    bubble.classList.remove(...slotClasses);
    bubble.classList.add(slot);
    bubble.setAttribute(
      "aria-hidden",
      !stackedDial.matches && slot === "is-hidden" ? "true" : "false",
    );

    if (!instant) return;
    void bubble.offsetHeight;
    bubble.classList.remove("no-motion");
  };

  const getActiveIndex = () => {
    if (!workSection || stackedDial.matches) return 0;

    const rect = workSection.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.75)));

    return Math.min(workBubbles.length - 1, Math.floor(progress * workBubbles.length));
  };

  const renderDial = () => {
    const nextActive = getActiveIndex();

    if (nextActive === activeIndex && !stackedDial.matches) return;
    activeIndex = nextActive;

    workBubbles.forEach((bubble, index) => {
      const currentSlot = getCurrentSlot(bubble);
      const nextSlot = getSlot(index, activeIndex);

      if (nextSlot === "is-hidden") {
        applySlot(bubble, nextSlot, { instant: !stackedDial.matches });
        return;
      }

      if (currentSlot === "is-hidden" && !stackedDial.matches) {
        applySlot(bubble, nextSlot, { instant: true });
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
