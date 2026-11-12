# spacecentre.co

Single-page site for spacecentre, a studio space on Centre Street (at Broome) in Manhattan.
The background photos in `public/images/` are of the studio.

## Hosting

Static site served from Cloudflare Workers (static assets). Config is in `wrangler.jsonc`.

```sh
npm install
npm run dev      # local preview at http://localhost:8787
npm run deploy   # publish to Cloudflare
```

Deploys go to `https://spacecentre.naveen-master.workers.dev` and, once the custom domains
are attached, to `spacecentre.co` and `www.spacecentre.co`.
