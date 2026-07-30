const blogParams = new URLSearchParams(window.location.search);
const requestedPostSlug = blogParams.get("post");
const selectedBlogPost =
  dccBlogPosts.find((post) => post.slug === requestedPostSlug) ||
  dccBlogPosts[0];

const setBlogText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "";
};

if (selectedBlogPost) {
  document.title = `${selectedBlogPost.title} | Digital Commerce Coalition`;
  document
    .querySelector("#blog-meta-description")
    ?.setAttribute("content", selectedBlogPost.excerpt);

  setBlogText(
    "#blog-post-category",
    `Sample article · ${selectedBlogPost.category}`,
  );
  setBlogText("#blog-post-title", selectedBlogPost.title);
  setBlogText("#blog-post-excerpt", selectedBlogPost.excerpt);
  setBlogText("#blog-post-author", selectedBlogPost.author);
  setBlogText("#blog-post-date", selectedBlogPost.date);
  setBlogText("#blog-post-reading-time", selectedBlogPost.readingTime);
  setBlogText("#blog-post-intro", selectedBlogPost.intro);

  const image = document.querySelector("#blog-post-image");
  if (image) {
    image.src = selectedBlogPost.image;
    image.alt = selectedBlogPost.imageAlt || "";
  }

  const paragraphContainer = document.querySelector("#blog-post-paragraphs");
  selectedBlogPost.paragraphs?.forEach((paragraph) => {
    const element = document.createElement("p");
    element.textContent = paragraph;
    paragraphContainer?.append(element);
  });

  const takeawayList = document.querySelector("#blog-post-takeaways");
  selectedBlogPost.takeaways?.forEach((takeaway) => {
    const item = document.createElement("li");
    item.textContent = takeaway;
    takeawayList?.append(item);
  });
}
