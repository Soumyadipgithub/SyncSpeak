# SyncSpeak — Marketing site

Source for [syncspeak.pages.dev](https://syncspeak.pages.dev).

Built with [Astro](https://astro.build) + MDX. Zero client-side framework —
ships ~2 KB of JavaScript for the whole site. Static HTML, deployed to
Cloudflare Pages, rebuilt on every push to `main` and preview-deployed on
every PR to `develop`.

## Local dev

```bash
cd website
npm install
npm run dev       # http://localhost:4321
npm run build     # outputs to dist/
npm run preview   # serve the production build
```

## Structure

```
website/
├── astro.config.mjs                # MDX + sitemap integrations, site URL
├── src/
│   ├── layouts/BaseLayout.astro    # <head>, SEO, Organization JSON-LD, Nav + Footer
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── HeroTerminal.astro      # Vanilla-JS Liquid Glass demo (no React)
│   │   └── DownloadButton.astro    # OS-detecting, build-time GitHub Releases fetch
│   ├── pages/
│   │   ├── index.astro             # Home
│   │   ├── features.astro
│   │   ├── how-it-works.astro      # + HowTo JSON-LD
│   │   ├── download.astro          # Full release asset table
│   │   ├── developers.astro
│   │   ├── docs.astro              # Index linking to markdown docs on GitHub
│   │   ├── faq.astro               # + FAQPage JSON-LD
│   │   ├── privacy.astro
│   │   └── 404.astro
│   └── styles/
│       ├── tokens.css              # Liquid Glass tokens — ported 1:1 from the app
│       └── global.css              # Reset + base + shared glass components
└── public/
    ├── robots.txt                  # Explicitly allows AI crawlers
    ├── llms.txt                    # AI-SEO index per llmstxt.org
    └── llms-full.txt               # Plain-text dump of every page
```

## Deploy

Cloudflare Pages, production branch = `main`:

- Framework preset: **Astro**
- Build command: `npm run build`
- Build output: `dist`
- Root directory: `website`

PRs to `develop` receive preview URLs automatically.

## Design rule

The site's visual DNA stays in lockstep with the Tauri app. If a token changes
in `src/renderer/styles/globals.css`, mirror the change in
`website/src/styles/tokens.css`. Do not invent new tokens on the website — add
them to the app first.
