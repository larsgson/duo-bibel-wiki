import langsData from "../data/ALL-langs-compact.json";
import imageIndex from "../generated/image-index.json";
import languageStyles from "../data/language-styles.json";
import fs from "node:fs";
import path from "node:path";

// ── Book mapping ──
export const BOOK_MAP: Record<
  string,
  { dbt: string; img: string; timingPrefix: string }
> = {
  john: { dbt: "JHN", img: "John", timingPrefix: "JHN" },
};

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
}

export interface LangInfo {
  code: string;
  english: string;
  isRTL: boolean;
  info: { n?: string; v?: string };
}

export interface ValidatedParams {
  bookInfo: { dbt: string; img: string; timingPrefix: string };
  chapterNum: number;
  primary: LangInfo;
  secondary: LangInfo;
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
}): ValidatedParams | null {
  const { lang, lang2, book, chapter } = params;

  const bookInfo = BOOK_MAP[book?.toLowerCase() ?? ""];
  if (!bookInfo) return null;

  const chapterNum = parseInt(chapter!, 10);
  if (isNaN(chapterNum) || chapterNum < 1) return null;

  // Validate primary language
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

  const primaryIsRTL = !!(pInfo.v && RTL_REGEX.test(pInfo.v));

  // Validate secondary language
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

  const secondaryIsRTL = !!(sInfo.v && RTL_REGEX.test(sInfo.v));

  return {
    bookInfo,
    chapterNum,
    primary: {
      code: lang!,
      english: pInfo.n || lang!,
      isRTL: primaryIsRTL,
      info: pInfo,
    },
    secondary: {
      code: lang2!,
      english: sInfo.n || lang2!,
      isRTL: secondaryIsRTL,
      info: sInfo,
    },
  };
}

/**
 * Load timing data for a language code.
 * If preferredVersion is given (from getFilesetInfo), use that exact
 * version so timing matches the audio recording.
 */
export function findTimingData(
  langCode: string,
  preferredCategory?: string,
  preferredVersion?: string,
): {
  filesetKey: string;
  timingData: any;
  distinctId: string;
  category: string;
} | null {
  const categories = ["with-timecode", "audio-with-timecode"];

  // If a preferred version is specified, try it first
  if (preferredCategory && preferredVersion) {
    const timingFile = path.join(
      process.cwd(),
      "src/data/templates/John/ALL-timings/nt",
      preferredCategory,
      langCode,
      preferredVersion,
      "timing.json",
    );
    if (fs.existsSync(timingFile)) {
      const data = JSON.parse(fs.readFileSync(timingFile, "utf-8"));
      const filesetKey = Object.keys(data)[0];
      return {
        filesetKey,
        timingData: data[filesetKey],
        distinctId: preferredVersion,
        category: preferredCategory,
      };
    }
  }

  // Fall back to scanning all versions
  for (const cat of categories) {
    const catPath = path.join(
      process.cwd(),
      "src/data/templates/John/ALL-timings/nt",
      cat,
      langCode,
    );
    if (!fs.existsSync(catPath)) continue;
    const versions = fs.readdirSync(catPath);
    for (const ver of versions) {
      const timingFile = path.join(catPath, ver, "timing.json");
      if (fs.existsSync(timingFile)) {
        const data = JSON.parse(fs.readFileSync(timingFile, "utf-8"));
        const filesetKey = Object.keys(data)[0];
        return {
          filesetKey,
          timingData: data[filesetKey],
          distinctId: ver,
          category: cat,
        };
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
  chapterNum: number,
  category: string,
  distinctId: string,
): Record<string, (number | null)[]> | null {
  const wordsFile = path.join(
    process.cwd(),
    "src/data/templates/John/ALL-timings/nt",
    category,
    langCode,
    distinctId,
    "words.json",
  );
  if (!fs.existsSync(wordsFile)) return null;
  const data = JSON.parse(fs.readFileSync(wordsFile, "utf-8"));
  const filesetKey = Object.keys(data)[0];
  const chapterData = data[filesetKey]?.[String(chapterNum)];
  if (!chapterData) return null;
  // Flatten: { "JHN1:1": { "1": [...] } } → { "JHN1:1": [...] }
  const flat: Record<string, (number | null)[]> = {};
  for (const [ref, verseObj] of Object.entries(chapterData)) {
    const inner = verseObj as Record<string, (number | null)[]>;
    const firstKey = Object.keys(inner)[0];
    if (firstKey) flat[ref] = inner[firstKey];
  }
  return flat;
}

function parseTextFilesetId(
  textValue: string | undefined,
  distinctId: string,
): string {
  if (!textValue) return "";
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
export function getFilesetInfo(langCode: string): {
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
      "src/data/ALL-langs-data/nt",
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
        const audioSuffix = d.a.replace(".mp3", "");
        bestAudio = audioSuffix.length >= 6 ? audioSuffix : ver + audioSuffix;
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
 * Build sorted verse entries from chapter timing data.
 */
export function buildVerseEntries(
  chapterTiming: Record<string, number[]>,
): VerseEntry[] {
  const verseEntries: VerseEntry[] = [];
  for (const [ref, times] of Object.entries(chapterTiming) as [
    string,
    number[],
  ][]) {
    const colonIdx = ref.indexOf(":");
    const verseSpec = ref.substring(colonIdx + 1);
    const parts = verseSpec.split("-");
    const verseStart = parseInt(parts[0], 10);
    const verseEnd =
      parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : verseStart;
    verseEntries.push({
      ref,
      verseStart,
      verseEnd,
      startTime: times[0],
      endTime: times[times.length - 1],
    });
  }
  verseEntries.sort((a, b) => a.verseStart - b.verseStart);
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
 * Get API config from environment.
 */
export function getApiConfig(): { apiKey: string; apiBaseUrl: string } {
  return {
    apiKey: import.meta.env.DBT_API_KEY || process.env.DBT_API_KEY || "",
    apiBaseUrl:
      import.meta.env.DBT_API_BASE_URL || process.env.DBT_API_BASE_URL || "",
  };
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
 * Build the full chapterData JSON object for client-side use.
 */
export function buildChapterData(params: {
  bookInfo: { dbt: string; img: string };
  chapterNum: number;
  verseEntries: VerseEntry[];
  primaryFileset: { audioFilesetId: string; textFilesetId: string } | null;
  secondaryFileset: { audioFilesetId: string; textFilesetId: string } | null;
  chapterImageData: Record<string, string[]>;
  secondaryChapterTiming: Record<string, number[]>;
  primaryWordTiming: Record<string, (number | null)[]> | null;
}): string {
  const { apiKey, apiBaseUrl } = getApiConfig();
  return JSON.stringify({
    bookDbt: params.bookInfo.dbt,
    bookImg: params.bookInfo.img,
    chapterNum: params.chapterNum,
    verseEntries: params.verseEntries,
    primaryTextFilesetId: params.primaryFileset?.textFilesetId || "",
    secondaryTextFilesetId: params.secondaryFileset?.textFilesetId || "",
    primaryAudioFilesetId: params.primaryFileset?.audioFilesetId || "",
    secondaryAudioFilesetId: params.secondaryFileset?.audioFilesetId || "",
    chapterImageData: params.chapterImageData,
    secondaryChapterTiming: params.secondaryChapterTiming,
    primaryWordTiming: params.primaryWordTiming,
    apiKey,
    apiBaseUrl,
  });
}
