const dccReports = [
  {
    type: "Ecosystem report",
    date: "July 2026",
    title: "Consumer Trust Priorities Report",
    description:
      "Priority areas for clearer information, dependable support and stronger consumer confidence in digital commerce.",
    coverImage: "./assets/blog/consumer-trust.jpg",
    pdf: null,
  },
  {
    type: "Progress report",
    date: "June 2026",
    title: "Inclusive Digital Commerce Progress Report",
    description:
      "A review of practical pathways that can broaden participation for entrepreneurs, sellers and small businesses.",
    coverImage: "./assets/blog/inclusive-digital-growth.jpg",
    pdf: null,
  },
  {
    type: "Practice review",
    date: "May 2026",
    title: "Responsible Packaging Practice Review",
    description:
      "Shared considerations for reducing avoidable packaging impact across the digital commerce value chain.",
    coverImage: "./assets/blog/responsible-packaging.jpg",
    pdf: null,
  },
  {
    type: "Experience report",
    date: "April 2026",
    title: "Customer Support Experience Report",
    description:
      "Principles for making support journeys more accessible, transparent and focused on useful outcomes.",
    coverImage: "./assets/blog/customer-support.jpg",
    pdf: null,
  },
  {
    type: "Landscape report",
    date: "March 2026",
    title: "Collaboration Across the Ecosystem",
    description:
      "How knowledge exchange and coordinated action can help address shared digital commerce priorities.",
    coverImage: "./assets/blog/cross-sector-collaboration.jpg",
    pdf: null,
  },
  {
    type: "Annual report",
    date: "February 2026",
    title: "Digital Commerce Coalition Annual Report 2025",
    description:
      "An overview of the Coalition’s focus areas, collaborative approach and agenda for the year ahead.",
    coverImage: "./assets/events/community-exchange.jpg",
    pdf: null,
  },
];

const createReportCard = (report) => {
  const article = document.createElement("article");
  article.className = "publication-card report-card";
  article.classList.toggle("is-static", !report.pdf);

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

  const download = document.createElement(report.pdf ? "a" : "button");
  download.className = "report-download-link";
  if (report.pdf) {
    download.href = report.pdf;
    download.download = "";
    download.setAttribute("aria-label", `Download ${report.title} PDF`);
  } else {
    download.type = "button";
    download.disabled = true;
    download.setAttribute(
      "aria-label",
      `${report.title} PDF is not available yet`,
    );
  }
  download.innerHTML =
    '<span>Download PDF</span><span class="report-download-icon" aria-hidden="true">↓</span>';

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
