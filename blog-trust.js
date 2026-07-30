const trustArticle = dccBlogPosts.find(
  (post) => post.slug === "building-trust-into-everyday-digital-commerce",
);

const setTrustText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "";
};

if (trustArticle) {
  document.title = `${trustArticle.title} | Digital Commerce Coalition`;
  document
    .querySelector("#trust-meta-description")
    ?.setAttribute("content", trustArticle.excerpt);

  setTrustText("#trust-author", trustArticle.author);
  setTrustText("#trust-date", trustArticle.date);
  setTrustText("#trust-reading-time", trustArticle.readingTime);
  setTrustText("#trust-excerpt", trustArticle.excerpt);
  setTrustText("#trust-intro", trustArticle.intro);
  setTrustText("#trust-paragraph-one", trustArticle.paragraphs?.[0]);
  setTrustText("#trust-paragraph-two", trustArticle.paragraphs?.[1]);
  setTrustText("#trust-paragraph-three", trustArticle.paragraphs?.[2]);

  const image = document.querySelector("#trust-image");
  if (image) {
    image.src = trustArticle.image;
    image.alt = trustArticle.imageAlt || "";
  }

  const takeawayList = document.querySelector("#trust-takeaway-list");
  trustArticle.takeaways?.forEach((takeaway, index) => {
    const item = document.createElement("li");
    item.style.setProperty("--takeaway-index", index);

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");

    const text = document.createElement("p");
    text.textContent = takeaway;

    item.append(number, text);
    takeawayList?.append(item);
  });
}
