// ── Audio Store ──
// Singleton audio state that persists across Astro page transitions.
// Hybrid playback: HTML <audio> for verse-level (iOS-compatible),
// Web Audio API for word/exercise-level (sample-accurate).
// Imported once by Layout.astro's module script and exposed as window.__audioStore.

// ── Types ──

export interface VerseEntry {
  verseStart: number;
  verseEnd: number;
  startTime: number;
  endTime: number;
}

export type AudioPlayState = "idle" | "playing_primary" | "playing_secondary";

export interface ChapterAudioContext {
  learnCode: string;
  mtCode: string;
  book: string;
  chapter: number;
  bookImg: string;
}

export interface PausedState {
  verseIdx: number;
  wasSecondary: boolean;
  pausedAt: number; // currentTime when paused
}

// ── State (module-level singletons) ──

let audioPlayState: AudioPlayState = "idle";
let chapterCtx: ChapterAudioContext | null = null;
let currentVerseIdx = 0;
let verseEntries: VerseEntry[] = [];
let mtTimingMap: Record<string, number[]> = {};
let cachedPrimaryAudioUrl = "";
let cachedMtAudioUrl = "";
let pausedState: PausedState | null = null;
let playerVisible = false;
let focusMode = false;

// ── HTML Audio elements (reused for verse-level playback) ──

let primaryAudio: HTMLAudioElement | null = null;
let secondaryAudio: HTMLAudioElement | null = null;
let segmentEndTimer: number | null = null;

// ── Web Audio API state (used for sample-accurate word/exercise playback) ──

let ctx: AudioContext | null = null;
let waBufferUrl = "";
let waBuffer: AudioBuffer | null = null;
let waBufferLoading: Promise<AudioBuffer | null> | null = null;
let waSecBufferUrl = "";
let waSecBuffer: AudioBuffer | null = null;
let waSecBufferLoading: Promise<AudioBuffer | null> | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

async function ensureWABuffer(
  url: string,
  which: "primary" | "secondary",
): Promise<AudioBuffer | null> {
  if (!url) return null;
  if (which === "primary" && waBuffer && waBufferUrl === url) return waBuffer;
  if (which === "secondary" && waSecBuffer && waSecBufferUrl === url)
    return waSecBuffer;

  // If already loading, wait for the in-flight request instead of returning null
  if (which === "primary" && waBufferLoading) return waBufferLoading;
  if (which === "secondary" && waSecBufferLoading) return waSecBufferLoading;

  const loadPromise = (async (): Promise<AudioBuffer | null> => {
    try {
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const decoded = await getCtx().decodeAudioData(arrayBuf);
      if (which === "primary") {
        waBuffer = decoded;
        waBufferUrl = url;
      } else {
        waSecBuffer = decoded;
        waSecBufferUrl = url;
      }
      return decoded;
    } catch {
      return null;
    } finally {
      if (which === "primary") waBufferLoading = null;
      else waSecBufferLoading = null;
    }
  })();

  if (which === "primary") waBufferLoading = loadPromise;
  else waSecBufferLoading = loadPromise;

  return loadPromise;
}

function getPrimaryAudio(): HTMLAudioElement {
  if (!primaryAudio) {
    primaryAudio = new Audio();
    primaryAudio.preload = "auto";
  }
  return primaryAudio;
}

function getSecondaryAudio(): HTMLAudioElement {
  if (!secondaryAudio) {
    secondaryAudio = new Audio();
    secondaryAudio.preload = "auto";
  }
  return secondaryAudio;
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
    audioContext: chapterCtx,
    currentVerseIdx,
    verseEntries,
    pausedState,
    playerVisible,
    focusMode,
    cachedPrimaryAudioUrl,
    cachedMtAudioUrl,
  };
}

export function setFocusMode(active: boolean) {
  focusMode = active;
  notify();
}

// ── Image callbacks (registered by each page) ──

let findBestImageFn: ((chapter: number, verse: number) => string | null) | null =
  null;
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

let playerCardInfo: PlayerCardInfo = {
  title: "\u2014",
  imageUrl: null,
  langLabel: "",
};

export function getPlayerCardInfo(): PlayerCardInfo {
  return playerCardInfo;
}

function updatePlayerCardInfo(idx: number, langLabel?: string) {
  const entry = verseEntries[idx];
  if (!chapterCtx || !entry) return;

  const verseDisplay =
    entry.verseStart === entry.verseEnd
      ? String(entry.verseStart)
      : `${entry.verseStart}-${entry.verseEnd}`;

  const title = `${chapterCtx.chapter}:${verseDisplay}`;

  let imageUrl: string | null = null;
  if (findBestImageFn) {
    const raw = findBestImageFn(chapterCtx.chapter, entry.verseStart);
    if (raw && imgProxyFn) {
      imageUrl = imgProxyFn(raw, 600);
    }
  }

  playerCardInfo = {
    title,
    imageUrl,
    langLabel: langLabel || playerCardInfo.langLabel,
  };
}

// ── MT timing lookup ──

function getMtTiming(
  entry: VerseEntry,
): { startTime: number; endTime: number } | null {
  if (!mtTimingMap || Object.keys(mtTimingMap).length === 0)
    return null;
  for (const [ref, times] of Object.entries(mtTimingMap)) {
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

// ── Core playback: play a segment from an HTML audio element ──

let activeAudioEl: HTMLAudioElement | null = null;

function stopCurrentPlayback() {
  if (segmentEndTimer !== null) {
    clearTimeout(segmentEndTimer);
    segmentEndTimer = null;
  }
  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl.ontimeupdate = null;
    activeAudioEl = null;
  }
}

function playSegment(
  audio: HTMLAudioElement,
  url: string,
  startTime: number,
  endTime: number,
  onEnded: () => void,
) {
  stopCurrentPlayback();
  activeAudioEl = audio;

  const duration = Math.max(endTime - startTime, 0.01);

  function beginPlay() {
    if (activeAudioEl !== audio) return;

    // Use timeupdate to detect when we've reached endTime
    audio.ontimeupdate = () => {
      if (audio.currentTime >= endTime - 0.05) {
        audio.ontimeupdate = null;
        audio.pause();
        if (activeAudioEl === audio) {
          activeAudioEl = null;
        }
        onEnded();
      }
    };

    // Fallback timer
    segmentEndTimer = window.setTimeout(() => {
      segmentEndTimer = null;
      if (activeAudioEl === audio) {
        audio.ontimeupdate = null;
        audio.pause();
        activeAudioEl = null;
        onEnded();
      }
    }, duration * 1000 + 500);

    audio.play().catch(() => {
      if (activeAudioEl === audio) {
        activeAudioEl = null;
      }
    });
  }

  function startPlayback() {
    if (activeAudioEl !== audio) return;

    audio.currentTime = startTime;
    // Wait for seek to complete before playing to avoid brief playback from pos 0
    if (audio.seeking) {
      audio.addEventListener("seeked", () => beginPlay(), { once: true });
    } else {
      beginPlay();
    }
  }

  // If source needs to change, wait for it to load before seeking/playing
  if (audio.src !== url) {
    audio.src = url;
    audio.addEventListener(
      "canplay",
      () => startPlayback(),
      { once: true },
    );
  } else {
    startPlayback();
  }
}

// ── Verse playback ──

function onPrimarySegmentEnded() {
  if (audioPlayState !== "playing_primary") return;

  if (cachedMtAudioUrl) {
    playMtForVerse(currentVerseIdx);
  } else {
    advanceToNextVerse();
  }
}

function onMtSegmentEnded() {
  if (audioPlayState !== "playing_secondary") return;
  advanceToNextVerse();
}

export function playVerse(idx: number, enterFocusMode?: boolean) {
  if (idx >= verseEntries.length || !cachedPrimaryAudioUrl) {
    stopAll();
    return;
  }

  const entry = verseEntries[idx];
  currentVerseIdx = idx;
  audioPlayState = "playing_primary";
  pausedState = null;
  playerVisible = true;
  if (enterFocusMode) focusMode = true;

  updatePlayerCardInfo(idx, "learn");
  notify();

  const audio = getPrimaryAudio();
  playSegment(
    audio,
    cachedPrimaryAudioUrl,
    entry.startTime,
    entry.endTime,
    onPrimarySegmentEnded,
  );
}

function playMtForVerse(idx: number) {
  const entry = verseEntries[idx];
  const mtTiming = getMtTiming(entry);
  if (!cachedMtAudioUrl || !mtTiming) {
    advanceToNextVerse();
    return;
  }

  audioPlayState = "playing_secondary";
  updatePlayerCardInfo(idx, "mt");
  notify();

  const audio = getSecondaryAudio();
  playSegment(
    audio,
    cachedMtAudioUrl,
    mtTiming.startTime,
    mtTiming.endTime,
    onMtSegmentEnded,
  );
}

function advanceToNextVerse() {
  const nextIdx = currentVerseIdx + 1;
  if (nextIdx >= verseEntries.length) {
    stopAll();
    return;
  }
  playVerse(nextIdx);
}

export function stopAll() {
  stopCurrentPlayback();
  audioPlayState = "idle";
  pausedState = null;
  focusMode = false;
  playerVisible = false;
  notify();
}

export function pausePlayback() {
  const wasSecondary = audioPlayState === "playing_secondary";
  const pausedAt = activeAudioEl ? activeAudioEl.currentTime : 0;

  pausedState = { verseIdx: currentVerseIdx, wasSecondary, pausedAt };
  stopCurrentPlayback();
  audioPlayState = "idle";
  // playerVisible stays true when paused
  notify();
}

export function resumePlayback() {
  if (!pausedState) return;

  const { verseIdx, wasSecondary, pausedAt } = pausedState;
  const entry = verseEntries[verseIdx];
  if (!entry) return;

  currentVerseIdx = verseIdx;
  pausedState = null;

  if (wasSecondary && cachedMtAudioUrl) {
    const mtTiming = getMtTiming(entry);
    if (mtTiming) {
      audioPlayState = "playing_secondary";
      notify();
      const audio = getSecondaryAudio();
      playSegment(
        audio,
        cachedMtAudioUrl,
        pausedAt,
        mtTiming.endTime,
        onMtSegmentEnded,
      );
    }
  } else {
    audioPlayState = "playing_primary";
    notify();
    const audio = getPrimaryAudio();
    playSegment(
      audio,
      cachedPrimaryAudioUrl,
      pausedAt,
      entry.endTime,
      onPrimarySegmentEnded,
    );
  }
}

// ── Word-level playback (Web Audio API for sample accuracy) ──

let wordSource: AudioBufferSourceNode | null = null;
let wordEndTimer: number | null = null;

export function stopWordAudio() {
  if (wordEndTimer !== null) {
    clearTimeout(wordEndTimer);
    wordEndTimer = null;
  }
  if (wordSource) {
    try {
      wordSource.stop();
    } catch {
      /* already stopped */
    }
    wordSource.disconnect();
    wordSource = null;
  }
}

export async function playWordAudio(
  wordTimings: (number | null)[],
  wordIdx: number,
  audioUrl: string,
  verseEndTime: number,
  onEnded?: () => void,
): Promise<boolean> {
  if (!wordTimings || wordIdx < 0 || wordIdx >= wordTimings.length) return false;

  const startTime = wordTimings[wordIdx];
  if (startTime === null || startTime === undefined) return false;

  // Find end time: next non-null word start, or verse end
  let nextWordStart = verseEndTime;
  for (let i = wordIdx + 1; i < wordTimings.length; i++) {
    if (wordTimings[i] !== null) {
      nextWordStart = wordTimings[i]!;
      break;
    }
  }
  // Trim: play up to 80% of the gap to the next word (cuts trailing silence),
  // but ensure at least MIN_WORD_DURATION for very short words
  const rawGap = nextWordStart - startTime;
  const MIN_WORD_DURATION = 0.08;
  const MAX_WORD_EXTRA = 0.15; // max silence after speech to include
  const endTime =
    nextWordStart < verseEndTime
      ? startTime + Math.max(rawGap - MAX_WORD_EXTRA, rawGap * 0.8)
      : nextWordStart; // last word: play to verse end
  const duration = Math.max(endTime - startTime, MIN_WORD_DURATION);

  stopWordAudio();

  const buffer = await ensureWABuffer(audioUrl, "primary");
  if (!buffer) return false;

  const audioCtx = getCtx();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  wordSource = source;

  source.start(0, startTime, duration);

  let ended = false;
  const handleEnd = () => {
    if (ended) return;
    ended = true;
    if (wordEndTimer !== null) {
      clearTimeout(wordEndTimer);
      wordEndTimer = null;
    }
    if (wordSource === source) {
      wordSource = null;
    }
    onEnded?.();
  };

  source.onended = handleEnd;
  wordEndTimer = window.setTimeout(handleEnd, duration * 1000 + 100);

  return true;
}

// ── Exercise playback (Web Audio API for sample accuracy) ──

let exerciseSource: AudioBufferSourceNode | null = null;
let exerciseEndTimer: number | null = null;
let exercisePlaying = false;

export function isExercisePlaying(): boolean {
  return exercisePlaying;
}

export function stopExerciseAudio() {
  if (exerciseEndTimer !== null) {
    clearTimeout(exerciseEndTimer);
    exerciseEndTimer = null;
  }
  if (exerciseSource) {
    try {
      exerciseSource.stop();
    } catch {
      /* already stopped */
    }
    exerciseSource.disconnect();
    exerciseSource = null;
  }
  exercisePlaying = false;
}

export async function playExerciseVerse(
  audioUrl: string,
  startTime: number,
  endTime: number,
  onEnded?: () => void,
): Promise<boolean> {
  stopExerciseAudio();
  stopWordAudio();

  // Pause mini player if active
  if (audioPlayState !== "idle") {
    pausePlayback();
  }

  const buffer = await ensureWABuffer(audioUrl, "primary");
  if (!buffer) return false;

  const audioCtx = getCtx();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  exerciseSource = source;
  exercisePlaying = true;

  const duration = Math.max(endTime - startTime, 0.01);
  source.start(0, startTime, duration);

  let ended = false;
  const handleEnd = () => {
    if (ended) return;
    ended = true;
    if (exerciseEndTimer !== null) {
      clearTimeout(exerciseEndTimer);
      exerciseEndTimer = null;
    }
    if (exerciseSource === source) {
      exerciseSource = null;
      exercisePlaying = false;
    }
    onEnded?.();
  };

  source.onended = handleEnd;
  exerciseEndTimer = window.setTimeout(handleEnd, duration * 1000 + 100);

  return true;
}

export async function playExerciseSecondary(
  audioUrl: string,
  startTime: number,
  endTime: number,
  onEnded?: () => void,
): Promise<boolean> {
  stopExerciseAudio();

  const buffer = await ensureWABuffer(audioUrl, "secondary");
  if (!buffer) return false;

  const audioCtx = getCtx();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  exerciseSource = source;
  exercisePlaying = true;

  const duration = Math.max(endTime - startTime, 0.01);
  source.start(0, startTime, duration);

  let ended = false;
  const handleEnd = () => {
    if (ended) return;
    ended = true;
    if (exerciseEndTimer !== null) {
      clearTimeout(exerciseEndTimer);
      exerciseEndTimer = null;
    }
    if (exerciseSource === source) {
      exerciseSource = null;
      exercisePlaying = false;
    }
    onEnded?.();
  };

  source.onended = handleEnd;
  exerciseEndTimer = window.setTimeout(handleEnd, duration * 1000 + 100);

  return true;
}

// ── Preload ──

export function preloadBuffer(url: string, which: "primary" | "secondary") {
  // Preload HTML audio element (for verse playback)
  if (which === "primary") {
    const audio = getPrimaryAudio();
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
  } else {
    const audio = getSecondaryAudio();
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
  }
  // Also preload Web Audio buffer (for word/exercise playback)
  ensureWABuffer(url, which);
}

/**
 * Set audio context for a chapter. Called by page scripts when entering a chapter.
 * Returns true if the same chapter was already playing/paused (state preserved).
 */
export function setAudioForChapter(params: {
  learnCode: string;
  mtCode: string;
  book: string;
  chapter: number;
  bookImg: string;
  audioUrl: string;
  verseEntries: VerseEntry[];
  mtAudioUrl?: string;
  mtTimingMap?: Record<string, number[]>;
}): boolean {
  const isSameChapter =
    chapterCtx &&
    chapterCtx.learnCode === params.learnCode &&
    chapterCtx.mtCode === params.mtCode &&
    chapterCtx.book === params.book &&
    chapterCtx.chapter === params.chapter;

  // If playing a different chapter, stop it
  if (!isSameChapter && audioPlayState !== "idle") {
    stopAll();
  }

  chapterCtx = {
    learnCode: params.learnCode,
    mtCode: params.mtCode,
    book: params.book,
    chapter: params.chapter,
    bookImg: params.bookImg,
  };
  cachedPrimaryAudioUrl = params.audioUrl || "";
  verseEntries = params.verseEntries;
  cachedMtAudioUrl = params.mtAudioUrl || "";
  mtTimingMap = params.mtTimingMap || {};
  // If returning to the same chapter that was playing/paused, preserve state
  if (isSameChapter && (audioPlayState !== "idle" || pausedState)) {
    return true;
  }

  return false;
}

// ── iOS audio unlock ──
// Play a silent audio element on first user gesture to set iOS audio session.

let unlocked = false;

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;

  // Build a minimal silent WAV
  const sr = 44100;
  const n = 441;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);

  const blob = new Blob([buf], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  // Unlock ALL audio elements synchronously within the user gesture.
  // Each element needs its own .play() call in the gesture context.
  const primary = getPrimaryAudio();
  const secondary = getSecondaryAudio();

  primary.src = url;
  // Chain Web Audio context resume AFTER HTML audio play resolves.
  // On iOS, HTML audio.play() sets the audio session to "playback" mode,
  // which then allows Web Audio to produce sound (bypasses mute switch).
  // This matches the pattern proven by the green test button.
  primary
    .play()
    .then(() => {
      primary.pause();
      // Now that iOS audio session is active, resume Web Audio context
      return getCtx().resume();
    })
    .catch(() => {});

  secondary.src = url;
  secondary.play().then(() => secondary.pause()).catch(() => {});

  // Also create the AudioContext eagerly within the gesture (required by some browsers)
  getCtx();

  // Revoke the blob URL after a short delay.
  // Do NOT clear .src — it would race with playSegment if triggered on the same gesture.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 500);
}
