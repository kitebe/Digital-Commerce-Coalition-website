import { randomUUID } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const contentPath = join(projectRoot, "data", "cms-content.json");
const backupPath = join(projectRoot, "data", "cms-content.v1.backup.json");
const content = JSON.parse(await readFile(contentPath, "utf8"));

if (content.schemaVersion === 2) {
  console.log("CMS data is already schema version 2.");
  process.exit(0);
}

await copyFile(contentPath, backupPath);
const now = new Date().toISOString();
const workflow = () => ({
  id: randomUUID(),
  version: 1,
  publishState: "published",
  createdAt: now,
  updatedAt: now,
  publishedAt: now,
});
const richText = (paragraphs = []) => ({
  type: "doc",
  content: paragraphs.length
    ? paragraphs.map((text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }))
    : [{ type: "paragraph" }],
});
const months = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};
const exactDate = (value) => {
  const match = String(value || "").match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match || !months[match[1].toLowerCase()]) return "";
  return `${match[3]}-${months[match[1].toLowerCase()]}-${match[2].padStart(2, "0")}`;
};
const monthDate = (value) => {
  const match = String(value || "").match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match || !months[match[1].toLowerCase()]) return "";
  return `${match[2]}-${months[match[1].toLowerCase()]}`;
};

const blogPosts = (content.blogPosts || []).map(({ paragraphs, readingTime: _readingTime, ...item }) => ({
  ...workflow(),
  ...item,
  date: exactDate(item.date),
  body: richText(paragraphs || []),
}));
const oldEvents = [
  ...(content.events?.upcoming || []),
  ...(content.events?.past || []),
];
const events = oldEvents.map(({ day, month, year, description, href: _href, ...item }) => ({
  ...workflow(),
  ...item,
  eventDate: `${year}-${months[String(month).toLowerCase()] || "01"}-${String(day || "1").padStart(2, "0")}`,
  body: richText(description ? [description] : []),
}));
const pressCoverage = (content.pressCoverage || []).map((item) => ({
  ...workflow(),
  ...item,
  date: exactDate(item.date),
}));
const publications = (content.publications || []).map((item) => ({
  ...workflow(),
  ...item,
  date: monthDate(item.date),
  body: richText([]),
}));
const reports = (content.reports || []).map((item) => ({
  ...workflow(),
  ...item,
  date: monthDate(item.date),
}));
const members = [
  ["Amazon", "./assets/Group%202974.png"],
  ["Eternal", "./assets/Group%202975.png"],
  ["Zepto", "./assets/Group%202976.png"],
  ["Meesho", "./assets/Group%202977.png"],
  ["Swiggy", "./assets/Group%202978.png"],
].map(([name, logo]) => ({ ...workflow(), name, logo, logoAlt: name }));

const migrated = {
  schemaVersion: 2,
  blogPosts,
  events,
  pressCoverage,
  publications,
  reports,
  members,
};
await writeFile(contentPath, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
console.log(`Migrated CMS data to schema version 2. Backup: ${backupPath}`);
