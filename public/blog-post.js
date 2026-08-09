const blogParams = new URLSearchParams(window.location.search);
const requestedPostSlug = blogParams.get("post");
const selectedBlogPost =
  dccBlogPosts.find((post) => post.slug === requestedPostSlug || post.previousSlugs?.includes(requestedPostSlug)) ||
  dccBlogPosts[0];

const asBlogText = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

const escapeBlogHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const legacyRichTextToHtml = (value) => {
  if (!value || typeof value !== "object" || !Array.isArray(value.content)) {
    return "";
  }

  return value.content
    .map((node) => {
      const text = Array.isArray(node?.content)
        ? node.content.map((child) => child?.text || "").join("")
        : "";
      if (!text.trim()) return "";
      if (node.type === "heading") {
        const level = node.attrs?.level === 3 ? 3 : 2;
        return `<h${level}>${escapeBlogHtml(text)}</h${level}>`;
      }
      return `<p>${escapeBlogHtml(text)}</p>`;
    })
    .join("");
};

const setBlogText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = asBlogText(value);
};

if (selectedBlogPost) {
  if (requestedPostSlug && requestedPostSlug !== selectedBlogPost.slug) {
    const canonical = new URL(window.location.href);
    canonical.searchParams.set("post", selectedBlogPost.slug);
    window.history.replaceState({}, "", canonical);
  }
  document.title = `${selectedBlogPost.title} | Digital Commerce Coalition`;
  document
    .querySelector("#blog-meta-description")
    ?.setAttribute("content", selectedBlogPost.excerpt);

  setBlogText(
    "#blog-post-category",
    selectedBlogPost.category || "Article",
  );
  setBlogText("#blog-post-title", selectedBlogPost.title);
  setBlogText("#blog-post-excerpt", selectedBlogPost.excerpt);
  setBlogText("#blog-post-author", selectedBlogPost.author ? `By ${selectedBlogPost.author}` : "");
  setBlogText("#blog-post-date", selectedBlogPost.date);
  const hasLegacyBody =
    selectedBlogPost.body && typeof selectedBlogPost.body === "object";
  setBlogText(
    "#blog-post-reading-time",
    hasLegacyBody ? "4 min read" : selectedBlogPost.readingTime,
  );
  const image = document.querySelector("#blog-post-image");
  if (image) {
    image.src = selectedBlogPost.image;
    image.alt = selectedBlogPost.imageAlt || selectedBlogPost.title || "";
  }

  const paragraphContainer = document.querySelector("#blog-post-paragraphs");
  const providedBody = asBlogText(selectedBlogPost.bodyHtml);
  const hasUsableBody = providedBody && providedBody !== "[object Object]";
  const legacyBody = legacyRichTextToHtml(selectedBlogPost.body);
  if (paragraphContainer) {
    paragraphContainer.innerHTML = hasUsableBody ? providedBody : legacyBody;
  }

  const toc = document.querySelector("#blog-post-toc");
  const headings = paragraphContainer?.querySelectorAll("h2, h3") || [];
  headings.forEach((heading, index) => {
    heading.id = heading.id || `article-section-${index + 1}`;
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent || `Section ${index + 1}`;
    toc?.append(link);
  });

  // Render related posts in grid
  const relatedGrid = document.querySelector("#blog-related-grid");
  if (relatedGrid && typeof createBlogCard === "function") {
    relatedGrid.innerHTML = "";
    const otherPosts = dccBlogPosts.filter((p) => p.slug !== selectedBlogPost.slug).slice(0, 3);
    otherPosts.forEach((post, index) => {
      relatedGrid.append(createBlogCard(post, index));
    });
  }

  const linkedInShare = document.querySelector("#blog-linkedin-share");
  if (linkedInShare) {
    linkedInShare.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`;
  }

  const copyButton = document.querySelector("#blog-copy-link");
  copyButton?.addEventListener("click", async () => {
    const status = document.querySelector("#blog-copy-status");
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyButton.textContent = "Copied";
      if (status) status.textContent = "Link copied.";
    } catch {
      if (status) status.textContent = "Copy the address from your browser.";
    }
  });
}

// Reading progress bar calculation
window.addEventListener("scroll", () => {
  const progressBar = document.querySelector("#blog-reading-progress-bar");
  if (!progressBar) return;
  const totalHeight = document.body.scrollHeight - window.innerHeight;
  const progress = totalHeight > 0 ? window.scrollY / totalHeight : 0;
  progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
});
