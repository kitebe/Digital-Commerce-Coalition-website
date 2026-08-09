/*
 * Replace these sample entries with real media coverage when it is ready.
 * The neutral example.com URL preserves the external-link interaction without
 * publishing a real article or publication.
 */
const dccPressCoverage = [];

const createPressCard = (coverage, index) => {
  const card = document.createElement("a");
  card.className = "press-card";
  card.href = `/press/${encodeURIComponent(coverage.slug)}`;
  card.style.setProperty("--press-card-index", index);
  card.setAttribute(
    "aria-label",
    `Read ${coverage.title}`,
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
  arrow.textContent = "→";
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
