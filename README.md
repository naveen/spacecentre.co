# spacecentre.co

Single-page site for spacecentre. The name comes from a studio space on Centre Street
(at Broome) in Manhattan; the site is now a constellation mark drifting through
deep-space telescope images.

## How it works

Everything is static in `public/`, no build step.

- `index.html` holds the constellation "S" as inline SVG so it can draw itself on load.
- `style.css` runs the mark, wordmark and caption animations; `prefers-reduced-motion` turns them into a still.
- `main.js` renders the background in WebGL: each image is slowly pushed in and domain-warped, and
  a noise dissolve with chromatic aberration and star streaks carries it into the next one.
  Click, tap, space or the right arrow skip ahead. Browsers without WebGL get a plain crossfade.
- `space/` holds the images as 2560px WebP. They are Webb and Hubble releases from ESA
  (CC BY 4.0, credit NASA, ESA, CSA, STScI). To add one, download the `publicationjpg`
  version from esawebb.org or esahubble.org, convert with `cwebp -q 80 -resize 2560 0`,
  and add an entry to the `IMAGES` list at the top of `main.js`.
- `fonts/` self-hosts Syncopate 700 (OFL) for the wordmark.
- `icon/` has the constellation mark as SVG (dark and transparent) and as 512/1024px PNGs,
  alone and over four of the nebula images, for use as avatars elsewhere.

## Hosting

Served from Cloudflare Workers static assets. Config is in `wrangler.jsonc`.

```sh
npm install
npm run dev                 # local preview at http://localhost:8787
npx wrangler versions upload  # preview URL, does not touch the live site
npm run deploy              # publish to spacecentre.co
```
