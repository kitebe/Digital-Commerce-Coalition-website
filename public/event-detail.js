const allDccEvents = [
  ...dccEvents.upcoming.map((event) => ({ ...event, status: "Upcoming event" })),
  ...dccEvents.past.map((event) => ({ ...event, status: "Past event" })),
];

const eventParams = new URLSearchParams(window.location.search);
const eventPathParts = window.location.pathname.split("/").filter(Boolean);
const requestedEventSlug = eventParams.get("event") ||
  (eventPathParts[0] === "events" && eventPathParts[1] ? decodeURIComponent(eventPathParts[1]) : null);
const selectedDccEvent =
  allDccEvents.find((event) => event.slug === requestedEventSlug || event.previousSlugs?.includes(requestedEventSlug)) ||
  allDccEvents[0];

const getEventDate = (event) =>
  event.dateLabel ||
  [event.month, event.day ? `${event.day},` : "", event.year]
    .filter(Boolean)
    .join(" ");

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "";
};

if (selectedDccEvent) {
  if (requestedEventSlug && requestedEventSlug !== selectedDccEvent.slug) {
    const canonical = new URL(window.location.href);
    canonical.pathname = `/events/${encodeURIComponent(selectedDccEvent.slug)}`;
    canonical.searchParams.delete("event");
    canonical.searchParams.delete("slug");
    window.history.replaceState({}, "", canonical);
  }
  const eventDate = getEventDate(selectedDccEvent);

  document.title = `${selectedDccEvent.title} | Digital Commerce Coalition`;
  document
    .querySelector("#event-meta-description")
    ?.setAttribute("content", selectedDccEvent.summary);

  setText("#event-detail-status", selectedDccEvent.status);
  setText("#event-detail-title", selectedDccEvent.title);
  setText("#event-detail-summary", selectedDccEvent.summary);
  setText("#event-detail-about-eyebrow", selectedDccEvent.aboutEyebrow || "About the event");
  setText("#event-detail-about-heading", selectedDccEvent.aboutHeading || "Bringing shared priorities into focus.");
  setText("#event-detail-topics-heading", selectedDccEvent.topicsHeading || "What the conversation explores");
  setText("#event-detail-date", eventDate);
  setText("#event-detail-location", selectedDccEvent.location);
  const description = document.querySelector("#event-detail-description");
  if (description) description.innerHTML = selectedDccEvent.bodyHtml || "";
  setText("#event-fact-date", eventDate);
  setText("#event-fact-location", selectedDccEvent.location);
  setText("#event-fact-format", selectedDccEvent.format);

  const image = document.querySelector("#event-detail-image");
  if (image) {
    image.src = selectedDccEvent.image;
    image.alt = selectedDccEvent.imageAlt || "";
  }

  const topicList = document.querySelector("#event-detail-topics");
  selectedDccEvent.topics?.forEach((topic) => {
    const item = document.createElement("li");
    item.textContent = topic;
    topicList?.append(item);
  });
}
