# Duo Bibel Wiki

Bible-based language learning platform. Learn any of 700+ languages from 1,700+ mother-tongue languages using New Testament text with synchronized audio and interactive exercises.

## How it works

1. Choose a primary language (with audio) to learn
2. Pick your mother-tongue language as reference
3. Browse chapters in the accordion chapter picker
4. Read Bible verses side-by-side with synchronized audio playback
5. Practice with interactive exercises: listen & reveal, word ordering, fill-the-gap, sentence builder
6. Use the listen page for continuous alternating-language audio playback

## Setup

```bash
pnpm install
cp .env.example .env
```

Add your [Digital Bible Platform](https://4.dbt.io/) API key to `.env`.

## Development

```bash
pnpm dev
```

Note: Netlify Image CDN (`/.netlify/images`) is only available on deployed Netlify sites. During local development, images will 404 through the proxy path.

## Build

```bash
pnpm build
```

## Generated Files

Two JSON files in `src/generated/` are derived from source data by build scripts:

| File | Script | Source | Git status |
|---|---|---|---|
| `image-index.json` | `pnpm build-image-index` | `assets/john-pics/` (gitignored) | **Committed** |
| `story-locales.json` | `pnpm build-story-locales` | `src/data/templates/John/` | **Gitignored** |

- **`image-index.json`** maps verse numbers to available image filenames. It must be committed because its source (`assets/john-pics/`) is gitignored and not available on Netlify. Regenerate it locally when images change: `pnpm build-image-index`
- **`story-locales.json`** contains localized story titles, descriptions, and section headers converted from TOML. It is generated automatically during Netlify builds (see `netlify.toml` build command). Regenerate locally with: `pnpm build-story-locales`

## Images

Illustration images are served from `bibel.wiki` and not included in this repository. On production (Netlify), images are proxied through Netlify Image CDN for automatic resizing and format optimization. The remote domain is whitelisted in `netlify.toml` under `[images]`.

## Project Structure

```
src/
  pages/
    index.astro                        # Homepage with language selector
    [lang].astro                       # Secondary language picker
    [lang]/[lang2].astro               # Redirects to chapter picker
    [lang]/[lang2]/[book]/
      index.astro                      # Chapter picker (accordion layout)
      [chapter]/
        index.astro                    # Exercises page
        listen.astro                   # Listen page (audio player + verse list)
  layouts/Layout.astro                 # Base HTML template
  utils/
    chapterData.ts                     # Shared server-side data loading
  data/
    ALL-langs-compact.json             # Language metadata
    ALL-langs-mini.json                # Minimal language index
    ALL-langs-data/nt/                 # Bible text and timecode data
    templates/                         # Story templates and locale TOML files
  generated/                           # Derived files (see "Generated Files" above)
    image-index.json                   # Verse-to-image mapping (committed)
    story-locales.json                 # Localized story data (gitignored, built on Netlify)
scripts/
  build-image-index.js                 # Generates image-index.json from assets/
  build-story-locales.js               # Generates story-locales.json from templates/
```

## Tech Stack

- [Astro](https://astro.build/) 5 / TypeScript
- [Netlify](https://www.netlify.com/) for deployment (with Image CDN)
- [smol-toml](https://github.com/nicolo-ribaudo/smol-toml) for TOML parsing

## License

MIT - see [LICENSE](LICENSE).
