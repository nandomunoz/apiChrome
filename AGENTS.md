# AGENTS.md

Instructions for AI coding agents working in this repository. The visual language is in [.ai/design.md](.ai/design.md); read it before touching any style or layout.

## What this is

Chrome Local AI: 15 demos of Chrome's built-in AI APIs (Gemini Nano). A static Astro site, bilingual (`en`, `es`), published on GitHub Pages under the base path `/apiChrome`. Everything runs in the visitor's browser: there is no server and no endpoint, because the models only exist in Chrome.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at `http://localhost:4321/apiChrome/` |
| `npm run build` | Static build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` (TypeScript 7 native compiler) |
| `npm test` | Vitest, tests in `tests/` |
| `npm run check` | `luz-check src --ext .astro`: lints the Luz usage in the pages |

Before saying a change is done, run `npm run typecheck`, `npm test` and `npm run check`, and `npm run build` if you touched pages, layouts or styles. Do not run `luz-check` on `dist`.

## Stack and decisions that are not obvious from the code

- **Astro 6.4.8**, not 7: Astro 7 needs a newer Node than this machine has.
- **TypeScript 7.0.2** (stable). Do not bump it to a beta. There is no `@astrojs/check`: it needs the classic TypeScript API, which TS 7 does not expose. For that reason page scripts live in `src/scripts/*.ts`, where `tsc` checks them; the frontmatter of `.astro` files is not type-checked, so keep it simple.
- **Luz DS 0.3.0** (`@luz-ds/*`) is the component and token system. Use its classes (`luz-btn`, `luz-card`, `luz-table`, `luz-alert`, `luz-tag`, `luz-faq`, objects `o-stack`, `o-row`, `o-grid`) and its tokens (`--luz-*`) before writing anything of your own.
- **Vite 8 warning** on start ("Astro requires Vite 7") is known and harmless.

## Layout of the repository

```
src/
  pages/[lang]/*.astro   one page per demo; index.astro is the home
  pages/index.astro      redirects to the saved or browser language
  layouts/AppLayout.astro  header, navigation, footer, theme and language controls
  components/            DemoShell (page header + guide), CompatCheck, RunBar, Output, HeroArt...
  scripts/*.ts           the browser code of each page (one file per demo, plus layout.ts and status.ts)
  lib/ui.ts              shared UI helpers: runner, status tags, streaming output
  lib/ai-engine-local/   the engine over Chrome's built-in APIs (adapters, tasks, cache, streaming)
  data/                  demos list, languages, samples
  i18n/                  en.ts, es.ts (interface texts), guides.ts (long guide texts), server.ts, client.ts
  styles/app.css         the only stylesheet of the app
tests/                   engine, chunking, compat and i18n tests
```

## Rules

1. **Two languages, always.** Every visible text goes in `src/i18n/en.ts` and `src/i18n/es.ts` (same shape: the Spanish file is typed as `Messages`), or in `guides.ts` for the long guide texts. Never hard-code a user-facing string in a page, component or script. `tests/i18n.test.ts` checks both languages match.
2. **Luz tokens only.** In `app.css` use `--luz-*` tokens and the `--bp-*` variables defined there. No hard-coded colors outside the palette blocks at the top of that file, and no inline `style=` attributes in `.astro` files.
3. **No emojis** anywhere: code, copy, comments or commit messages. Icons are inline SVG that use `currentcolor`.
4. **Accessible by default.** Keep the skip link, landmarks, visible focus, `aria-live` on results, and contrast in every color mode (light, dark, high contrast). Motion must respect `prefers-reduced-motion`.
5. **Responsive.** Check every layout change at 390 px wide and at desktop width. No horizontal page scroll.
6. **Demo pages follow one pattern:** `AppLayout` > `DemoShell` (header and guide) > `RunBar` and `Output` > a script in `src/scripts/` started with `onDemo(slug, ...)`. The client router (`ClientRouter`) swaps pages, so a script must clean up in the function it returns.
7. **Data stays on the device.** Never add a network call that sends what the user types. External links open normal pages only.
8. A demo's maturity (`stable`, `experimental`, `deprecated`) and its `requires` and `uses` lists live in `src/data/demos.ts`; the UI reads them from there.

## Adding a demo

1. Add the entry to `DEMOS` in `src/data/demos.ts` (group, `uses`, `requires`, `maturity`).
2. Add its title, summary, `what`, `how` and optional `tip` for both languages in `src/i18n/guides.ts`, and any interface strings in `en.ts` and `es.ts`.
3. Create `src/pages/[lang]/<slug>.astro` and `src/scripts/<slug>.ts`.
4. Run the commands above.

## Git

Commit, pull and fetch are fine. **Never push, and never change GitHub settings, until the user says so.** Use semantic commit messages (`feat:`, `fix:`, `docs:`, `refactor:`).
