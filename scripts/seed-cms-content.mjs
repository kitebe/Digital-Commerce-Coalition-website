import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const sources = [
  {
    key: "blogPosts",
    file: "blog-data.js",
    declaration: "const dccBlogPosts = ",
    marker: "\n\nconst createBlogCard",
  },
  {
    key: "events",
    file: "events-data.js",
    declaration: "const dccEvents = ",
    marker: "\n\nconst createEventCard",
  },
  {
    key: "pressCoverage",
    file: "press-data.js",
    declaration: "const dccPressCoverage = ",
    marker: "\n\nconst createPressCard",
  },
  {
    key: "publications",
    file: "publications-data.js",
    declaration: "const dccPublications = ",
    marker: "\n\nconst createPublicationCover",
  },
  {
    key: "reports",
    file: "reports-data.js",
    declaration: "const dccReports = ",
    marker: "\n\nconst createReportCard",
  },
];

const content = {};

for (const sourceDefinition of sources) {
  const source = await readFile(
    join(projectRoot, "public", sourceDefinition.file),
    "utf8",
  );
  const start = source.indexOf(sourceDefinition.declaration);
  const end = source.indexOf(sourceDefinition.marker);

  if (start < 0 || end < 0) {
    throw new Error(`Could not extract content from ${sourceDefinition.file}`);
  }

  const expression = source
    .slice(start + sourceDefinition.declaration.length, end)
    .replace(/;\s*$/, "");

  content[sourceDefinition.key] = Function(`"use strict"; return (${expression});`)();
}

const destination = join(projectRoot, "data", "cms-content.json");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(content, null, 2)}\n`, "utf8");
console.log(`Seeded ${destination}`);
