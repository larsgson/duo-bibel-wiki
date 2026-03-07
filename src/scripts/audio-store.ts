// ── Audio Store ──
// Singleton audio state that persists across Astro page transitions.
// Imported once by Layout.astro's module script and exposed as window.__audioStore.

// ── Types ──

export interface VerseEntry {
  verseStart: number;
  verseEnd: number;
  startTime: number;
  endTime: number;
}

export type AudioPlayState = "idle" | "playing_primary" | "playing_secondary";

export interface AudioContext {
  primaryCode: string;
  secondaryCode: string;
  book: string;
  chapter: number;
  bookImg: string;
}

export interface PausedState {
  verseIdx: number;
  wasSecondary: boolean;
}

// ── State (module-level singletons) ──

let audioPlayState: AudioPlayState = "idle";
let audioContext: AudioContext | null = null;
let currentVerseIdx = 0;
let verseEntries: VerseEntry[] = [];
let secondaryTimingMap: Record<string, number[]> = {};
let cachedPrimaryAudioUrl = "";
let cachedSecondaryAudioUrl = "";
let pausedState: PausedState | null = null;
let playerVisible = false;
let focusMode = false;

// ── Audio element singletons ──

let primaryAudio: HTMLAudioElement | null = null;
let secondaryAudio: HTMLAudioElement | null = null;
let primaryAudioSrc = "";
let secondaryAudioSrc = "";

function getAudioElements() {
  if (!primaryAudio) {
    primaryAudio = new Audio();
    secondaryAudio = new Audio();
    primaryAudio.addEventListener("error", () => {
      if (audioPlayState !== "idle") stopAll();
    });
    secondaryAudio!.addEventListener("error", () => {
      if (audioPlayState !== "idle") stopAll();
    });
    primaryAudio.addEventListener("timeupdate", onPrimaryTimeUpdate);
    secondaryAudio!.addEventListener("timeupdate", onSecondaryTimeUpdate);
  }
  return { primaryAudio: primaryAudio!, secondaryAudio: secondaryAudio! };
}

// ── Subscriber pattern ──

type Listener = () => void;
const listeners: Set<Listener> = new Set();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

// ── State getters ──

export function getState() {
  return {
    audioPlayState,
    audioContext,
    currentVerseIdx,
    verseEntries,
    pausedState,
    playerVisible,
    focusMode,
    cachedPrimaryAudioUrl,
    cachedSecondaryAudioUrl,
  };
}

export function setFocusMode(active: boolean) {
  focusMode = active;
  notify();
}

// ── Image callbacks (registered by each page) ──

let findBestImageFn: ((chapter: number, verse: number) => string | null) | null = null;
let imgProxyFn: ((url: string, w: number) => string) | null = null;

export function registerImageCallbacks(
  fbi: (chapter: number, verse: number) => string | null,
  ip: (url: string, w: number) => string,
) {
  findBestImageFn = fbi;
  imgProxyFn = ip;
}

// ── Player card info (read by mini player UI in Layout) ──

export interface PlayerCardInfo {
  title: string;
  imageUrl: string | null;
  langLabel: string;
}

let playerCardInfo: PlayerCardInfo = { title: "\u2014", imageUrl: null, langLabel: "" };

export function getPlayerCardInfo(): PlayerCardInfo {
  return playerCardInfo;
}

function updatePlayerCardInfo(idx: number, langLabel?: string) {
  const entry = verseEntries[idx];
  if (!audioContext || !entry) return;

  const verseDisplay =
    entry.verseStart === entry.verseEnd
      ? String(entry.verseStart)
      : `${entry.verseStart}-${entry.verseEnd}`;

  const title = `${audioContext.bookImg} ${audioContext.chapter}:${verseDisplay}`;

  let imageUrl: string | null = null;
  if (findBestImageFn) {
    const raw = findBestImageFn(audioContext.chapter, entry.verseStart);
    if (raw && imgProxyFn) {
      imageUrl = imgProxyFn(raw, 600);
    }
  }

  playerCardInfo = { title, imageUrl, langLabel: langLabel || playerCardInfo.langLabel };
}

// ── Secondary timing lookup ──

function getSecondaryTiming(entry: VerseEntry): { startTime: number; endTime: number } | null {
  if (!secondaryTimingMap || Object.keys(secondaryTimingMap).length === 0) return null;
  for (const [ref, times] of Object.entries(secondaryTimingMap)) {
    const colonIdx = ref.indexOf(":");
    const verseSpec = ref.substring(colonIdx + 1);
    const parts = verseSpec.split("-");
    const vs = parseInt(parts[0], 10);
    if (vs === entry.verseStart) {
      return { startTime: times[0], endTime: times[times.length - 1] };
    }
  }
  return null;
}

// ── Seek and play helper ──

function seekAndPlay(
  audioEl: HTMLAudioElement,
  currentSrc: string,
  url: string,
  startTime: number,
  setSrc: (s: string) => void,
) {
  if (currentSrc === url) {
    audioEl.currentTime = startTime;
    audioEl.play().catch(() => {});
  } else {
    setSrc(url);
    audioEl.src = url;
    audioEl.addEventListener("canplay", function onCanPlay() {
      audioEl.removeEventListener("canplay", onCanPlay);
      audioEl.currentTime = startTime;
      audioEl.play().catch(() => {});
    });
  }
}

// ── Timeupdate handlers (boundary detection) ──

function onPrimaryTimeUpdate() {
  if (audioPlayState !== "playing_primary") return;
  const entry = verseEntries[currentVerseIdx];
  if (!entry || !primaryAudio) return;
  if (entry.endTime > entry.startTime && primaryAudio.currentTime >= entry.endTime) {
    primaryAudio.pause();
    if (cachedSecondaryAudioUrl) {
      playSecondaryForVerse(currentVerseIdx);
    } else {
      advanceToNextVerse();
    }
  }
}

function onSecondaryTimeUpdate() {
  if (audioPlayState !== "playing_secondary") return;
  const entry = verseEntries[currentVerseIdx];
  if (!entry || !secondaryAudio) return;
  const secTiming = getSecondaryTiming(entry);
  if (secTiming && secondaryAudio.currentTime >= secTiming.endTime) {
    secondaryAudio.pause();
    advanceToNextVerse();
  }
}

// ── Public actions ──

export function playVerse(idx: number, enterFocusMode?: boolean) {
  if (idx >= verseEntries.length || !cachedPrimaryAudioUrl) {
    stopAll();
    return;
  }

  const { primaryAudio: pa } = getAudioElements();
  const entry = verseEntries[idx];

  currentVerseIdx = idx;
  audioPlayState = "playing_primary";
  pausedState = null;
  playerVisible = true;
  if (enterFocusMode) focusMode = true;

  updatePlayerCardInfo(idx, "primary");
  notify();

  seekAndPlay(pa, primaryAudioSrc, cachedPrimaryAudioUrl, entry.startTime, (s) => {
    primaryAudioSrc = s;
  });
}

function playSecondaryForVerse(idx: number) {
  const entry = verseEntries[idx];
  const secTiming = getSecondaryTiming(entry);

  if (!cachedSecondaryAudioUrl || !secTiming) {
    advanceToNextVerse();
    return;
  }

  const { secondaryAudio: sa } = getAudioElements();
  audioPlayState = "playing_secondary";
  updatePlayerCardInfo(idx, "secondary");
  notify();

  seekAndPlay(sa, secondaryAudioSrc, cachedSecondaryAudioUrl, secTiming.startTime, (s) => {
    secondaryAudioSrc = s;
  });
}

function advanceToNextVerse() {
  const nextIdx = currentVerseIdx + 1;
  if (nextIdx >= verseEntries.length) {
    stopAll();
    return;
  }
  playVerse(nextIdx);
  // scrollToVerse is handled by the page subscriber via notify()
}

export function stopAll() {
  const els = getAudioElements();
  els.primaryAudio.pause();
  els.secondaryAudio.pause();
  audioPlayState = "idle";
  pausedState = null;
  focusMode = false;
  playerVisible = false;
  notify();
}

export function pausePlayback() {
  const wasSecondary = audioPlayState === "playing_secondary";
  pausedState = { verseIdx: currentVerseIdx, wasSecondary };
  const els = getAudioElements();
  els.primaryAudio.pause();
  els.secondaryAudio.pause();
  audioPlayState = "idle";
  // playerVisible stays true when paused
  notify();
}

export function resumePlayback() {
  if (!pausedState) return;
  const els = getAudioElements();
  currentVerseIdx = pausedState.verseIdx;
  if (pausedState.wasSecondary && cachedSecondaryAudioUrl) {
    audioPlayState = "playing_secondary";
    els.secondaryAudio.play().catch(() => {});
  } else {
    audioPlayState = "playing_primary";
    els.primaryAudio.play().catch(() => {});
  }
  pausedState = null;
  notify();
}

/**
 * Set audio context for a chapter. Called by page scripts when entering a chapter.
 * Returns true if the same chapter was already playing/paused (state preserved).
 */
export function setAudioForChapter(params: {
  primaryCode: string;
  secondaryCode: string;
  book: string;
  chapter: number;
  bookImg: string;
  audioUrl: string;
  verseEntries: VerseEntry[];
  secondaryAudioUrl?: string;
  secondaryTimingMap?: Record<string, number[]>;
}): boolean {
  const isSameChapter =
    audioContext &&
    audioContext.primaryCode === params.primaryCode &&
    audioContext.secondaryCode === params.secondaryCode &&
    audioContext.book === params.book &&
    audioContext.chapter === params.chapter;

  // If playing a different chapter, stop it
  if (!isSameChapter && audioPlayState !== "idle") {
    stopAll();
  }

  audioContext = {
    primaryCode: params.primaryCode,
    secondaryCode: params.secondaryCode,
    book: params.book,
    chapter: params.chapter,
    bookImg: params.bookImg,
  };
  cachedPrimaryAudioUrl = params.audioUrl || "";
  verseEntries = params.verseEntries;
  cachedSecondaryAudioUrl = params.secondaryAudioUrl || "";
  secondaryTimingMap = params.secondaryTimingMap || {};

  // If returning to the same chapter that was playing/paused, preserve state
  if (isSameChapter && (audioPlayState !== "idle" || pausedState)) {
    return true;
  }

  return false;
}

// ── iOS audio unlock ──

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
let audioUnlocked = false;

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // Use a separate temporary Audio element to avoid interfering with playback
  const silent = new Audio(SILENT_WAV);
  silent.play().then(() => silent.remove()).catch(() => {});
}
