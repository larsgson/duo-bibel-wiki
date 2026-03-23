import langsData from "../data/ALL-langs-compact.json";
import imageIndex from "../generated/image-index.json";
import languageStyles from "../data/language-styles.json";
import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";

// ── Template discovery (auto-generated from src/data/templates/) ──
export interface TemplateInfo {
  img: string; // directory name (e.g. "John", "TGS")
}

const _templatesDir = path.join(process.cwd(), "src/data/templates");
export const BOOK_MAP: Record<string, TemplateInfo> = {};
if (fs.existsSync(_templatesDir)) {
  for (const d of fs.readdirSync(_templatesDir)) {
    if (fs.statSync(path.join(_templatesDir, d)).isDirectory()) {
      BOOK_MAP[d.toLowerCase()] = { img: d };
    }
  }
}

// ── RTL detection ──
const RTL_REGEX =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

// ── Types ──
export interface VerseEntry {
  ref: string;
  verseStart: number;
  verseEnd: number;
  startTime: number;
  endTime: number;
  rangeContin?: boolean; // true for 2nd+ verses expanded from a range (no image on listen page)
  sourceRef?: string;    // original .md ref before range expansion (e.g. "GEN3:2-3")
}

export interface LangInfo {
  code: string;
  english: string;
  isRTL: boolean;
  info: { n?: string; v?: string };
}

export interface ValidatedParams {
  bookInfo: TemplateInfo;
  chapterNum: number;
  learn: LangInfo;
  mt: LangInfo;
}

/**
 * Validate route params and resolve language info.
 * Returns null if invalid (caller should redirect).
 */
export function validateParams(params: {
  lang?: string;
  lang2?: string;
  book?: string;
  chapter?: string;
  category?: string;
  story?: string;
}): ValidatedParams | null {
  const { lang, lang2, book, chapter, category, story } = params;

  const bookInfo = BOOK_MAP[book?.toLowerCase() ?? ""];
  if (!bookInfo) return null;

  // Support both old [chapter] and new [category]/[story] routes
  let chapterNum: number;
  if (category && story) {
    chapterNum = parseInt(story, 10);
  } else {
    chapterNum = parseInt(chapter!, 10);
  }
  if (isNaN(chapterNum) || chapterNum < 1) return null;

  // Validate learn language
  const wt = langsData.canons.nt["with-timecode"] as Record<
    string,
    { n?: string; v?: string }
  >;
  const awt = langsData.canons.nt["audio-with-timecode"] as Record<
    string,
    { n?: string; v?: string }
  >;
  const pInfo = wt[lang!] || awt[lang!];
  if (!pInfo) return null;

  const learnIsRTL = !!(pInfo.v && RTL_REGEX.test(pInfo.v));

  // Validate mother tongue
  let sInfo: { n?: string; v?: string } | undefined;
  for (const canon of ["nt", "ot"] as const) {
    const canonData = (langsData.canons as any)[canon];
    if (!canonData) continue;
    for (const cat of Object.keys(canonData)) {
      if (canonData[cat][lang2!]) {
        sInfo = canonData[cat][lang2!];
        break;
      }
    }
    if (sInfo) break;
  }
  if (!sInfo) return null;

  const mtIsRTL = !!(sInfo.v && RTL_REGEX.test(sInfo.v));

  return {
    bookInfo,
    chapterNum,
    learn: {
      code: lang!,
      english: pInfo.n || lang!,
      isRTL: learnIsRTL,
      info: pInfo,
    },
    mt: {
      code: lang2!,
      english: sInfo.n || lang2!,
      isRTL: mtIsRTL,
      info: sInfo,
    },
  };
}

/**
 * Scan a version directory for timing data.
 * Handles per-book layout (version/BOOK/timing.json).
 *
 * New format: fileset > story > chapter > verse > [start, end]
 * Merges across books into a flat structure per story:
 *   timingData[storyNum] = { "BOOK+CH:VERSE": [start, end], ... }
 * This allows buildVerseEntries to match refs from verseRefs.
 */
function loadTimingFromVersionDir(versionDir: string): {
  filesetKey: string;
  timingData: any;
} | null {
  if (!fs.existsSync(versionDir)) return null;
  const bookDirs = fs.readdirSync(versionDir).filter((d: string) => {
    const full = path.join(versionDir, d);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "timing.json"));
  });
  if (bookDirs.length === 0) return null;

  let mergedFilesetKey = "";
  const mergedTiming: Record<string, Record<string, [number, number]>> = {};

  for (const bookCode of bookDirs) {
    const data = JSON.parse(fs.readFileSync(path.join(versionDir, bookCode, "timing.json"), "utf-8"));
    const filesetKey = Object.keys(data)[0];
    if (!mergedFilesetKey) mergedFilesetKey = filesetKey;
    const bookTiming = data[filesetKey];

    for (const [storyKey, storyData] of Object.entries(bookTiming) as [string, any][]) {
      if (!mergedTiming[storyKey]) {
        mergedTiming[storyKey] = {};
      }
      // New format: storyData = { chapter: { verse: [start, end] } }
      // Flatten to "BOOK+CH:VERSE" keys for compatibility with verseRefs
      for (const [chapter, verses] of Object.entries(storyData) as [string, any][]) {
        for (const [verse, times] of Object.entries(verses) as [string, any][]) {
          const ref = `${bookCode}${chapter}:${verse}`;
          mergedTiming[storyKey][ref] = times;
        }
      }
    }
  }
  return { filesetKey: mergedFilesetKey, timingData: mergedTiming };
}

export function findTimingData(
  langCode: string,
  preferredCategory?: string,
  preferredVersion?: string,
  templateName: string,
  canon: string = "nt",
): {
  filesetKey: string;
  timingData: any;
  distinctId: string;
  category: string;
} | null {
  const categories = ["with-timecode", "audio-with-timecode"];
  const basePath = path.join(
    process.cwd(),
    "src/data/templates-timings",
    templateName,
    "ALL-timings",
    canon,
  );

  // If a preferred version is specified, try it first
  if (preferredCategory && preferredVersion) {
    const versionDir = path.join(basePath, preferredCategory, langCode, preferredVersion);
    const result = loadTimingFromVersionDir(versionDir);
    if (result) {
      return { ...result, distinctId: preferredVersion, category: preferredCategory };
    }
  }

  // Fall back to scanning — first try with category subdirs, then direct lang dirs
  for (const cat of categories) {
    const catPath = path.join(basePath, cat, langCode);
    if (!fs.existsSync(catPath)) continue;
    const versions = fs.readdirSync(catPath).filter(
      (d: string) => fs.statSync(path.join(catPath, d)).isDirectory()
    );
    for (const ver of versions) {
      const result = loadTimingFromVersionDir(path.join(catPath, ver));
      if (result) {
        return { ...result, distinctId: ver, category: cat };
      }
    }
  }

  // Also try direct lang dir (no category subdir) — e.g. nt/heb/HEBM95/
  const directLangPath = path.join(basePath, langCode);
  if (fs.existsSync(directLangPath)) {
    const versions = fs.readdirSync(directLangPath).filter(
      (d: string) => fs.statSync(path.join(directLangPath, d)).isDirectory()
    );
    for (const ver of versions) {
      const result = loadTimingFromVersionDir(path.join(directLangPath, ver));
      if (result) {
        return { ...result, distinctId: ver, category: "with-timecode" };
      }
    }
  }

  return null;
}

/**
 * Load word-level timing data for a language code.
 * Returns the words data for a specific chapter, or null if unavailable.
 */
export function findWordTimingData(
  langCode: string,
  storyNum: number,
  category: string,
  distinctId: string,
  templateName: string,
  canon: string = "nt",
): Record<string, (number | null)[]> | null {
  const basePath = path.join(
    process.cwd(),
    "src/data/templates-timings",
    templateName,
    "ALL-timings",
    canon,
  );

  // Scan for words.json in version dir and book subdirs
  const versionPaths = [
    path.join(basePath, category, langCode, distinctId),
    path.join(basePath, langCode, distinctId),
  ];

  for (const versionDir of versionPaths) {
    if (!fs.existsSync(versionDir)) continue;

    // Try flat: version/words.json
    const flatFile = path.join(versionDir, "words.json");
    if (fs.existsSync(flatFile)) {
      const result = extractWordTiming(flatFile, storyNum);
      if (result) return result;
    }

    // Try per-book: version/BOOK/words.json
    const bookDirs = fs.readdirSync(versionDir).filter((d: string) => {
      const full = path.join(versionDir, d);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "words.json"));
    });
    // Merge word timing from all book subdirs
    const merged: Record<string, (number | null)[]> = {};
    for (const bookDir of bookDirs) {
      const result = extractWordTiming(path.join(versionDir, bookDir, "words.json"), storyNum);
      if (result) Object.assign(merged, result);
    }
    if (Object.keys(merged).length > 0) return merged;
  }

  return null;
}

function extractWordTiming(
  wordsFile: string,
  storyNum: number,
): Record<string, (number | null)[]> | null {
  const data = JSON.parse(fs.readFileSync(wordsFile, "utf-8"));
  const filesetKey = Object.keys(data)[0];
  const storyData = data[filesetKey]?.[String(storyNum)];
  if (!storyData) return null;
  // New format: { chapter: { verse: [timestamps] } } (book from file path)
  const merged: Record<string, (number | null)[]> = {};
  for (const [ch, verses] of Object.entries(storyData) as [string, any][]) {
    for (const [verse, timings] of Object.entries(verses) as [string, any][]) {
      merged[verse] = timings;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function parseTextFilesetId(
  textValue: string | undefined,
  distinctId: string,
): string {
  if (!textValue) return "";
  if (textValue.startsWith("helloao:") || textValue.startsWith("contrib:")) return textValue;
  if (textValue.endsWith(".txt")) {
    const suffix = textValue.replace(".txt", "");
    return suffix.length >= 6 ? suffix : distinctId + suffix;
  }
  return textValue;
}

/**
 * Get audio and text fileset IDs for a language.
 * Also returns the distinctId/category of the audio source,
 * so timing data can be loaded from the matching version.
 */
export function getFilesetInfo(langCode: string, templateName: string, canon: string = "nt"): {
  audioFilesetId: string;
  textFilesetId: string;
  audioDistinctId: string;
  audioCategory: string;
} | null {
  const allCategories = [
    "with-timecode",
    "audio-with-timecode",
    "syncable",
    "text-only",
    "audio-only",
  ];
  let bestAudio = "";
  let bestText = "";
  let audioDistinctId = "";
  let audioCategory = "";
  for (const cat of allCategories) {
    const catPath = path.join(
      process.cwd(),
      "src/data/ALL-langs-data",
      canon,
      cat,
      langCode,
    );
    if (!fs.existsSync(catPath)) continue;
    const versions = fs.readdirSync(catPath);
    for (const ver of versions) {
      const dataFile = path.join(catPath, ver, "data.json");
      if (!fs.existsSync(dataFile)) continue;
      const d = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      if (!bestAudio && d.a) {
        if (d.a.startsWith("helloao:") || d.a.startsWith("contrib:")) {
          bestAudio = d.a;
        } else {
          const audioSuffix = d.a.replace(".mp3", "");
          if (audioSuffix.length >= 6) {
            bestAudio = audioSuffix;
          } else if (ver.includes("_")) {
            // Folder is a helloao-style ID (e.g. ibo_bib) — find the DBT version
            // from the timing directory to construct the correct audio fileset ID
            let dbtVer = "";
            for (const tc of ["with-timecode", "audio-with-timecode"]) {
              const timingCatPath = path.join(
                process.cwd(),
                "src/data/templates-timings",
                templateName,
                "ALL-timings",
                canon,
                tc,
                langCode,
              );
              if (fs.existsSync(timingCatPath)) {
                const found = fs.readdirSync(timingCatPath).find((v) => !v.includes("_"));
                if (found) { dbtVer = found; break; }
              }
            }
            if (dbtVer) {
              bestAudio = dbtVer + audioSuffix;
              audioDistinctId = dbtVer;
              audioCategory = cat;
              if (!bestText && d.t) {
                bestText = parseTextFilesetId(d.t, ver);
              }
              if (bestAudio && bestText) break;
              continue;
            }
            bestAudio = ver + audioSuffix;
          } else {
            bestAudio = ver + audioSuffix;
          }
        }
        audioDistinctId = ver;
        audioCategory = cat;
      }
      if (!bestText && d.t) {
        bestText = parseTextFilesetId(d.t, ver);
      }
      if (bestAudio && bestText) break;
    }
    if (bestAudio && bestText) break;
  }
  if (!bestAudio && !bestText) return null;
  return { audioFilesetId: bestAudio, textFilesetId: bestText, audioDistinctId, audioCategory };
}

/**
 * Extract timing data for a story by its number (parseInt of storyId).
 */
export function getChapterTiming(
  timingData: any,
  storyNum: number,
): Record<string, number[]> | null {
  return timingData[String(storyNum)] || null;
}

/**
 * Build verse entries from an ordered list of refs (from the .md file).
 * Timing data is consulted for start/end times but the order comes from verseRefs.
 *
 * For .md ranges like "GEN3:1-5", expands into individual verse entries
 * using the timing data (which now has per-verse [start, end]).
 */
export function buildVerseEntries(
  chapterTiming: Record<string, [number, number]>,
  verseRefs?: string[],
): VerseEntry[] {
  const refs = verseRefs && verseRefs.length > 0
    ? verseRefs
    : Object.keys(chapterTiming);

  const verseEntries: VerseEntry[] = [];
  for (const ref of refs) {
    const colonIdx = ref.indexOf(":");
    const refPrefix = ref.substring(0, colonIdx); // e.g. "GEN3"
    const verseSpec = ref.substring(colonIdx + 1);
    const parts = verseSpec.split("-");
    const verseStart = parseInt(parts[0], 10);
    const verseEnd =
      parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : verseStart;

    if (verseStart === verseEnd) {
      // Single verse
      const times = chapterTiming[ref];
      verseEntries.push({
        ref,
        verseStart,
        verseEnd: verseStart,
        startTime: times ? times[0] : 0,
        endTime: times ? times[1] : 0,
      });
    } else {
      // Range — expand into individual verses using per-verse timing
      for (let v = verseStart; v <= verseEnd; v++) {
        const singleRef = `${refPrefix}:${v}`;
        const times = chapterTiming[singleRef];
        verseEntries.push({
          ref: singleRef,
          verseStart: v,
          verseEnd: v,
          startTime: times ? times[0] : 0,
          endTime: times ? times[1] : 0,
          rangeContin: v > verseStart,
          sourceRef: ref, // original range ref from .md (for image lookup)
        });
      }
    }
  }
  return verseEntries;
}

/**
 * Get image data for a chapter.
 */
export function getChapterImageData(
  bookImg: string,
  chapterNum: number,
): Record<string, string[]> {
  const bookImageData = (imageIndex as any)[bookImg];
  return bookImageData?.[String(chapterNum)] || {};
}

/**
 * Get font scale for a language from language-styles.json.
 * Returns 1 (no scaling) if no config exists for the language.
 */
export function getLangFontScale(langCode: string): number {
  const styles = (languageStyles as Record<string, { fontScale?: number }>)[
    langCode
  ];
  return styles?.fontScale ?? 1;
}

/**
 * Get gap scale for a language from language-styles.json.
 * Returns 1 (no scaling) if no config exists for the language.
 */
export function getLangGapScale(langCode: string): number {
  const styles = (languageStyles as Record<string, { gapScale?: number }>)[
    langCode
  ];
  return styles?.gapScale ?? 1;
}

/**
 * Read image config from a template's index.toml.
 */
export interface TemplateImageConfig {
  baseUrl: string;
  pathPattern: string;
  mediumPattern: string;
  thumbsPattern: string;
  thumbsResize: string;
  cropPercent: number;
}
let _imageConfigCache: Record<string, TemplateImageConfig> = {};
export function getTemplateImageConfig(templateName: string): TemplateImageConfig {
  if (_imageConfigCache[templateName]) return _imageConfigCache[templateName];
  const tomlPath = path.join(
    process.cwd(),
    "src/data/templates",
    templateName,
    "index.toml",
  );
  const defaultConfig: TemplateImageConfig = { baseUrl: "", pathPattern: "{filename}", mediumPattern: "", thumbsPattern: "", thumbsResize: "", cropPercent: 0 };
  if (fs.existsSync(tomlPath)) {
    const data = parseToml(fs.readFileSync(tomlPath, "utf-8")) as any;
    const config: TemplateImageConfig = {
      baseUrl: data.images?.base_url || "",
      pathPattern: data.images?.path_pattern || "{filename}",
      mediumPattern: data.images?.medium_pattern || "",
      thumbsPattern: data.images?.thumbs_pattern || "",
      thumbsResize: data.images?.thumbs_resize || "",
      cropPercent: data.images?.crop_percent || 0,
    };
    _imageConfigCache[templateName] = config;
    return config;
  }
  return defaultConfig;
}

/**
 * Read image base URL from a template's index.toml.
 */
export function getTemplateImageBaseUrl(templateName: string): string {
  return getTemplateImageConfig(templateName).baseUrl;
}

/**
 * Load a template's theme CSS file if specified in index.toml (layout_theme field).
 * Returns the CSS string, or empty string if no theme configured.
 */
export function getTemplateThemeCSS(templateName: string): string {
  const tomlPath = path.join(
    process.cwd(),
    "src/data/templates",
    templateName,
    "index.toml",
  );
  if (!fs.existsSync(tomlPath)) return "";
  const data = parseToml(fs.readFileSync(tomlPath, "utf-8")) as any;
  const themeFile = data.layout_theme;
  if (!themeFile) return "";
  const cssPath = path.join(
    process.cwd(),
    "src/data/templates",
    templateName,
    themeFile,
  );
  return fs.existsSync(cssPath)
    ? fs.readFileSync(cssPath, "utf-8")
    : "";
}

/**
 * Check if a template has OT timing data (i.e. is multi-canon).
 */
export function templateHasOT(templateName: string): boolean {
  const otDir = path.join(
    process.cwd(),
    "src/data/templates-timings",
    templateName,
    "ALL-timings",
    "ot",
  );
  return fs.existsSync(otDir);
}

/**
 * Build the full chapterData JSON object for client-side use.
 */
export function buildChapterData(params: {
  bookInfo: TemplateInfo;
  chapterNum: number;
  verseEntries: VerseEntry[];
  learnCode?: string;
  mtCode?: string;
  learnFileset: { audioFilesetId: string; textFilesetId: string } | null;
  mtFileset: { audioFilesetId: string; textFilesetId: string } | null;
  learnOtFileset?: { audioFilesetId: string; textFilesetId: string } | null;
  mtOtFileset?: { audioFilesetId: string; textFilesetId: string } | null;
  chapterImageData: Record<string, string[]>;
  mtChapterTiming: Record<string, number[]>;
  learnWordTiming: Record<string, (number | null)[]> | null;
  imageBaseUrl: string;
  bibleChapters?: { book: string; chapter: number }[];
  imagePathPattern?: string;
  imageMediumPattern?: string;
  thumbsResize?: string;
  cropPercent?: number;
  verseImages?: Record<string, string[]>;
}): string {
  return JSON.stringify({
    bookImg: params.bookInfo.img,
    chapterNum: params.chapterNum,
    verseEntries: params.verseEntries,
    learnCode: params.learnCode || "",
    mtCode: params.mtCode || "",
    learnTextFilesetId: params.learnFileset?.textFilesetId || "",
    mtTextFilesetId: params.mtFileset?.textFilesetId || "",
    learnAudioFilesetId: params.learnFileset?.audioFilesetId || "",
    mtAudioFilesetId: params.mtFileset?.audioFilesetId || "",
    learnOtTextFilesetId: params.learnOtFileset?.textFilesetId || "",
    mtOtTextFilesetId: params.mtOtFileset?.textFilesetId || "",
    learnOtAudioFilesetId: params.learnOtFileset?.audioFilesetId || "",
    mtOtAudioFilesetId: params.mtOtFileset?.audioFilesetId || "",
    chapterImageData: params.chapterImageData,
    mtChapterTiming: params.mtChapterTiming,
    learnWordTiming: params.learnWordTiming,
    imageBaseUrl: params.imageBaseUrl,
    bibleChapters: params.bibleChapters || [],
    imagePathPattern: params.imagePathPattern || "{filename}",
    imageMediumPattern: params.imageMediumPattern || "",
    thumbsResize: params.thumbsResize || "",
    cropPercent: params.cropPercent || 0,
    verseImages: params.verseImages || {},
  });
}
