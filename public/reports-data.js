const dccReports = [];

const createReportCard = (report) => {
  const article = document.createElement("article");
  article.className = "publication-card report-card";

  const media = document.createElement("div");
  media.className = "publication-card-media";

  const image = document.createElement("img");
  image.className = "report-card-image";
  image.src = report.coverImage;
  image.alt = "";
  media.append(image);

  const body = document.createElement("div");
  body.className = "publication-card-body";

  const meta = document.createElement("p");
  meta.className = "publication-meta";
  meta.textContent = `${report.type} · ${report.date}`;

  const title = document.createElement("h2");
  title.textContent = report.title;

  const description = document.createElement("p");
  description.className = "publication-card-description";
  description.innerHTML = report.description;

  const actions = document.createElement("div");
  actions.className = "publication-card-actions report-card-actions";

  const download = document.createElement("a");
  download.className = "report-download-link";
  download.href = `/reports/${encodeURIComponent(report.slug)}`;
  download.setAttribute("aria-label", `View ${report.title}`);
  download.innerHTML =
    '<span>View report</span><span class="report-download-icon" aria-hidden="true">→</span>';

  actions.append(download);
  body.append(meta, title, description, actions);
  article.append(media, body);
  return article;
};

const renderReports = () => {
  const list = document.querySelector("#report-list");
  if (!list) return;

  const fragment = document.createDocumentFragment();
  dccReports.forEach((report) => fragment.append(createReportCard(report)));
  list.replaceChildren(fragment);
};

renderReports();
