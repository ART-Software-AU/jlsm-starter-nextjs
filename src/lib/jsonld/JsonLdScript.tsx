import * as React from 'react';

import { ATTRIBUTION, isEditing, JsonLdLogger, JsonLdPage, LayoutServiceData, PageItemDates, ScriptWriter } from './jsonld';

export interface JsonLdScriptProps {
	/** The layout service response for the page, as the Content SDK's `Page.layout` holds it. */
	layout: LayoutServiceData | null | undefined;

	/** Where the engine reports a component it emits nothing for. */
	logger?: JsonLdLogger;

	/** The page's dates, as `readPageDates( layout, { contextId } )` answers them. Without them a date token drops its key. */
	dates?: PageItemDates | null;
}

/**
 * The one `application/ld+json` script a page emits, holding every JSON-LD rendering on it in a single
 * `@graph`. In the Pages editor it shows the editing chip instead. Renders nothing when the page has no
 * JSON-LD to emit.
 */
export function JsonLdScript( { layout, logger, dates }: JsonLdScriptProps ): React.JSX.Element | null {
	const page = JsonLdPage.buildPage( layout, logger, dates ?? null );

	if ( isEditing( layout ) )
		return (
			<div className={ScriptWriter.CHIP_CLASS} style={styleOf( ScriptWriter.CHIP_STYLE )} title={ScriptWriter.CHIP_TITLE}>
				<span style={styleOf( ScriptWriter.CHIP_BADGE_STYLE )}>{ScriptWriter.CHIP_BADGE}</span>
				<span>{ScriptWriter.chipText( page )}</span>
			</div>
		);

	if ( page.isEmpty ) return null;

	return (
		<script
			type="application/ld+json"
			data-source={ATTRIBUTION}
			dangerouslySetInnerHTML={{ __html: page.scriptText }}
		/>
	);
}

function styleOf( css: string ): React.CSSProperties {
	const style: Record<string, string> = {};

	for ( const declaration of css.split( ';' ) ) {
		const colon = declaration.indexOf( ':' );

		if ( colon < 0 ) continue;

		const property = declaration.slice( 0, colon ).trim().replace( /-([a-z])/g, ( _, letter: string ) => letter.toUpperCase() );

		style[property] = declaration.slice( colon + 1 ).trim();
	}

	return style as React.CSSProperties;
}
