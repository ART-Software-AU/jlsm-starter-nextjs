import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ATTRIBUTION, LayoutServiceData } from '../src/lib/jsonld/jsonld';
import { JsonLdScript } from '../src/lib/jsonld/JsonLdScript';

const CLUB = String.fromCharCode( 0x2663 );

function jsonLdRendering( uid: string, template: unknown ) {
	return {
		uid,
		componentName: 'JSON-LD',
		fields: {
			jsonTemplate: { value: JSON.stringify( template ) },
			references: [],
			jlsmSiteRoot: { value: 'https://www.siriuscanada.com' },
			jlsmDefaultLanguage: { value: 'en' },
			jlsmContract: { value: '2' }
		}
	};
}

function layout( components: unknown[], pageEditing = false ): LayoutServiceData {
	return {
		sitecore: {
			context: { pageEditing, itemPath: '/sirius/home/research/q2-report' },
			route: {
				name: 'q2-report',
				itemLanguage: 'en',
				fields: { headline: { value: 'Q2 report' } },
				placeholders: {
					'headless-main': [
						{ componentName: 'Hero', uid: 'hero' },
						{ componentName: 'Container', uid: 'container', placeholders: { 'container-1': components } }
					]
				}
			}
		}
	};
}

const components = [
	jsonLdRendering( 'a', { '@type': 'Article', '@id': `${CLUB}page:id/article`, headline: `${CLUB}field:headline`, url: `${CLUB}page:url` } ),
	jsonLdRendering( 'b', { '@type': 'Organization', '@id': 'https://www.siriusgroup.com/#organization', name: 'Sirius Group' } )
];

const articleAndOrganisation = layout( components );

describe( 'the Next.js drop-in', () => {
	it( 'writes the page dates it is given', () => {
		const dated = layout( [jsonLdRendering( 'd', { '@type': 'WebPage', dateModified: `${CLUB}page:updated` } )] );
		const html = renderToStaticMarkup( <JsonLdScript layout={dated} dates={{ created: null, updated: '20261104T004826Z' }} /> );

		expect( html ).toContain( '"dateModified":"2026-11-04T00:48:26Z"' );
	} );

	it( 'emits one script holding every JSON-LD rendering on the page', () => {
		const html = renderToStaticMarkup( <JsonLdScript layout={articleAndOrganisation} /> );

		const matches = html.match( /<script type="application\/ld\+json" data-source="([^"]*)">([\s\S]*?)<\/script>/g ) ?? [];

		expect( matches ).toHaveLength( 1 );
		expect( html ).toContain( `data-source="${ATTRIBUTION}"` );

		const json = html.replace( /^<script[^>]*>/, '' ).replace( /<\/script>$/, '' );

		expect( JSON.parse( json ) ).toEqual( {
			'@context': 'https://schema.org',
			'@graph': [
				{ '@type': 'Article', '@id': 'https://www.siriuscanada.com/q2-report/#article', headline: 'Q2 report', url: 'https://www.siriuscanada.com/sirius/home/research/q2-report' },
				{ '@type': 'Organization', '@id': 'https://www.siriusgroup.com/#organization', name: 'Sirius Group' }
			]
		} );
	} );

	it( 'renders nothing when the page carries no JSON-LD rendering', () =>
		expect( renderToStaticMarkup( <JsonLdScript layout={layout( [{ componentName: 'Hero', uid: 'hero' }] )} /> ) ).toBe( '' ) );

	it( 'shows the chip and no script in editing mode', () => {
		const html = renderToStaticMarkup( <JsonLdScript layout={layout( components, true )} /> );

		expect( html ).not.toContain( '<script' );
		expect( html ).toContain( '{ } JSON-LD' );
		expect( html ).toContain( '#99419F' );
		expect( html ).toMatch( /^<div class="jsonld-marker"/ );
		expect( html ).toMatch( /\d+ bytes/ );
	} );
} );
