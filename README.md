# JSON-LD Schema Manager — Next.js add-on

Drops the JSON-LD Schema Manager renderer into a Next.js head built from any Sitecore Content SDK starter
kit, App Router or Pages Router.

JSON-LD Schema Manager compiles a schema.org document onto the datasource behind a `JSON-LD` rendering.
Sitecore puts that datasource on the page's layout, and this renderer reads the layout, fills the document in
and writes one `<script type="application/ld+json">` into the page **body**.

It is a drop-in, not a package: you copy two files into your head and own them from there. Neither has a
runtime dependency beyond React.

## What you copy

```
src/lib/jsonld/
├── jsonld.ts          the engine
└── JsonLdScript.tsx   the React component you place in your layout
```

Keep them side by side: `JsonLdScript.tsx` imports the engine as `'./jsonld'`. Everything else in this
repository is the smoke test.

## The one layout edit

Place the component once, after the body content, bound to the page's layout service data.

**App Router**, in the server component that renders the page:

```tsx
import { JsonLdScript } from '@/lib/jsonld/JsonLdScript';
import { readPageDates } from '@/lib/jsonld/jsonld';

export default async function Page( { params }: PageProps ) {
	const page = await client.getPage( params.path );
	if ( !page ) notFound();

	const dates = await readPageDates( page.layout, { contextId: process.env.SITECORE_EDGE_CONTEXT_ID ?? '' } );

	return (
		<>
			<Layout page={page} />

			<JsonLdScript layout={page.layout} dates={dates} />
		</>
	);
}
```

**Pages Router**, in `src/components/Layout.tsx`, with `dates` read by `readPageDates` in
`getStaticProps` or `getServerSideProps` beside the layout fetch and passed down as a prop:

```tsx
import { JsonLdScript } from 'lib/jsonld/JsonLdScript';

const Layout = ( { layoutData, dates }: LayoutProps ): JSX.Element => (
	<>
		{/* your head, header, placeholders and footer */}

		<JsonLdScript layout={layoutData} dates={dates} />
	</>
);
```

`getPage` returns a `Page`; the layout service data is its `layout` property. Passing the `Page` itself
raises no error, but the engine finds no route and renders nothing.

There is no component to register in the component map and no site configuration: the site root and the
default language arrive on the layout.

## Page dates

The page's created and updated dates are the one thing the layout cannot carry, so `readPageDates` reads
them from Experience Edge with the context id the head already has. It asks only when a rendering on the
page uses a date, holds the answer five minutes, and gives `null` after a failure or two seconds, in which
case the page still emits without `datePublished` and `dateModified`. Call it on the server so the context
id never reaches the browser.

## Editing mode

In the Pages editor the component emits no script and shows an inline `{ } JSON-LD` chip with the size of
what the published page carries. Its outer element has `class="jsonld-marker"`.

## Contract

This renderer reads contract **2**: the datasource carries `jsonTemplate`, `references`, `jlsmSiteRoot`,
`jlsmDefaultLanguage` and `jlsmContract`. A datasource on another contract emits nothing and logs one
warning when you pass `logger={consoleLogger}`. Upgrade the app, republish every graph, then copy the new
files here.

## Checking it

```
npm install
npm test
npm run typecheck
```

On a published page, view the source: there should be exactly one `application/ld+json` script, in the body,
with `data-source` naming JSON-LD Schema Manager, and its `@graph` should hold one node per entity.

## Licence

MIT. See `LICENSE`.
