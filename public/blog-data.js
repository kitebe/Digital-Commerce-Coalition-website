const dccBlogPosts = [];

const createBlogCard = (post, index) => {
  const article = document.createElement("a");
  article.className = "blog-card";
  article.href = `/blog/${encodeURIComponent(post.slug)}`;
  article.style.setProperty("--blog-card-index", index);

  const imageWrap = document.createElement("div");
  imageWrap.className = "blog-card-image";

  const image = document.createElement("img");
  image.src = post.image;
  image.alt = post.imageAlt || "";
  image.loading = index === 0 ? "eager" : "lazy";
  imageWrap.append(image);

  const content = document.createElement("div");
  content.className = "blog-card-content";

  const label = document.createElement("p");
  label.className = "blog-card-label";
  label.textContent = post.category || "Coalition perspective";

  const title = document.createElement("h2");
  title.textContent = post.title;

  const excerpt = document.createElement("p");
  excerpt.className = "blog-card-excerpt";
  excerpt.textContent = post.excerpt;

  const footer = document.createElement("div");
  footer.className = "blog-card-footer";

  const date = document.createElement("p");
  date.textContent = `${post.date} · ${post.readingTime}`;

  footer.append(date);
  content.append(label, title, excerpt, footer);
  article.append(imageWrap, content);

  return article;
};

const renderBlogPosts = () => {
  const list = document.querySelector("#blog-post-list");
  if (!list) return;

  const fragment = document.createDocumentFragment();
  dccBlogPosts.forEach((post, index) => {
    fragment.append(createBlogCard(post, index));
  });
  list.append(fragment);
};

renderBlogPosts();
