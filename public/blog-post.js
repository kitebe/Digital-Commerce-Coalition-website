const blogParams = new URLSearchParams(window.location.search);
const requestedPostSlug = blogParams.get("post");
const selectedBlogPost =
  dccBlogPosts.find((post) => post.slug === requestedPostSlug || post.previousSlugs?.includes(requestedPostSlug)) ||
  dccBlogPosts[0];

const sampleArticleBodies = {
  "building-trust-into-everyday-digital-commerce": `
    <h2>Trust is built in ordinary moments</h2>
    <p>People rarely experience digital commerce as a single transaction. They experience a sequence of moments: finding a product, comparing options, understanding a price, choosing a payment method, following a delivery and asking for help when something changes. Each moment either makes the journey clearer or adds another layer of uncertainty.</p>
    <p>That is why consumer trust cannot sit at the edge of a product or be treated only as a compliance exercise. It has to shape the experience from the beginning. Clear language, visible policies and predictable actions help people make informed choices without having to decode how a platform works.</p>

    <h2>Clarity should come before commitment</h2>
    <p>A trustworthy journey gives customers the information they need before they act. The total cost should be understandable. Delivery expectations should be realistic. Product information should help people compare options, and important conditions should not be buried behind unfamiliar language.</p>
    <p>Good design reduces the distance between a question and its answer. It anticipates what a customer is likely to wonder and presents the response at the point where it becomes useful. This is especially important for people who are newer to digital services or navigating them in a second language.</p>

    <h2>Resolution is part of the product</h2>
    <p>Even a well-designed system will sometimes fail. An order may arrive late, a payment may not be confirmed or a product may not match expectations. These moments are not exceptions to the customer experience; they are among its most important tests.</p>
    <p>Support should therefore be designed with the same care as discovery and checkout. Customers need to know where to go, what information to provide and when they can expect a response. Regular updates matter too. Silence creates uncertainty, while a simple acknowledgement can show that an issue is being handled.</p>

    <h2>Trust grows when the ecosystem learns together</h2>
    <p>No single organisation controls every part of a digital commerce journey. Platforms, sellers, logistics providers, payment services and public institutions all influence how safe and dependable that journey feels. Shared learning can help good practices travel across those boundaries.</p>
    <p>The opportunity is not to make every service identical. It is to build a common expectation that digital commerce should be understandable, accountable and responsive. When those qualities become part of everyday design, trust stops being a promise and becomes something people can recognise through experience.</p>
  `,
  "inclusive-digital-growth-for-small-businesses": `
    <h2>Access is only the starting point</h2>
    <p>Digital commerce can help a small business reach customers well beyond its immediate neighbourhood. But opening an account or listing a product does not automatically create meaningful participation. Sustainable growth begins when the tools, information and support around a business reflect how that business actually operates.</p>
    <p>For many entrepreneurs, the working day already includes sourcing, production, inventory, customer messages, packaging and fulfilment. A digital system that adds complexity without removing friction can quickly become another task to manage. Inclusion therefore depends on usefulness, not access alone.</p>

    <h2>Design around the day a business actually has</h2>
    <p>Small businesses benefit from workflows that are direct, forgiving and easy to return to. Onboarding should explain why information is needed. Product tools should make it simple to improve a listing over time. Order and inventory views should surface the decisions that need attention rather than asking a seller to interpret a wall of data.</p>
    <p>Mobile-first design is part of this, but it is not the whole answer. Language, connectivity, product category and business maturity all shape what an accessible experience looks like. The best tools leave room for those differences instead of assuming that every seller follows the same path.</p>

    <h2>Capability should lead to confidence</h2>
    <p>Training is most valuable when it connects directly to a real business outcome. Guidance on photographing a product, understanding costs, responding to reviews or planning fulfilment can help an entrepreneur apply a new skill immediately. Small successes then build the confidence to try the next step.</p>
    <p>Support also works better when it is available at the moment of need. Short explanations inside a workflow, examples from similar businesses and access to a person when a problem becomes complex can be more useful than a one-time information session.</p>

    <h2>Growth needs more than one pathway</h2>
    <p>Businesses enter digital commerce with different ambitions. One may want a dependable channel for a small catalogue; another may be preparing to sell across several regions. An inclusive ecosystem allows both to progress without treating scale as the only measure of success.</p>
    <p>That means creating multiple routes to visibility, capability and finance while keeping expectations transparent. When digital systems respond to businesses at different stages, participation becomes more durable—and growth becomes something a wider range of entrepreneurs can shape on their own terms.</p>
  `,
};

const fallbackArticleBody = `
  <h2>Building digital commerce around people</h2>
  <p>Digital commerce works best when technology makes everyday decisions simpler. Clear information, dependable processes and responsive support help customers and businesses participate with confidence.</p>
  <p>The most useful improvements often begin with a close look at the complete journey. Where do people pause? Which choices are difficult to compare? What happens when an order or payment does not go to plan? These moments reveal where better design and stronger collaboration can make a practical difference.</p>
  <h2>From individual improvements to shared progress</h2>
  <p>No single organisation shapes the ecosystem alone. Platforms, businesses, service providers and public institutions each see a different part of the experience. Bringing those perspectives together makes it easier to identify common problems, test workable approaches and share what succeeds.</p>
  <p>Progress is strongest when it is useful in daily practice: information people can understand, tools that reflect real workflows and clear routes to support. Those foundations help digital commerce grow in ways that strengthen trust, participation and long-term responsibility.</p>
`;

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
  setBlogText("#blog-post-intro", selectedBlogPost.intro);

  const image = document.querySelector("#blog-post-image");
  if (image) {
    image.src = selectedBlogPost.image;
    image.alt = selectedBlogPost.imageAlt || selectedBlogPost.title || "";
  }

  const paragraphContainer = document.querySelector("#blog-post-paragraphs");
  const providedBody = asBlogText(selectedBlogPost.bodyHtml);
  const hasUsableBody = providedBody && providedBody !== "[object Object]";
  const sampleBody = sampleArticleBodies[selectedBlogPost.slug];
  const legacyBody = legacyRichTextToHtml(selectedBlogPost.body);
  if (paragraphContainer) {
    paragraphContainer.innerHTML = hasUsableBody
      ? providedBody
      : sampleBody || legacyBody || fallbackArticleBody;
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
