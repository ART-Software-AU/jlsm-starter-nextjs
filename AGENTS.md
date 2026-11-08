# Applying the JSON-LD renderer to a Next.js head

Instructions for an agent adding this renderer to a customer's Sitecore Content SDK Next.js head. Follow the
steps in order and change nothing else.

1. Copy `src/lib/jsonld/jsonld.ts` and `src/lib/jsonld/JsonLdScript.tsx` from this repository into the head's
   `src/lib/jsonld/` folder. Copy the bytes; do not retype either file, because `jsonld.ts` holds escape
   sequences that retyping corrupts.
2. Find where the head renders a page:
   - App Router: the server component that calls `client.getPage`, usually
     `src/app/[site]/[locale]/[[...path]]/page.tsx`.
   - Pages Router: `src/components/Layout.tsx`, and the page's `getStaticProps` or `getServerSideProps`.
3. Read the dates on the server with
   `readPageDates( page.layout, { contextId: process.env.SITECORE_EDGE_CONTEXT_ID ?? '' } )`. In the Pages
   Router, return the result as a prop and pass it down to the layout.
4. Render `<JsonLdScript layout={…} dates={…} />` exactly once per page, after the body content, where
   `layout` is the layout service data (`page.layout`, or `layoutData` in the Pages Router), never the `Page`.
5. Do not register `JSON-LD` in the component map, add site settings, or add a dependency.
6. Build the head. Then fetch a published page and confirm its HTML has exactly one
   `<script type="application/ld+json" data-source="…">` in the body.

The README has the code for each router.
