const contentPathParts = window.location.pathname.split("/").filter(Boolean);
const contentSection = contentPathParts[0] || "";
const contentParams = new URLSearchParams(window.location.search);
const requestedContentSlug = contentPathParts[1]
  ? decodeURIComponent(contentPathParts[1])
  : contentParams.get("slug") || contentParams.get("report") || contentParams.get("press") || contentParams.get("release");
const selectedContentItem = dccContentItems.find(
  (item) => item.slug === requestedContentSlug || item.previousSlugs?.includes(requestedContentSlug),
);

const setContentText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "";
};

if (!selectedContentItem) {
  window.location.replace(contentSection === "press" ? "/press" : "/reports");
} else {
  const isPress = selectedContentItem.contentKind === "press";
  const canonicalSection = isPress ? "press" : "reports";
  if (requestedContentSlug !== selectedContentItem.slug) {
    const canonical = new URL(window.location.href);
    canonical.pathname = `/${canonicalSection}/${encodeURIComponent(selectedContentItem.slug)}`;
    canonical.searchParams.delete("slug");
    canonical.searchParams.delete("report");
    canonical.searchParams.delete("press");
    canonical.searchParams.delete("release");
    window.history.replaceState({}, "", canonical);
  }

  document.title = `${selectedContentItem.title} | Digital Commerce Coalition`;
  setContentText("#content-detail-type", isPress ? "Press coverage" : selectedContentItem.type || "Coalition report");
  setContentText("#content-detail-title", selectedContentItem.title);
  setContentText("#content-detail-date", selectedContentItem.date);
  setContentText("#content-detail-source", isPress ? selectedContentItem.publication : "Digital Commerce Coalition");
  setContentText("#content-detail-back-label", isPress ? "All press" : "All reports");
  setContentText("#content-detail-about-title", isPress ? "Coverage details" : "About this report");

  const back = document.querySelector("#content-detail-back");
  if (back) back.href = isPress ? "/press" : "/reports";

  const description = document.querySelector("#content-detail-description");
  const body = document.querySelector("#content-detail-body");
  const itemDescription = selectedContentItem.description ||
    (isPress ? `${selectedContentItem.publication} featured the Digital Commerce Coalition in this article.` : "");
  if (description) description.innerHTML = itemDescription;
  if (body) body.innerHTML = itemDescription;

  const media = document.querySelector("#content-detail-media");
  const image = document.querySelector("#content-detail-image");
  if (selectedContentItem.coverImage && image) {
    image.src = selectedContentItem.coverImage;
    image.alt = selectedContentItem.title || "";
  } else {
    media?.setAttribute("hidden", "");
    document.querySelector("#content-detail")?.classList.add("has-no-media");
  }

  const action = document.querySelector("#content-detail-action");
  const actionLabel = document.querySelector("#content-detail-action-label");
  const actionUrl = isPress ? selectedContentItem.url : selectedContentItem.pdf;
  if (action && actionUrl) {
    action.href = actionUrl;
    if (isPress) {
      action.target = "_blank";
      action.rel = "noopener noreferrer";
      if (actionLabel) actionLabel.textContent = "Read original coverage";
    } else {
      action.download = "";
      if (actionLabel) actionLabel.textContent = "Download report";
    }
  } else {
    action?.setAttribute("hidden", "");
  }
}
