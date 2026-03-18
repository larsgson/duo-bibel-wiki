// Reads src/data/templates/*/locales/*.toml and */index.toml
// Generates src/generated/story-locales.json with per-template category/story mapping and all locale data.
//
// Run: node scripts/build-story-locales.js

import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

const TEMPLATES_ROOT = path.join(process.cwd(), "src/data/templates");
const OUT_FILE = path.join(process.cwd(), "src/generated/story-locales.json");

// Discover all template directories
const templateDirs = fs
  .readdirSync(TEMPLATES_ROOT)
  .filter(
    (d) => fs.statSync(path.join(TEMPLATES_ROOT, d)).isDirectory(),
  )
  .sort();

const output = {};

for (const templateName of templateDirs) {
  const templateDir = path.join(TEMPLATES_ROOT, templateName);
  const localesDir = path.join(templateDir, "locales");

  // ── Build category → story → chapter mapping from index.toml + .md files ──
  const categories = {};
  const catDirs = fs
    .readdirSync(templateDir)
    .filter(
      (d) =>
        /^\d+$/.test(d) && fs.statSync(path.join(templateDir, d)).isDirectory(),
    )
    .sort();

  for (const catId of catDirs) {
    const catPath = path.join(templateDir, catId);
    const mdFiles = fs
      .readdirSync(catPath)
      .filter((f) => f.endsWith(".md"))
      .sort();

    // Parse index.toml for category image and per-story images
    let categoryImage = null;
    const storyImages = {};
    const indexToml = path.join(catPath, "index.toml");
    if (fs.existsSync(indexToml)) {
      const indexData = parse(fs.readFileSync(indexToml, "utf-8"));
      categoryImage = indexData.image?.filename || null;
      if (Array.isArray(indexData.stories)) {
        for (const s of indexData.stories) {
          if (s.id && s.image) storyImages[s.id] = s.image;
        }
      }
    }

    const stories = [];
    for (const mdFile of mdFiles) {
      const storyId = mdFile.replace(".md", "");
      const content = fs.readFileSync(path.join(catPath, mdFile), "utf-8");

      // Extract verse references — match any 3-letter book code
      const refs = [
        ...content.matchAll(/\[\[ref:([A-Z0-9]{3}) (\d+):(\d+)(?:-(\d+))?\]\]/g),
      ];
      const verses = refs.map((m) => ({
        book: m[1],
        chapter: parseInt(m[2], 10),
        verseStart: parseInt(m[3], 10),
        verseEnd: m[4] ? parseInt(m[4], 10) : parseInt(m[3], 10),
      }));

      // Ordered verse refs as they appear in the .md file (source of truth for display order)
      const verseRefs = refs.map((m) =>
        `${m[1]}${m[2]}:${m[3]}${m[4] ? "-" + m[4] : ""}`
      );

      // Collect unique Bible books referenced
      const booksReferenced = [...new Set(refs.map((m) => m[1]))];

      // Collect unique book:chapter pairs (e.g. "GEN:1", "GEN:2")
      const bookChapterPairs = [...new Set(
        refs.map((m) => `${m[1]}:${m[2]}`)
      )];

      // Extract per-verse images: ![Image](file) followed by [[ref:...]]
      const verseImages = {};
      const imgRefPairs = [
        ...content.matchAll(/!\[Image\]\(([^)]+)\)\s*\n+\s*\[\[ref:([A-Z0-9]{3}) (\d+):(\d+)(?:-(\d+))?\]\]/g),
      ];
      for (const m of imgRefPairs) {
        const ref = `${m[2]}${m[3]}:${m[4]}${m[5] ? "-" + m[5] : ""}`;
        if (!verseImages[ref]) verseImages[ref] = [];
        verseImages[ref].push(m[1]);
      }

      stories.push({
        id: storyId,
        verseRefs,
        image: storyImages[storyId] || null,
        books: booksReferenced.length > 0 ? booksReferenced : undefined,
        bookChapters: bookChapterPairs.length > 0 ? bookChapterPairs : undefined,
        verseImages: Object.keys(verseImages).length > 0 ? verseImages : undefined,
      });
    }

    categories[catId] = { stories, image: categoryImage };
  }

  // ── Parse locale TOML files ──
  const locales = {};
  if (fs.existsSync(localesDir)) {
    const tomlFiles = fs
      .readdirSync(localesDir)
      .filter((f) => f.endsWith(".toml"))
      .sort();

    for (const tomlFile of tomlFiles) {
      const langCode = tomlFile.replace(".toml", "");
      const content = fs.readFileSync(path.join(localesDir, tomlFile), "utf-8");
      const parsed = parse(content);
      locales[langCode] = parsed;
    }
  }

  output[templateName] = { categories, locales };

  const localeCount = Object.keys(locales).length;
  const catCount = Object.keys(categories).length;
  let storyCount = 0;
  for (const cat of Object.values(categories)) {
    storyCount += cat.stories.length;
  }
  console.log(
    `  ${templateName}: ${localeCount} locales, ${catCount} categories, ${storyCount} stories`,
  );
}

// ── Write output ──
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output));

console.log(`\nStory locales written to ${OUT_FILE}`);
