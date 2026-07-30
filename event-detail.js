const allDccEvents = [
  ...dccEvents.upcoming.map((event) => ({ ...event, status: "Upcoming event" })),
  ...dccEvents.past.map((event) => ({ ...event, status: "Past event" })),
];

const eventParams = new URLSearchParams(window.location.search);
const requestedEventSlug = eventParams.get("event");
const selectedDccEvent =
  allDccEvents.find((event) => event.slug === requestedEventSlug) ||
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
  const eventDate = getEventDate(selectedDccEvent);

  document.title = `${selectedDccEvent.title} | Digital Commerce Coalition`;
  document
    .querySelector("#event-meta-description")
    ?.setAttribute("content", selectedDccEvent.summary);

  setText("#event-detail-status", selectedDccEvent.status);
  setText("#event-detail-title", selectedDccEvent.title);
  setText("#event-detail-summary", selectedDccEvent.summary);
  setText("#event-detail-date", eventDate);
  setText("#event-detail-location", selectedDccEvent.location);
  setText(
    "#event-detail-description",
    selectedDccEvent.description || selectedDccEvent.summary,
  );
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
