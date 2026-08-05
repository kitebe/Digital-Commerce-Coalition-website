const dccMembers = [];

const renderMembers = () => {
  const section = document.querySelector("#council");
  const track = document.querySelector("[data-members-track]");
  const memberLinks = document.querySelectorAll('a[href="#council"]');
  if (!section || !track) return;

  if (!dccMembers.length) {
    section.hidden = true;
    memberLinks.forEach((link) => { link.hidden = true; });
    return;
  }

  const createSet = (hidden = false) => {
    const set = document.createElement("div");
    set.className = "logo-set";
    if (hidden) set.setAttribute("aria-hidden", "true");
    dccMembers.forEach((member) => {
      const frame = document.createElement("span");
      const image = document.createElement("img");
      image.src = member.logo;
      image.alt = hidden ? "" : member.logoAlt || member.name;
      image.loading = "lazy";
      frame.append(image);
      set.append(frame);
    });
    return set;
  };

  track.replaceChildren(createSet());
  if (dccMembers.length >= 4) {
    track.append(createSet(true));
  } else {
    track.classList.add("is-static");
  }
};

renderMembers();
