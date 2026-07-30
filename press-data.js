/*
 * Replace these sample entries with real media coverage when it is ready.
 * The neutral example.com URL preserves the external-link interaction without
 * publishing a real article or publication.
 */
const dccPressCoverage = [
  {
    publication: "Sample Publication 01",
    date: "Month 00, 2026",
    title:
      "Leading Digital Commerce Companies Announce New Collaborative Platform",
    url: "https://example.com/",
  },
  {
    publication: "Sample Publication 02",
    date: "Month 00, 2026",
    title:
      "New Coalition Sets Out Shared Priorities for Digital Commerce",
    url: "https://example.com/",
  },
  {
    publication: "Sample Publication 03",
    date: "Month 00, 2026",
    title:
      "Industry Platform to Focus on Trust, Participation and Responsible Growth",
    url: "https://example.com/",
  },
  {
    publication: "Sample Publication 04",
    date: "Month 00, 2026",
    title:
      "Digital Commerce Leaders Come Together to Support Small Businesses",
    url: "https://example.com/",
  },
  {
    publication: "Sample Publication 05",
    date: "Month 00, 2026",
    title: "Coalition Launches New Forum for Knowledge Exchange",
    url: "https://example.com/",
  },
  {
    publication: "Sample Publication 06",
    date: "Month 00, 2026",
    title:
      "New Industry Initiative Aims to Strengthen India’s Digital Commerce Ecosystem",
    url: "https://example.com/",
  },
];

const createPressCard = (coverage, index) => {
  const card = document.createElement("a");
  card.className = "press-card";
  card.href = coverage.url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.style.setProperty("--press-card-index", index);
  card.setAttribute(
    "aria-label",
    `Open sample article “${coverage.title}” (opens in a new tab)`,
  );

  const publication = document.createElement("p");
  publication.className = "press-publication";
  publication.textContent = coverage.publication;

  const title = document.createElement("h2");
  title.textContent = coverage.title;

  const footer = document.createElement("div");
  footer.className = "press-card-footer";

  const date = document.createElement("p");
  date.textContent = coverage.date;

  const action = document.createElement("span");
  action.className = "press-read-more";

  const actionLabel = document.createElement("span");
  actionLabel.className = "press-read-more-label";
  actionLabel.textContent = "Read more";

  const arrow = document.createElement("span");
  arrow.className = "press-read-more-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  action.append(actionLabel, arrow);

  footer.append(date, action);
  card.append(publication, title, footer);
  return card;
};

const renderPressCoverage = () => {
  const list = document.querySelector("#press-coverage-list");
  if (!list) return;

  const fragment = document.createDocumentFragment();
  dccPressCoverage.forEach((coverage, index) => {
    fragment.append(createPressCard(coverage, index));
  });
  list.append(fragment);
};

renderPressCoverage();
