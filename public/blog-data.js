const dccBlogPosts = [
  {
    slug: "building-trust-into-everyday-digital-commerce",
    date: "July 18, 2026",
    category: "Consumer trust",
    title: "Building Trust into Everyday Digital Commerce",
    excerpt:
      "Trust is shaped by the small moments that help people understand, choose and resolve issues with confidence.",
    readingTime: "5 min read",
    author: "Digital Commerce Coalition",
    image: "./assets/blog/consumer-trust-simple.png",
    imageAlt:
      "A consumer making a digital purchase confidently from her home",
    intro:
      "Consumer trust is not created by a single feature or policy. It grows through a series of clear, dependable interactions that make digital commerce feel understandable and accountable.",
    paragraphs: [
      "From the first product description to the final support interaction, every step can either reduce uncertainty or add to it. Clear information, transparent choices and predictable processes help customers know what to expect before they act.",
      "Trust also depends on what happens when an experience does not go as planned. Easy-to-find support, timely updates and fair resolution pathways demonstrate that accountability continues after a transaction is complete.",
      "For the ecosystem, the opportunity is to treat trust as a shared design principle. When platforms, sellers, service providers and policymakers learn from one another, good practice can become easier to recognize and adopt.",
    ],
    takeaways: [
      "Make important information easy to find and understand",
      "Design support and resolution as part of the core experience",
      "Use shared learning to strengthen trust across the ecosystem",
    ],
  },
  {
    slug: "inclusive-digital-growth-for-small-businesses",
    date: "June 30, 2026",
    category: "Economic participation",
    title: "What Inclusive Digital Growth Looks Like for Small Businesses",
    excerpt:
      "Participation expands when digital tools are paired with practical capability, confidence and routes to sustainable growth.",
    readingTime: "6 min read",
    author: "Digital Commerce Coalition",
    image: "./assets/blog/inclusive-digital-growth.jpg",
    imageAlt:
      "A small-business owner preparing customer orders in her studio",
    intro:
      "Digital commerce can open new markets for small businesses, but access alone does not guarantee meaningful participation. Inclusive growth requires tools and systems that work with the realities of smaller enterprises.",
    paragraphs: [
      "Many entrepreneurs manage inventory, customer communication, marketing and fulfilment with limited time and resources. Practical onboarding, simple workflows and relevant guidance can reduce the effort required to begin and continue selling online.",
      "Capability building is most effective when it connects directly to business outcomes. Support that helps sellers present products clearly, manage orders, understand costs and build customer relationships can create value beyond a single transaction.",
      "A more inclusive ecosystem also listens to different business contexts. Regional variation, language, product category and business maturity all shape what useful support looks like.",
    ],
    takeaways: [
      "Pair access with practical and relevant capability building",
      "Design digital tools around real small-business workflows",
      "Create multiple pathways for businesses at different stages",
    ],
  },
  {
    slug: "rethinking-packaging-for-lower-impact-commerce",
    date: "May 22, 2026",
    category: "Responsible growth",
    title: "Rethinking Packaging for Lower-Impact Commerce",
    excerpt:
      "Better packaging decisions start with the product journey, not with a single material considered in isolation.",
    readingTime: "5 min read",
    author: "Digital Commerce Coalition",
    image: "./assets/blog/responsible-packaging.jpg",
    imageAlt:
      "A selection of recyclable and reusable packaging materials",
    intro:
      "Packaging protects products, communicates information and supports efficient movement through the value chain. Improving its environmental performance means balancing all three roles.",
    paragraphs: [
      "Material choice matters, but it is only one part of the picture. The amount of material used, the fit between packaging and product, the likelihood of damage and the options available after use all shape the overall outcome.",
      "Progress can begin with practical questions: Can unnecessary layers be removed? Can a standard format serve more products? Is disposal guidance clear? Can suppliers and fulfilment partners share data about what works?",
      "Because packaging decisions cross organisational boundaries, collaboration is essential. Shared testing, common language and transparent measurement can help promising approaches move from isolated trials to repeatable practice.",
    ],
    takeaways: [
      "Evaluate packaging across the complete product journey",
      "Reduce unnecessary material before changing material types",
      "Collaborate on testing, measurement and shared learning",
    ],
  },
  {
    slug: "why-cross-sector-collaboration-matters",
    date: "April 8, 2026",
    category: "Coalition perspectives",
    title: "Why Cross-Sector Collaboration Matters",
    excerpt:
      "Complex ecosystem challenges become more workable when different perspectives can shape the question together.",
    readingTime: "4 min read",
    author: "Digital Commerce Coalition",
    image: "./assets/blog/cross-sector-collaboration.jpg",
    imageAlt:
      "Professionals collaborating around a table covered with working notes",
    intro:
      "Digital commerce connects a wide range of organisations, professions and public interests. That interdependence makes collaboration a practical requirement rather than an optional extra.",
    paragraphs: [
      "The same issue can look very different from the perspective of a consumer, seller, platform, logistics provider or policymaker. Bringing those views together early can reveal assumptions and trade-offs that would otherwise remain hidden.",
      "Effective collaboration does not require every participant to hold the same view. It requires a clear shared question, credible evidence and a process that allows disagreement to produce better understanding.",
      "Coalitions can add value by creating continuity. Regular exchange makes it easier to build shared language, test ideas and carry learning from one conversation into the next.",
    ],
    takeaways: [
      "Bring different perspectives into problem definition early",
      "Use evidence and structured exchange to clarify trade-offs",
      "Build continuity so shared learning can accumulate over time",
    ],
  },
  {
    slug: "designing-better-customer-support-journeys",
    date: "March 14, 2026",
    category: "Consumer experience",
    title: "Designing Better Customer Support Journeys",
    excerpt:
      "Support works best when people can find the right help quickly and understand what will happen next.",
    readingTime: "5 min read",
    author: "Digital Commerce Coalition",
    image: "./assets/blog/customer-support.jpg",
    imageAlt:
      "A customer support professional assisting an online shopper",
    intro:
      "Customer support is often experienced at a moment of uncertainty. A well-designed journey can replace that uncertainty with clear choices, visible progress and a realistic path to resolution.",
    paragraphs: [
      "The first challenge is orientation. People need to know where to go, which information to provide and whether a self-service option or a person is better suited to the issue they face.",
      "The second challenge is continuity. Customers should not need to repeat the same context at every stage. Clear reference information, consistent updates and thoughtful hand-offs can make a complex process feel coherent.",
      "Finally, support data can become a source of product learning. Recurring questions and points of friction often reveal where clearer design or communication could prevent issues from arising in the first place.",
    ],
    takeaways: [
      "Help people identify the right support pathway quickly",
      "Preserve context across channels and hand-offs",
      "Use recurring support needs to improve the core experience",
    ],
  },
];

const createBlogCard = (post, index) => {
  const article = document.createElement("article");
  article.className = "blog-card";
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
  label.textContent = `Sample article · ${post.category}`;

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
