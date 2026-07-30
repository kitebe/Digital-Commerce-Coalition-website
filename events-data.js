/*
 * Add event entries to the relevant list below. Empty lists automatically show
 * the designed "more soon" states on the Events page.
 *
 * Example:
 * {
 *   slug: "event-name",
 *   day: "18",
 *   month: "September",
 *   year: "2026",
 *   format: "Roundtable",
 *   title: "Event title",
 *   summary: "A short description of the event.",
 *   location: "New Delhi",
 *   image: "./assets/events/event-name.jpg",
 *   imageAlt: "Participants at the event",
 *   href: "./event.html?event=event-name",
 *   description: "A longer description for the internal event page.",
 *   topics: ["Topic one", "Topic two", "Topic three"],
 *   linkLabel: "Read more"
 * }
 */
const dccEvents = {
  upcoming: [
    {
      slug: "future-of-trusted-digital-commerce",
      day: "18",
      month: "September",
      year: "2026",
      format: "Sample roundtable",
      title: "The Future of Trusted Digital Commerce",
      summary:
        "A cross-sector conversation on transparency, consumer confidence and responsible innovation.",
      location: "New Delhi",
      image: "./assets/events/trusted-commerce-roundtable.jpg",
      imageAlt:
        "Digital commerce leaders participating in a professional roundtable",
      href: "./event.html?event=future-of-trusted-digital-commerce",
      description:
        "This sample roundtable brings together leaders from across the digital commerce ecosystem to examine how responsible innovation can strengthen trust. The conversation will focus on practical approaches to transparency, consumer understanding and accountable growth.",
      topics: [
        "Clear and transparent consumer experiences",
        "Responsible approaches to emerging technology",
        "Shared principles for ecosystem-wide trust",
      ],
      linkLabel: "Read more",
    },
    {
      slug: "inclusive-growth-for-digital-sellers",
      day: "14",
      month: "November",
      year: "2026",
      format: "Sample workshop",
      title: "Inclusive Growth for Digital Sellers",
      summary:
        "A practical workshop exploring tools and approaches that can help small businesses participate in digital commerce.",
      location: "Bengaluru",
      image: "./assets/events/inclusive-seller-workshop.jpg",
      imageAlt:
        "Entrepreneurs participating in a digital commerce learning workshop",
      href: "./event.html?event=inclusive-growth-for-digital-sellers",
      description:
        "This sample workshop is designed around the everyday opportunities and challenges faced by small businesses entering digital commerce. Participants will exchange practical ideas for capability building, market access and sustainable business growth.",
      topics: [
        "Digital readiness for small businesses",
        "Practical tools for reaching new customers",
        "Inclusive pathways to sustainable growth",
      ],
      linkLabel: "Read more",
    },
  ],
  past: [
    {
      slug: "building-consumer-confidence-online",
      day: "22",
      month: "May",
      year: "2026",
      format: "Sample dialogue",
      title: "Building Consumer Confidence Online",
      summary:
        "A moderated conversation on safety, transparency and better digital experiences for consumers.",
      location: "Mumbai",
      image: "./assets/events/consumer-trust-dialogue.jpg",
      imageAlt:
        "Panelists discussing consumer trust and online safety on stage",
      href: "./event.html?event=building-consumer-confidence-online",
      description:
        "This sample dialogue convened practitioners and experts to discuss the foundations of a safer, more transparent digital marketplace. The exchange considered how clear information, dependable safeguards and responsive support can improve consumer confidence.",
      topics: [
        "Safety and transparency by design",
        "Accessible consumer support",
        "Building confidence through collaboration",
      ],
      linkLabel: "Read more",
    },
    {
      slug: "responsible-growth-across-the-value-chain",
      day: "12",
      month: "March",
      year: "2026",
      format: "Sample forum",
      title: "Responsible Growth Across the Value Chain",
      summary:
        "Ecosystem leaders exchanged practical ideas for more sustainable packaging, logistics and operations.",
      location: "New Delhi",
      image: "./assets/events/responsible-growth-forum.jpg",
      imageAlt:
        "Professionals discussing sustainable packaging during a working session",
      href: "./event.html?event=responsible-growth-across-the-value-chain",
      description:
        "This sample forum explored how environmental responsibility can be integrated across the digital commerce value chain. Participants discussed practical improvements spanning packaging choices, delivery operations and collaboration with suppliers.",
      topics: [
        "Lower-impact packaging approaches",
        "More efficient logistics and operations",
        "Shared measurement and learning",
      ],
      linkLabel: "Read more",
    },
    {
      slug: "digital-commerce-community-exchange",
      day: "5",
      month: "December",
      year: "2025",
      format: "Sample networking evening",
      title: "Digital Commerce Community Exchange",
      summary:
        "An informal evening for members and partners to exchange perspectives and build new connections.",
      location: "Mumbai",
      image: "./assets/events/community-exchange.jpg",
      imageAlt:
        "Digital commerce professionals talking at an evening networking reception",
      href: "./event.html?event=digital-commerce-community-exchange",
      description:
        "This sample community exchange created space for members and partners to meet informally, share recent learning and identify opportunities for collaboration. The evening connected perspectives from across the wider digital commerce ecosystem.",
      topics: [
        "Member and partner connections",
        "Cross-sector knowledge exchange",
        "New opportunities for collaboration",
      ],
      linkLabel: "Read more",
    },
  ],
};

const createEventCard = (event, index, type) => {
  const article = document.createElement("article");
  article.className = "event-card";
  article.style.setProperty("--event-card-index", index);

  const media = document.createElement("div");
  media.className = "event-card-media";

  if (event.image) {
    const image = document.createElement("img");
    image.src = event.image;
    image.alt = event.imageAlt || "";
    image.loading = "lazy";
    media.append(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "event-card-image-placeholder";
    placeholder.setAttribute("aria-hidden", "true");

    const placeholderLabel = document.createElement("span");
    placeholderLabel.textContent = "DCC";
    placeholder.append(placeholderLabel);
    media.append(placeholder);
  }

  const content = document.createElement("div");
  content.className = "event-card-content";

  const date = document.createElement("p");
  date.className = "event-card-date";
  date.textContent =
    event.dateLabel ||
    [event.month, event.day ? `${event.day},` : "", event.year]
      .filter(Boolean)
      .join(" ");

  const meta = document.createElement("p");
  meta.className = "event-card-meta";
  meta.textContent = [event.format, event.location].filter(Boolean).join(" · ");

  const title = document.createElement("h3");
  title.textContent = event.title || "Coalition event";

  const summary = document.createElement("p");
  summary.className = "event-card-summary";
  summary.textContent = event.summary || "";

  content.append(date);
  if (meta.textContent) content.append(meta);
  content.append(title);
  if (event.summary) content.append(summary);

  if (event.href) {
    const link = document.createElement("a");
    link.className = "event-card-link";
    link.href = event.href;

    const linkLabel = document.createElement("span");
    linkLabel.className = "event-card-link-label";
    linkLabel.textContent =
      event.linkLabel || (type === "past" ? "Read more" : "View event");

    const arrow = document.createElement("span");
    arrow.className = "event-card-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.append(linkLabel, arrow);
    content.append(link);
  }

  article.append(media, content);
  return article;
};

const renderEventGroup = (type) => {
  const events = dccEvents[type];
  const list = document.querySelector(`#${type}-event-list`);
  const emptyState = document.querySelector(`#${type}-empty-state`);

  if (!list || !emptyState || !Array.isArray(events) || events.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  events.forEach((event, index) => {
    fragment.append(createEventCard(event, index, type));
  });

  list.append(fragment);
  list.hidden = false;
  emptyState.hidden = true;
};

renderEventGroup("upcoming");
renderEventGroup("past");
