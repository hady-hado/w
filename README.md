# SOP Lab — website

Static site for the group, hosted free on GitHub Pages. No build step, no framework:
`index.html` loads `data/site.json` at runtime and renders the page.

**Arabic is the default language**; the header switch toggles العربية / FR / EN with no
reload, and flips the document direction (RTL ↔ LTR) with it.

```
index.html                 public page (Arabic defaults, JS fills the rest)
admin/index.html           admin panel — not linked from the site
assets/css/style.css       aurora + glass theme, logical properties for RTL
assets/css/admin.css       admin styling
assets/js/device.js        phone / tablet / desktop detection
assets/js/site.js          i18n + rendering
assets/js/admin.js         GitHub commit flow
data/site.json             all content, three languages
.github/workflows/pages.yml
```

## Page = a list of sections

`sections` in `data/site.json` is the page, in order. The admin panel adds,
duplicates, reorders and deletes them.

| type | what it renders | options |
|---|---|---|
| `hero` | brand headline, intro, two buttons | `layout: split \| centered`, `showVisual` |
| `products` | your product cards | `columns: 2–4`, heading |
| `text` | heading + paragraphs | `layout: plain \| facts`, body |
| `stats` | big numbers band | `items: [{value,label}]` |
| `faq` | accordion | `items: [{q,a}]` |
| `gallery` | image grid | `columns`, `images: [{src,alt}]` |
| `cta` | wide call-to-action | heading, body, button + link |
| `canvas` | freeform frame | `ratio`, `items: [{type,x,y,w,rotate,i18n}]` |
| `contact` | email, form, links | heading |

Text fields are per language (`section.i18n.ar.heading`, …). The `canvas` block
positions items as percentages of the frame, so it scales on phones instead of
breaking like a pixel-positioned builder would.

Theme tokens live in `brand.theme`: `accent` (hex), `radius` (px), `aurora`
(0–2 strength), `fonts` (`alexandria` | `plex` | `rubik`).

## Content model

Everything translatable lives under `i18n`, keyed `ar`, `fr`, `en`:

```json
"brand": { "name": "SOP Lab", "email": "…",
           "links": [ { "url": "…", "label": { "ar": "…", "fr": "…", "en": "…" } } ],
           "i18n": { "ar": { "tagline": "…", "about": "…" }, "fr": {...}, "en": {...} } }
"products": [ { "id": "counter", "glyph": "◧", "image": "", "status": "live", "url": "",
                "i18n": { "ar": { "name": "كاونتر", "tags": [...] }, "fr": {...}, "en": {...} } } ]
```

`products[].image` takes a screenshot URL (relative paths work, e.g.
`assets/img/counter.png`). Leave it empty and the card shows an abstract preview
instead, so the grid never looks broken.

`defaultLocale` sets the first language. Interface strings (buttons, status labels,
date format) live in the `UI` table at the top of `assets/js/site.js` — add a locale
there plus to `LOCALES` to support a fourth language.

Numerals are always Latin (`3`, `2026`, `14 novembre 2026`) — never Arabic-Indic.
Fonts: **Alexandria** for Arabic, **Inter** for Latin, both from Google Fonts.
The header is forced LTR, so the wordmark stays on the left and the language
switch on the right in every language.

## Publish it (once)

1. Create a repository on GitHub, e.g. `sop-lab-site`, and push this folder:

   ```bash
   cd 04-branding
   git init -b main
   git add .
   git commit -m "SOP Lab site"
   git remote add origin https://github.com/<you>/sop-lab-site.git
   git push -u origin main
   ```

2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   The included workflow deploys on every push to `main`.
3. Site URL: `https://<you>.github.io/sop-lab-site/`
   (name the repo `<you>.github.io` to serve at `https://<you>.github.io/` instead).

## Admin panel

There is **no link to it** anywhere on the public site. It lives at `/admin/` and can
only load or write anything once you paste a token.

1. Create a **fine-grained personal access token**: GitHub → Settings → Developer
   settings → Personal access tokens → Fine-grained tokens. Scope it to this one
   repository, **Repository permissions → Contents: Read and write**. Nothing else.
2. Open `/admin/`, paste the token — owner and repo auto-fill from the Pages URL —
   then **Connect & load**.
3. Pick a language in the content bar, edit, and **Save & publish**. That commits
   `data/site.json`; GitHub Pages republishes in about a minute and every visitor sees
   the new content.

The token is stored in that browser's `localStorage` only. To edit from another device,
paste the token there; press **Forget token** on a shared machine.

Note: hiding the link is cosmetic only. Anyone who guesses `/admin/` gets a form, but
without a valid token it cannot read or write anything. Real access control (a secret
path, an obfuscated entry, or a server-side proxy) is still to be added.

## Contact form

The form posts to `brand.formEndpoint`. With it empty the form falls back to
opening the visitor's mail app with the message pre-filled — it works out of the
box, and nothing is sent anywhere until you add an endpoint.

To receive submissions by email, create a form endpoint with a service that
accepts a plain HTML `POST` (Formspree, Web3Forms, Getform, Basin…), then paste
the endpoint into the admin panel's **Form endpoint** field (or `formEndpoint`
in `data/site.json`). No key or secret is stored in the page.

## Device detection

`assets/js/device.js` sets `html[data-device]` to `phone`, `tablet` or `desktop` from
the user agent, pointer type and viewport width, and fires `devicechange` on rotate or
resize. The stylesheet uses that attribute for the mobile layout, and heavy effects
(blur, parallax) back off on phones. No user-agent sniffing on the server, nothing
blocked — only layout and copy density change.

## Local preview

```bash
python -m http.server 4173
# http://localhost:4173/
```

The panel also runs without a repo or token: `http://localhost:4173/admin/?mock=1`
loads the local `data/site.json`, unlocks the full editor, and saves nothing.
Useful for trying sections, the canvas and the theme before publishing.

Serve over HTTP — `data/site.json` cannot be fetched from a `file://` page.
