/*
 * Add event entries to the relevant list below. Empty lists automatically show
 * the designed "more soon" states on the Events page.
 *
 * Example:
 * {
 *   slug: "event-name",
 *   day: "18",
 *   month: "September",
 *   year: "2026",
 *   format: "Roundtable",
 *   title: "Event title",
 *   summary: "A short description of the event.",
 *   location: "New Delhi",
 *   image: "./assets/events/event-name.jpg",
 *   imageAlt: "Participants at the event",
 *   href: "./event.html?event=event-name",
 *   description: "A longer description for the internal event page.",
 *   topics: ["Topic one", "Topic two", "Topic three"],
 *   linkLabel: "Read more"
 * }
 */
const dccEvents = { upcoming: [], past: [] };

const createEventCard = (event, index, type) => {
  const article = document.createElement("article");
  article.className = "event-card";
  article.style.setProperty("--event-card-index", index);

  const media = document.createElement("div");
  media.className = "event-card-media";

  if (event.image) {
    const image = document.createElement("img");
    image.src = event.image;
    image.alt = event.imageAlt || "";
    image.loading = "lazy";
    media.append(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "event-card-image-placeholder";
    placeholder.setAttribute("aria-hidden", "true");

    const placeholderLabel = document.createElement("span");
    placeholderLabel.textContent = "DCC";
    placeholder.append(placeholderLabel);
    media.append(placeholder);
  }

  const content = document.createElement("div");
  content.className = "event-card-content";

  const date = document.createElement("p");
  date.className = "event-card-date";
  date.textContent =
    event.dateLabel ||
    [event.month, event.day ? `${event.day},` : "", event.year]
      .filter(Boolean)
      .join(" ");

  const meta = document.createElement("p");
  meta.className = "event-card-meta";
  meta.textContent = [event.format, event.location].filter(Boolean).join(" · ");

  const title = document.createElement("h3");
  title.textContent = event.title || "Coalition event";

  const summary = document.createElement("p");
  summary.className = "event-card-summary";
  summary.textContent = event.summary || "";

  content.append(date);
  if (meta.textContent) content.append(meta);
  content.append(title);
  if (event.summary) content.append(summary);

  if (event.href) {
    const link = document.createElement("a");
    link.className = "event-card-link";
    link.href = event.href;

    const linkLabel = document.createElement("span");
    linkLabel.className = "event-card-link-label";
    linkLabel.textContent =
      event.linkLabel || (type === "past" ? "Read more" : "View event");

    const arrow = document.createElement("span");
    arrow.className = "event-card-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.append(linkLabel, arrow);
    content.append(link);
  }

  article.append(media, content);
  return article;
};

const renderEventGroup = (type) => {
  const events = dccEvents[type];
  const list = document.querySelector(`#${type}-event-list`);
  const emptyState = document.querySelector(`#${type}-empty-state`);

  if (!list || !emptyState || !Array.isArray(events) || events.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  events.forEach((event, index) => {
    fragment.append(createEventCard(event, index, type));
  });

  list.append(fragment);
  list.hidden = false;
  emptyState.hidden = true;
};

renderEventGroup("upcoming");
renderEventGroup("past");
