# Deployment notes

The site builds to plain static files. There is no server component, no
database, no build step on the host, and no Node runtime requirement in
production.

---

## Build

```bash
npm ci
```

```bash
npm run build
```

Output lands in `dist/`:

```
dist/
├── index.html
├── 404.html
├── favicon.svg
├── fallback/hero-poster.svg
├── social/og-dark-lattice.jpg
└── assets/
    ├── style-*.css
    ├── main-*.js
    ├── motion-*.js
    └── three-*.js
```

Everything in `dist/` is content-hashed except the HTML and the files
copied from `public/`.

---

## GoDaddy cPanel

1. `npm run build` locally.
2. Zip the **contents** of `dist/` — not the folder itself.
3. cPanel → **File Manager** → `public_html`.
4. Upload the zip, then **Extract**.
5. Delete the zip.

`public_html/index.html` must be at the root of the domain, with
`assets/` beside it.

The build uses `base: './'`, so relative asset paths work whether the
site sits at the domain root or in a subdirectory
(`public_html/site/`). No configuration change is needed to move it.

### 404 page

cPanel does not automatically use `404.html`. Add this to
`public_html/.htaccess`:

```apache
ErrorDocument 404 /404.html
```

If the site is deployed into a subdirectory, use the full path from the
domain root instead, e.g. `ErrorDocument 404 /site/404.html`.

---

## Recommended `.htaccess`

Optional but worth adding — long-lived caching for the hashed assets,
short caching for the HTML, and compression.

```apache
ErrorDocument 404 /404.html

# Compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript
  AddOutputFilterByType DEFLATE image/svg+xml application/json
</IfModule>

# Hashed assets never change under the same name.
<IfModule mod_expires.c>
  ExpiresActive On
  <FilesMatch "\.(js|css|woff2)$">
    ExpiresDefault "access plus 1 year"
    Header set Cache-Control "public, immutable"
  </FilesMatch>
  <FilesMatch "\.(svg|jpg|png|webp)$">
    ExpiresDefault "access plus 30 days"
  </FilesMatch>
  <FilesMatch "\.html$">
    ExpiresDefault "access plus 5 minutes"
  </FilesMatch>
</IfModule>

# Correct type for the poster and favicon.
AddType image/svg+xml .svg
```

Do **not** cache `index.html` aggressively — it carries the references to
the hashed asset filenames.

---

## HTTPS

Enable AutoSSL in cPanel and force HTTPS:

```apache
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

The canonical URL and Open Graph tags in `index.html` are absolute and
point at `https://darklattice.co.uk/`. Update them if the domain changes
— they are the only hard-coded absolute URLs in the build.

---

## Other hosts

Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront and Vercel all
work with no changes.

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 20 or later

GitHub Pages serves `404.html` automatically. Netlify and Cloudflare
Pages need a `_redirects` file only if you later add routes; a single
page needs nothing.

---

## Fonts

`index.html` loads Space Grotesk, Instrument Serif and IBM Plex Mono from
Google Fonts, with `preconnect` and `display=swap`.

To make the deployment fully origin-independent — worth doing if the
audience may be behind a firewall that blocks Google, or if you want to
remove the third-party request entirely:

1. Download the WOFF2 files for the weights in use (Space Grotesk 400/500,
   Instrument Serif 400 + italic, IBM Plex Mono 400).
2. Put them in `public/fonts/`.
3. Replace the `<link>` tags in `index.html` with `@font-face` rules in
   `src/styles/typography.css`, using `font-display: swap`.

The font stacks in `tokens.css` already list system fallbacks, so a
blocked or slow font load degrades to a readable page rather than
invisible text.

---

## Verifying a deployment

After upload, check in order:

1. **Hero renders 3D.** If it shows the flat poster instead, WebGL2 is
   unavailable — expected on very old devices, and the fallback is by
   design. Check the browser console for `[dark-lattice] 3D disabled`.
2. **Assets 200.** A 404 on `assets/three-*.js` means the folder was
   uploaded one level too deep.
3. **`/404.html`** returns the styled page, not the host default.
4. **Evidence table** — open "View cross-engine evidence" and confirm
   eleven rows.
5. **Print preview** of the page includes the evidence table.
6. **Mobile at 360px** — no horizontal scrolling.

The full automated pass can be run against the live URL:

```bash
node tools/capture.mjs https://darklattice.co.uk captures-live
```

---

## Updating content

Factual copy lives in two places that must stay in agreement:

- `index.html` — what ships and what a no-JS visitor reads.
- `src/content/evidence.ts` — the checked record, with sources.

Edit both. `npm run dev` prints
`[dark-lattice] evidence integrity: OK` in the console when they match,
and lists every divergence when they do not. That check does not run in
production builds, so do not rely on it after deploying — run `dev` once
after any copy change.
