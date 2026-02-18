// Reads src/data/templates/John/locales/*.toml and */index.toml
// Generates src/generated/story-locales.json with category/story mapping and all locale data.
//
// Run: node scripts/build-story-locales.js

import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

const TEMPLATES_DIR = path.join(process.cwd(), "src/data/templates/John");
const LOCALES_DIR = path.join(TEMPLATES_DIR, "locales");
const OUT_FILE = path.join(process.cwd(), "src/generated/story-locales.json");

// ── Build category → story → chapter mapping from index.toml + .md files ──
const categories = {};
const catDirs = fs
  .readdirSync(TEMPLATES_DIR)
  .filter(
    (d) =>
      /^\d+$/.test(d) && fs.statSync(path.join(TEMPLATES_DIR, d)).isDirectory(),
  )
  .sort();

for (const catId of catDirs) {
  const catPath = path.join(TEMPLATES_DIR, catId);
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
    // Extract chapter number from [[chapter:NN]]
    const chapterMatch = content.match(/\[\[chapter:(\d+)\]\]/);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : null;
    // Extract verse references to determine range
    const refs = [
      ...content.matchAll(/\[\[ref:JHN (\d+):(\d+)(?:-(\d+))?\]\]/g),
    ];
    const verses = refs.map((m) => ({
      chapter: parseInt(m[1], 10),
      verseStart: parseInt(m[2], 10),
      verseEnd: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
    }));
    stories.push({
      id: storyId,
      chapter,
      verseStart: verses.length > 0 ? verses[0].verseStart : null,
      verseEnd: verses.length > 0 ? verses[verses.length - 1].verseEnd : null,
      image: storyImages[storyId] || null,
    });
  }

  categories[catId] = { stories, image: categoryImage };
}

// ── Parse locale TOML files ──
const locales = {};
const tomlFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".toml"))
  .sort();

for (const tomlFile of tomlFiles) {
  const langCode = tomlFile.replace(".toml", "");
  const content = fs.readFileSync(path.join(LOCALES_DIR, tomlFile), "utf-8");
  const parsed = parse(content);
  locales[langCode] = parsed;
}

// ── Write output ──
const output = { categories, locales };
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output));

const localeCount = Object.keys(locales).length;
const catCount = Object.keys(categories).length;
let storyCount = 0;
for (const cat of Object.values(categories)) {
  storyCount += cat.stories.length;
}
console.log(
  `Story locales: ${localeCount} locales, ${catCount} categories, ${storyCount} stories -> ${OUT_FILE}`,
);
