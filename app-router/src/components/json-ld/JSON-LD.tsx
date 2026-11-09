import { JSX } from 'react';
import type { ComponentRendering, Page } from '@sitecore-content-sdk/nextjs';

import { JsonLdRendering, readPageDates } from 'lib/jsonld/jsonld';
import { JsonLdScript } from 'lib/jsonld/JsonLdScript';

interface JsonLdProps {
	rendering: ComponentRendering;
	page: Page;
}

/**
 * The `JSON-LD` rendering. The first one on the page writes the script holding every JSON-LD rendering on
 * it; the others render nothing, so the page carries one script whatever number of graphs it has.
 */
export default async function JsonLd( { rendering, page }: JsonLdProps ): Promise<JSX.Element | null> {
	if ( JsonLdRendering.findAll( page.layout )[0]?.uid !== rendering.uid ) return null;

	const dates = await readPageDates( page.layout, { contextId: process.env.SITECORE_EDGE_CONTEXT_ID ?? '' } );

	return <JsonLdScript layout={page.layout} dates={dates} />;
}
