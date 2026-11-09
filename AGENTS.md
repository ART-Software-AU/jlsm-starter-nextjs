# Applying the JSON-LD renderer to a Next.js head

Instructions for an agent adding this renderer to a customer's Sitecore Content SDK Next.js head. Follow the
steps in order and change nothing else.

1. Decide the router: a head with `src/app` uses the App Router; a head with `src/pages` uses the Pages Router.
2. In `src/Layout.tsx`, add a placeholder named `jlsm-jsonld` once, before `<header>`, in the same fragment as
   the header, main and footer placeholders (not the `mode.isDesignLibrary` branch):
   - App Router: `<AppPlaceholder page={page} componentMap={componentMap} name="jlsm-jsonld" rendering={route} />`
   - Pages Router: `<Placeholder name="jlsm-jsonld" rendering={route} />`
   Guard it with `route &&` like the other placeholders.
3. Copy `src/lib/jsonld/jsonld.ts` and `src/lib/jsonld/JsonLdScript.tsx` into the head's `src/lib/jsonld/`.
   Copy `app-router/src/components/json-ld/JSON-LD.tsx` (App Router) or
   `pages-router/src/components/json-ld/JSON-LD.tsx` (Pages Router) to the head's
   `src/components/json-ld/JSON-LD.tsx`. Copy the bytes; do not retype any file, because `jsonld.ts` holds
   escape sequences that retyping can corrupt. Do not rename `JSON-LD.tsx` as this is auto-registered in
   Sitecore during the onboarding sequence.
4. Run `npm run sitecore-tools:generate-map` (or `npm run dev`). Confirm `.sitecore/component-map.ts` has
   `['JSON-LD', { ...JSONLD }]`. If the head's scripts do not run `generate-map`, add
   `import * as JSONLD from 'src/components/json-ld/JSON-LD';` and that entry by hand. Do not add it to
   `component-map.client.ts`.
5. Confirm the map also has `PartialDesignDynamicPlaceholder`.
6. Add no Sitecore items, settings or dependencies: JLSM's Plugin Setup creates the rendering and the
   placeholder. Do not rename the `JSON-LD` rendering or its component name.
7. Build the head. Then fetch a published page that carries a JLSM graph and confirm its HTML has exactly one
   `<script type="application/ld+json" data-source="…">` in the body.

The README has the code for each router.
