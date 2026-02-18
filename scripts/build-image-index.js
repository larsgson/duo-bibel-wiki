// Scans assets/john-pics/ and generates src/generated/image-index.json
// Maps each chapter+verse to the list of available image filenames.
//
// Output format:
// { "John": { "1": { "1": ["VB-John1v1.jpg", "VB-John1v1alt.jpg"], "2": [], ... } } }
//
// Run: node scripts/build-image-index.js

import fs from "node:fs";
import path from "node:path";

const IMG_DIR = path.join(process.cwd(), "assets/john-pics");
const OUT_FILE = path.join(process.cwd(), "src/generated/image-index.json");

// Parse a filename like VB-John3v16.jpg, VB-John1v1alt.jpg, VB-John1v16-17.jpg, VB-John12v3c.jpg
// Returns { book, chapter, verseStart, verseEnd, suffix } or null
const FILE_RE = /^VB-(\w+?)(\d+)v(\d+)(?:-(\d+))?([a-z]*)?\.jpg$/;

function parseImageName(filename) {
  const m = filename.match(FILE_RE);
  if (!m) return null;
  return {
    book: m[1],
    chapter: parseInt(m[2], 10),
    verseStart: parseInt(m[3], 10),
    verseEnd: m[4] ? parseInt(m[4], 10) : parseInt(m[3], 10),
    suffix: m[5] || "",
    filename,
  };
}

const files = fs.readdirSync(IMG_DIR).filter((f) => f.endsWith(".jpg"));
const index = {};

for (const f of files) {
  const parsed = parseImageName(f);
  if (!parsed) continue;

  const { book, chapter, verseStart, verseEnd, filename } = parsed;
  if (!index[book]) index[book] = {};
  if (!index[book][chapter]) index[book][chapter] = {};

  // Register for every verse in the range
  for (let v = verseStart; v <= verseEnd; v++) {
    if (!index[book][chapter][v]) index[book][chapter][v] = [];
    index[book][chapter][v].push(filename);
  }
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(index));

const bookCount = Object.keys(index).length;
let totalEntries = 0;
for (const b of Object.values(index)) {
  for (const c of Object.values(b)) {
    totalEntries += Object.keys(c).length;
  }
}
console.log(
  `Image index: ${files.length} files, ${bookCount} book(s), ${totalEntries} verse entries -> ${OUT_FILE}`,
);
