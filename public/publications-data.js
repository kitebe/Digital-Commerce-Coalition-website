const dccPublications = [];

const createPublicationCover = (publication, compact = false) => {
  const cover = document.createElement("div");
  cover.className = `publication-cover publication-cover-${publication.accent}${compact ? " is-compact" : ""}`;

  const image = document.createElement("img");
  image.src = publication.coverImage;
  image.alt = "";

  const veil = document.createElement("span");
  veil.className = "publication-cover-veil";
  veil.setAttribute("aria-hidden", "true");

  const logo = document.createElement("img");
  logo.className = "publication-cover-logo";
  logo.src = "./assets/Dcc_logo.svg";
  logo.alt = "";

  const label = document.createElement("span");
  label.className = "publication-cover-label";
  label.textContent = publication.type;

  const title = document.createElement("strong");
  title.textContent = publication.title;

  const date = document.createElement("span");
  date.className = "publication-cover-date";
  date.textContent = publication.date;

  cover.append(image, veil, logo, label, title, date);
  return cover;
};

const createPublicationCard = (publication) => {
  const article = document.createElement("article");
  article.className = "publication-card is-static";

  const media = document.createElement("div");
  media.className = "publication-card-media";
  media.append(createPublicationCover(publication, true));

  const body = document.createElement("div");
  body.className = "publication-card-body";

  const meta = document.createElement("p");
  meta.className = "publication-meta";
  meta.textContent = `${publication.type} · ${publication.date}`;

  const title = document.createElement("h2");
  title.textContent = publication.title;

  const description = document.createElement("p");
  description.className = "publication-card-description";
  description.textContent = publication.description;

  const actions = document.createElement("div");
  actions.className = "publication-card-actions report-card-actions";

  const download = document.createElement("button");
  download.type = "button";
  download.className = "report-download-link";
  download.disabled = true;
  download.setAttribute(
    "aria-label",
    `${publication.title} PDF is not available yet`,
  );
  download.innerHTML =
    '<span>Download PDF</span><span class="report-download-icon" aria-hidden="true">↓</span>';

  actions.append(download);
  body.append(meta, title, description, actions);
  article.append(media, body);
  return article;
};

const renderPublicationLibrary = () => {
  const list = document.querySelector("#publication-list");
  if (!list) return;

  const fragment = document.createDocumentFragment();
  dccPublications.forEach((publication) => {
    fragment.append(createPublicationCard(publication));
  });
  list.replaceChildren(fragment);
};

const renderPublicationDetail = () => {
  const detail = document.querySelector("#publication-detail");
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const requestedSlug = params.get("slug");
  const publication = dccPublications.find(
    (item) => (item.slug === requestedSlug || item.previousSlugs?.includes(requestedSlug)) && item.pdf,
  );
  if (!publication) {
    window.location.replace("./publications.html");
    return;
  }

  if (requestedSlug && requestedSlug !== publication.slug) {
    const canonical = new URL(window.location.href);
    canonical.searchParams.set("slug", publication.slug);
    window.history.replaceState({}, "", canonical);
  }

  document.title = `${publication.title} | Digital Commerce Coalition`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", publication.description);

  const back = document.querySelector("#publication-back-link");
  if (back) back.href = "./publications.html";

  const type = document.querySelector("#publication-detail-type");
  const title = document.querySelector("#publication-detail-title");
  const description = document.querySelector("#publication-detail-description");
  const date = document.querySelector("#publication-detail-date");
  const pages = document.querySelector("#publication-detail-pages");
  const themes = document.querySelector("#publication-detail-themes");
  const body = document.querySelector("#publication-detail-body");
  const bodyFallback = document.querySelector("#publication-detail-body-fallback");
  const cover = document.querySelector("#publication-detail-cover");
  const download = document.querySelector("#publication-detail-download");

  if (type) type.textContent = publication.type;
  if (title) title.textContent = publication.title;
  if (description) description.textContent = publication.description;
  if (body && publication.bodyHtml && publication.bodyHtml !== "<p></p>") {
    body.innerHTML = publication.bodyHtml;
    if (bodyFallback) bodyFallback.hidden = true;
  }
  if (date) date.textContent = publication.date;
  if (pages) pages.textContent = publication.pages;
  if (themes) {
    themes.replaceChildren(
      ...publication.themes.map((theme) => {
        const item = document.createElement("li");
        item.textContent = theme;
        return item;
      }),
    );
  }
  if (cover) cover.replaceChildren(createPublicationCover(publication));
  if (download) {
    download.href = publication.pdf;
    download.download = "";
    download.setAttribute("aria-label", `Download ${publication.title} PDF`);
  }

  const related = document.querySelector("#related-publications");
  if (related) {
    related.replaceChildren(
      ...dccPublications
        .filter((item) => item.pdf && item.slug !== publication.slug)
        .slice(0, 2)
        .map(createPublicationCard),
    );
  }
};

renderPublicationLibrary();
renderPublicationDetail();
