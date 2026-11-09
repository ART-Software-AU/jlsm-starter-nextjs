import { JSX } from 'react';
import { ComponentRendering, GetComponentServerProps, LayoutServiceData, useComponentProps, useSitecore } from '@sitecore-content-sdk/nextjs';

import { JsonLdRendering, PageItemDates, readPageDates } from 'lib/jsonld/jsonld';
import { JsonLdScript } from 'lib/jsonld/JsonLdScript';

interface JsonLdServerProps {
	dates: PageItemDates | null;
}

function writesThePage( layout: LayoutServiceData, rendering: ComponentRendering ): boolean {
	return JsonLdRendering.findAll( layout )[0]?.uid === rendering.uid;
}

/** Reads the page's dates in `getStaticProps` or `getServerSideProps`, so the Edge context id stays on the server. */
export const getComponentServerProps: GetComponentServerProps = async ( rendering, layoutData ): Promise<JsonLdServerProps> => ( {
	dates: writesThePage( layoutData, rendering ) ? await readPageDates( layoutData, { contextId: process.env.SITECORE_EDGE_CONTEXT_ID ?? '' } ) : null
} );

/**
 * The `JSON-LD` rendering. The first one on the page writes the script holding every JSON-LD rendering on
 * it; the others render nothing, so the page carries one script whatever number of graphs it has.
 */
const JsonLd = ( { rendering }: { rendering: ComponentRendering } ): JSX.Element | null => {
	const { page } = useSitecore();
	const serverProps = useComponentProps<JsonLdServerProps>( rendering.uid );

	if ( !page || !writesThePage( page.layout, rendering ) ) return null;

	return <JsonLdScript layout={page.layout} dates={serverProps?.dates} />;
};

export default JsonLd;
