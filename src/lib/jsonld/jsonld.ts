export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/**
 * The shape of the layout service response this engine reads, declared structurally so it binds to the
 * Sitecore Content SDK's `LayoutServiceData` without importing it.
 */
export interface LayoutServiceData {
	sitecore?: {
		context?: Record<string, unknown>;
		route?: RouteData | null;
	};
}

export interface RouteData {
	name?: string;
	displayName?: string;
	itemId?: string;
	itemLanguage?: string;
	itemVersion?: number;
	templateId?: string;
	templateName?: string;
	databaseName?: string;
	deviceId?: string;
	layoutId?: string;
	fields?: Record<string, unknown>;
	placeholders?: PlaceholderData;
}

export interface ComponentRendering {
	componentName?: string;
	uid?: string;
	dataSource?: string;
	fields?: Record<string, unknown>;
	params?: Record<string, unknown>;
	placeholders?: PlaceholderData;
}

export type PlaceholderData = Record<string, Array<ComponentRendering | Record<string, unknown>>>;

/** Where the engine reports a component it emits nothing for. */
export interface JsonLdLogger {
	warn( message: string ): void;
}

export const silentLogger: JsonLdLogger = { warn: () => undefined };

export const consoleLogger: JsonLdLogger = { warn: message => console.warn( `[json-ld] ${message}` ) };

/**
 * When the page's item was created and last changed, as Sitecore stores them (`20260902T040111Z`). The
 * layout wire does not carry them, so the head reads them itself, with {@link readPageDates}.
 */
export interface PageItemDates {
	created?: string | null;
	updated?: string | null;
}

/** How {@link readPageDates} reaches Experience Edge. */
export interface PageDatesOptions {
	/** The Live context id the read is made with: the one the Content SDK already uses. Empty means no dates are read. */
	contextId: string;

	/** The Experience Edge GraphQL endpoint. */
	url?: string;

	/** How long a page's dates are held before Edge is asked again, in milliseconds. */
	holdMs?: number;

	/** How long the read may take before the page renders without dates, in milliseconds; two seconds by default. */
	timeoutMs?: number;

	/** The fetch to make the request with; the global one by default. */
	fetch?: typeof fetch;

	/** Where a failed read is reported. */
	logger?: JsonLdLogger;
}

/** The rendering's component name on the wire. */
export const COMPONENT_NAME = 'JSON-LD';

/** The contract version this engine reads, as the datasource's `jlsmContract` field states it. */
export const CONTRACT = '2';

/** The datasource field holding the compiled template text. */
export const JSON_TEMPLATE_FIELD = 'jsonTemplate';

/** The datasource field listing the records the template's record tokens name. */
export const REFERENCES_FIELD = 'references';

/** The datasource field holding the site root page addresses are built on. */
export const SITE_ROOT_FIELD = 'jlsmSiteRoot';

/** The datasource field naming the site's default language, which page addresses carry no segment for. */
export const DEFAULT_LANGUAGE_FIELD = 'jlsmDefaultLanguage';

/** The datasource field stating the contract the template was compiled for. */
export const CONTRACT_FIELD = 'jlsmContract';

/** The datasource field the integrated query writes the page block under. */
export const DATA_FIELD = 'data';

/** The character a token opens with. */
export const SENTINEL = String.fromCharCode( 0x2663 );

/** Named on the script element, so a reader viewing source knows what put it on the page. */
export const ATTRIBUTION = 'JSON-LD Schema Manager. Rendered by Sitecore as part of the page.';

const CONTEXT = 'https://schema.org';

const ENTITY_DEPTH = 2;

const EDGE_URL = 'https://edge-platform.sitecorecloud.io/v1/content/api/graphql/v1';

const HOLD_MS = 5 * 60 * 1000;

const TIMEOUT_MS = 2000;

const HELD_LIMIT = 1000;

const TEMPLATE_LIMIT = 256;

const UNSAFE = new RegExp( `[<>&/${String.fromCharCode( 0x2028, 0x2029 )}]`, 'g' );

const SIZE_PARAMETERS = new Set( ['w', 'h', 'mw', 'mh'] );

const STORED_DATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

const LINE_SEPARATOR = String.fromCharCode( 0x2028 );

const PARAGRAPH_SEPARATOR = String.fromCharCode( 0x2029 );

const SCRIPT_ESCAPES: Readonly<Record<string, string>> = {
	'<': '\\u003c',
	'>': '\\u003e',
	'&': '\\u0026',
	'/': '\\/',
	[LINE_SEPARATOR]: '\\u2028',
	[PARAGRAPH_SEPARATOR]: '\\u2029'
};

export function isJsonObject( value: unknown ): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray( value );
}

/** True when the layout was served to the Pages editor. */
export function isEditing( layout: LayoutServiceData | null | undefined ): boolean {
	return layout?.sitecore?.context?.['pageEditing'] === true;
}

/** A record's id in one form whatever form the wire gives it: braces and dashes removed, lowercase. */
export class RecordId {
	private constructor( readonly key: string ) {}

	/** The id, or null when nothing is left of it. */
	static of( text: unknown ): RecordId | null {
		if ( typeof text !== 'string' ) return null;

		const key = text.trim().replace( /[{}-]/g, '' ).toLowerCase();

		return key.length === 0 ? null : new RecordId( key );
	}

	/** The form a record token carries: lowercase and dashed. */
	get dashed(): string {
		if ( !/^[0-9a-f]{32}$/.test( this.key ) ) return this.key;

		return [this.key.slice( 0, 8 ), this.key.slice( 8, 12 ), this.key.slice( 12, 16 ), this.key.slice( 16, 20 ), this.key.slice( 20 )].join( '-' );
	}
}

/** A date as Sitecore stores it (`20260902T040111Z`), which the page writes as ISO 8601. */
export class SitecoreDate {
	/** The standard field holding when the item was created. */
	static readonly CREATED_FIELD = '__Created';

	/** The standard field holding when the item last changed. */
	static readonly UPDATED_FIELD = '__Updated';

	private constructor( readonly iso8601: string ) {}

	/** The date, or null when the stored text is not a real date in Sitecore's form. */
	static tryParse( stored: string | null | undefined ): SitecoreDate | null {
		const match = STORED_DATE.exec( ( stored ?? '' ).trim() );

		if ( match === null ) return null;

		const [, year, month, day, hour, minute, second] = match;

		if ( Number( hour ) > 23 || Number( minute ) > 59 || Number( second ) > 59 ) return null;

		const when = new Date( Date.UTC( Number( year ), Number( month ) - 1, Number( day ) ) );

		if ( when.getUTCFullYear() !== Number( year ) || when.getUTCMonth() !== Number( month ) - 1 || when.getUTCDate() !== Number( day ) ) return null;

		return new SitecoreDate( `${year}-${month}-${day}T${hour}:${minute}:${second}Z` );
	}
}

/** A name made fit for a URL segment: lowercase ASCII letters and digits joined by single hyphens. */
export class Slug {
	private constructor( readonly text: string ) {}

	/** The name's slug, whose text is empty when nothing survives sanitising. */
	static from( name: string ): Slug {
		const letters = name.toLowerCase().normalize( 'NFD' ).replace( /\p{Mn}/gu, '' ).normalize( 'NFC' );

		return new Slug( trim( letters.replace( /[^a-z0-9]+/g, '-' ), '-' ) );
	}
}

/**
 * Where a page lives: the site root, then the language segment unless it is the default, then the path. With
 * no site root the address is root-relative.
 */
export class PageAddress {
	readonly root: string;
	private readonly prefix: string;

	constructor( siteRoot: string | null | undefined, defaultLanguage: string | null | undefined, language: string | null | undefined ) {
		const segment = languageSegment( language );

		this.root = trimEnd( ( siteRoot ?? '' ).trim(), '/' );
		this.prefix = segment === languageSegment( defaultLanguage ) ? '' : segment;
	}

	/** The page's address; a home page's ends in one slash. */
	url( itemPath: string ): string {
		const path = trim( itemPath.trim(), '/' );

		return this.join( path, path.length === 0 );
	}

	/** The base a page's identities share: the address of the page's own last segment, with the trailing slash. */
	idBase( itemPath: string ): string {
		const segments = trim( itemPath.trim(), '/' ).split( '/' );

		return this.join( segments[segments.length - 1], true );
	}

	/** One of the page's identities: its base and the fragment. */
	id( itemPath: string, fragment: string ): string {
		return `${this.idBase( itemPath )}#${fragment}`;
	}

	private join( path: string, slashed: boolean ): string {
		const segments = [this.prefix, path].filter( part => part.length > 0 );

		if ( segments.length === 0 ) return `${this.root}/`;

		return `${this.root}/${segments.join( '/' )}${slashed ? '/' : ''}`;
	}
}

/** Which part of a field a field token reads. */
export type FieldMember = 'value' | 'src' | 'href';

/** Which page value a page token reads. */
export type PageKey = 'url' | 'language' | 'created' | 'updated';

const FIELD_MEMBERS: readonly FieldMember[] = ['src', 'href'];

const PAGE_KEYS: readonly PageKey[] = ['url', 'language', 'created', 'updated'];

/**
 * A value in a compiled template that names something on the page, written as the sentinel, a source, a colon
 * and a key. Only a string opening with the sentinel is a token, and its source and key are matched exactly.
 */
export abstract class RenderToken {
	static readonly SENTINEL = SENTINEL;

	/** The token as a compiled template carries it. */
	abstract get text(): string;

	/** True when the token reads one of the page's dates. */
	get namesPageDate(): boolean {
		return false;
	}

	/** The value the token names in the block, or null when it names nothing. */
	abstract valueIn( block: ReferenceBlock ): JsonValue | null;

	/** The token the text is, or null when it is not one. */
	static tryParse( text: unknown ): RenderToken | null {
		if ( typeof text !== 'string' || !text.startsWith( SENTINEL ) ) return null;

		const expression = text.slice( SENTINEL.length );

		if ( expression.startsWith( 'field:' ) ) return FieldToken.parse( expression.slice( 6 ) );

		if ( expression.startsWith( 'record:' ) ) return RecordToken.parse( expression.slice( 7 ) );

		if ( expression.startsWith( 'page:' ) ) return RenderToken.parsePage( expression.slice( 5 ) );

		return null;
	}

	private static parsePage( key: string ): RenderToken | null {
		if ( key.startsWith( 'id/' ) ) return new PageIdToken( key.slice( 3 ) );

		if ( key.startsWith( 'slug/' ) ) return PageSlugToken.parse( key.slice( 5 ) );

		const named = PAGE_KEYS.find( candidate => candidate === key );

		return named === undefined ? null : new PageToken( named );
	}
}

/** `field:<name>`, `field:<name>/src` or `field:<name>/href`: one of the page's own fields. */
export class FieldToken extends RenderToken {
	constructor( readonly field: string, readonly member: FieldMember = 'value' ) {
		super();
	}

	static parse( key: string ): FieldToken | null {
		const slash = key.lastIndexOf( '/' );
		const member = FIELD_MEMBERS.find( candidate => slash >= 0 && key.slice( slash + 1 ) === candidate );
		const field = member === undefined ? key : key.slice( 0, slash );

		return field.length === 0 ? null : new FieldToken( field, member );
	}

	get text(): string {
		return `${SENTINEL}field:${this.field}${this.member === 'value' ? '' : `/${this.member}`}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.fieldValue( this.field, this.member );
	}
}

/** `record:<guid>`: the value of one of the records the datasource references. */
export class RecordToken extends RenderToken {
	constructor( readonly id: RecordId ) {
		super();
	}

	static parse( key: string ): RecordToken | null {
		const id = RecordId.of( key );

		return id === null ? null : new RecordToken( id );
	}

	get text(): string {
		return `${SENTINEL}record:${this.id.dashed}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.recordValue( this.id );
	}
}

/** `page:url`, `page:language`, `page:created` or `page:updated`. */
export class PageToken extends RenderToken {
	constructor( readonly key: PageKey ) {
		super();
	}

	get text(): string {
		return `${SENTINEL}page:${this.key}`;
	}

	get namesPageDate(): boolean {
		return this.key === 'created' || this.key === 'updated';
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.pageValue( this.key );
	}
}

/** `page:id/<fragment>`: one of the page's own identities. */
export class PageIdToken extends RenderToken {
	constructor( readonly fragment: string ) {
		super();
	}

	get text(): string {
		return `${SENTINEL}page:id/${this.fragment}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.pageId( this.fragment );
	}
}

/**
 * `page:slug/<field>/<root><fragment>`: an identity named by a field's value slugified. The root holds
 * slashes, so the field runs to the first slash, the fragment follows the last and the root is between,
 * ending in the last slash.
 */
export class PageSlugToken extends RenderToken {
	constructor( readonly field: string, readonly root: string, readonly fragment: string ) {
		super();
	}

	static parse( rest: string ): PageSlugToken | null {
		const first = rest.indexOf( '/' );
		const last = rest.lastIndexOf( '/' );

		if ( first < 0 || last <= first ) return null;

		return new PageSlugToken( rest.slice( 0, first ), rest.slice( first + 1, last + 1 ), rest.slice( last + 1 ) );
	}

	get text(): string {
		return `${SENTINEL}page:slug/${this.field}/${this.root}${this.fragment}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.pageSlug( this.field, this.root, this.fragment );
	}
}

/**
 * A compiled template, parsed once and never changed after: its tokens are parsed in the same walk, and
 * resolving it builds a new tree.
 */
export class CompiledTemplate {
	private constructor( readonly root: JsonValue, readonly namesPageDates: boolean, private readonly tokens: ReadonlyMap<string, RenderToken | null> ) {}

	/** The template the text holds, or null when it is blank or not JSON. */
	static parse( text: string | null | undefined ): CompiledTemplate | null {
		if ( text === null || text === undefined || text.trim().length === 0 ) return null;

		let root: JsonValue;

		try {
			root = JSON.parse( text ) as JsonValue;
		} catch {
			return null;
		}

		const tokens = new Map<string, RenderToken | null>();

		return new CompiledTemplate( root, CompiledTemplate.collect( root, tokens ), tokens );
	}

	/**
	 * The document the template becomes on the page the block describes: every token substituted, a key whose
	 * token names nothing or blank dropped, and below the top-level entries an empty list or an object left with
	 * only its `@type` dropped. Null when the template is not an object.
	 */
	resolve( block: ReferenceBlock ): JsonObject | null {
		if ( !isJsonObject( this.root ) ) return null;

		return this.resolveObject( this.root, block, Array.isArray( this.root['@graph'] ) ? 0 : ENTITY_DEPTH );
	}

	private static collect( node: JsonValue, tokens: Map<string, RenderToken | null> ): boolean {
		if ( typeof node === 'string' ) {
			if ( !node.startsWith( SENTINEL ) ) return false;

			const token = tokens.get( node ) ?? RenderToken.tryParse( node );

			tokens.set( node, token );

			return token?.namesPageDate ?? false;
		}

		if ( node === null || typeof node !== 'object' ) return false;

		let namesPageDates = false;

		for ( const value of Array.isArray( node ) ? node : Object.values( node ) ) namesPageDates = CompiledTemplate.collect( value, tokens ) || namesPageDates;

		Object.freeze( node );

		return namesPageDates;
	}

	private resolveObject( node: JsonObject, block: ReferenceBlock, depth: number ): JsonObject {
		const resolved: JsonObject = {};

		for ( const key of Object.keys( node ) ) {
			const value = this.resolveValue( node[key], block, depth );

			if ( value !== undefined ) resolved[key] = value;
		}

		return resolved;
	}

	private resolveArray( node: JsonValue[], block: ReferenceBlock, depth: number ): JsonValue[] {
		const resolved: JsonValue[] = [];

		for ( const entry of node ) {
			const value = this.resolveValue( entry, block, depth );

			if ( value !== undefined ) resolved.push( value );
		}

		return resolved;
	}

	private resolveValue( value: JsonValue, block: ReferenceBlock, depth: number ): JsonValue | undefined {
		const result = this.valueOf( value, block, depth );

		return result === undefined || sayless( result, depth ) ? undefined : result;
	}

	private valueOf( value: JsonValue, block: ReferenceBlock, depth: number ): JsonValue | undefined {
		if ( typeof value === 'string' && value.startsWith( SENTINEL ) ) {
			const found = this.tokens.get( value )?.valueIn( block ) ?? null;

			return found === null || ( typeof found === 'string' && found.trim().length === 0 ) ? undefined : found;
		}

		if ( Array.isArray( value ) ) return this.resolveArray( value, block, depth + 1 );

		if ( isJsonObject( value ) ) return this.resolveObject( value, block, depth + 1 );

		return value;
	}
}

/**
 * The templates already parsed, keyed by their text, so a host parses each distinct template once. Holds at
 * most `limit`; past it the least recently used goes first.
 */
export class CompiledTemplates {
	private readonly held = new Map<string, CompiledTemplate | null>();

	constructor( readonly limit = TEMPLATE_LIMIT ) {}

	/** The template the text holds, parsed the first time it is asked for; null when it is blank or not JSON. */
	parse( text: string | null | undefined ): CompiledTemplate | null {
		if ( text === null || text === undefined ) return null;

		if ( this.held.has( text ) ) return this.touch( text, this.held.get( text ) ?? null );

		return this.hold( text, CompiledTemplate.parse( text ) );
	}

	private touch( text: string, template: CompiledTemplate | null ): CompiledTemplate | null {
		this.held.delete( text );
		this.held.set( text, template );

		return template;
	}

	private hold( text: string, template: CompiledTemplate | null ): CompiledTemplate | null {
		for ( const oldest of this.held.keys() ) {
			if ( this.held.size < this.limit ) break;

			this.held.delete( oldest );
		}

		this.held.set( text, template );

		return template;
	}
}

const compiledTemplates = new CompiledTemplates();

const PAGE_DATES_QUERY = 'query JlsmPageDates($id: String!, $language: String!) { item(path: $id, language: $language) { '
	+ `created: field(name: "${SitecoreDate.CREATED_FIELD}") { value } updated: field(name: "${SitecoreDate.UPDATED_FIELD}") { value } } }`;

/**
 * The page dates the head holds and the reads still on their way. Renderings that ask for the same page at
 * once wait on one read; a failed read, which answers undefined, is not held. Expired dates are swept when new
 * ones are held, and past the limit the oldest go first.
 */
class HeldPageDates {
	private readonly held = new Map<string, { until: number; dates: PageItemDates | null }>();
	private readonly reading = new Map<string, Promise<PageItemDates | null>>();

	constructor( private readonly limit: number ) {}

	get( key: string, holdMs: number, read: () => Promise<PageItemDates | null | undefined> ): Promise<PageItemDates | null> {
		const held = this.held.get( key );

		if ( held !== undefined && held.until > Date.now() ) return Promise.resolve( held.dates );

		const reading = this.reading.get( key ) ?? this.readAndHold( key, holdMs, read );

		this.reading.set( key, reading );

		return reading;
	}

	private async readAndHold( key: string, holdMs: number, read: () => Promise<PageItemDates | null | undefined> ): Promise<PageItemDates | null> {
		try {
			const dates = await read();

			if ( dates === undefined ) return null;

			this.hold( key, Date.now() + holdMs, dates );

			return dates;
		} finally {
			this.reading.delete( key );
		}
	}

	private hold( key: string, until: number, dates: PageItemDates | null ): void {
		const now = Date.now();

		for ( const [heldKey, entry] of this.held ) if ( entry.until <= now ) this.held.delete( heldKey );

		this.held.delete( key );

		for ( const oldest of this.held.keys() ) {
			if ( this.held.size < this.limit ) break;

			this.held.delete( oldest );
		}

		this.held.set( key, { until, dates } );
	}
}

const heldDates = new HeldPageDates( HELD_LIMIT );

/** One JSON-LD component as the wire gives it: its compiled template, its reference block and its contract. */
export class JsonLdRendering {
	readonly uid: string | undefined;
	readonly template: CompiledTemplate | null;
	readonly block: ReferenceBlock;
	readonly contractOk: boolean;

	constructor( component: ComponentRendering, route: RouteData | null | undefined, context: Record<string, unknown> | null | undefined, templates: CompiledTemplates = compiledTemplates ) {
		this.uid = component.uid;
		this.template = templates.parse( textOf( component.fields?.[JSON_TEMPLATE_FIELD] ) );
		this.block = new ReferenceBlock( component.fields, route, context );
		this.contractOk = ( textOf( component.fields?.[CONTRACT_FIELD] ) ?? '' ).trim() === CONTRACT;
	}

	/** True when the document names a page date, so a head knows it is worth reading them. */
	get wantsPageDates(): boolean {
		return this.template?.namesPageDates ?? false;
	}

	/** Every JSON-LD component on the page, depth-first through the placeholders in wire order. */
	static findAll( layout: LayoutServiceData | null | undefined, templates: CompiledTemplates = compiledTemplates ): JsonLdRendering[] {
		const route = layout?.sitecore?.route ?? null;
		const context = layout?.sitecore?.context ?? null;
		const found: JsonLdRendering[] = [];

		walk( route?.placeholders, component => found.push( new JsonLdRendering( component, route, context, templates ) ) );

		return found;
	}
}

/** Every value a token can name on one page, looked up by key. */
export class ReferenceBlock {
	private readonly fields: Record<string, unknown>;
	private readonly page: unknown;
	private readonly address: PageAddress;
	private readonly language: string;
	private readonly name: string;
	private readonly itemPath: string;
	private readonly dates: PageItemDates | null;
	private readonly records: ReadonlyMap<string, JsonValue>;

	constructor(
		private readonly component: Record<string, unknown> | undefined,
		private readonly route: RouteData | null | undefined,
		private readonly context: Record<string, unknown> | null | undefined,
		dates: PageItemDates | null = null,
		records: ReadonlyMap<string, JsonValue> = recordsOf( component ) ) {
		this.records = records;
		this.dates = dates;
		this.fields = isJsonObject( route?.fields ) ? route.fields : {};
		this.page = member( component, DATA_FIELD, 'page' );
		this.language = ( route?.itemLanguage ?? '' ).trim();
		this.address = new PageAddress( textOf( component?.[SITE_ROOT_FIELD] ), textOf( component?.[DEFAULT_LANGUAGE_FIELD] ), this.language );
		this.name = route?.name ?? '';
		this.itemPath = typeof context?.['itemPath'] === 'string' ? context['itemPath'] : '';
	}

	/**
	 * A block like this one holding the page's dates the head read itself. A date given here wins over one the
	 * wire carries under `data.page`; a date left null falls back to the wire. This block is left as it is.
	 */
	withPageDates( dates: PageItemDates | null | undefined ): ReferenceBlock {
		return new ReferenceBlock( this.component, this.route, this.context, dates ?? null, this.records );
	}

	/** The value the token text names, or null when it is not a token or names nothing. */
	lookup( text: string ): JsonValue | null {
		return RenderToken.tryParse( text )?.valueIn( this ) ?? null;
	}

	/** A field's value, or for an image or link its URL joined to the site root. */
	fieldValue( field: string, part: FieldMember ): JsonValue | null {
		if ( part !== 'value' ) return this.url( member( this.fields, field, 'value', part ), part );

		const value = member( this.fields, field, 'value' );

		if ( isJsonObject( value ) ) {
			if ( typeof value['src'] === 'string' ) return this.url( value['src'], 'src' );

			if ( typeof value['href'] === 'string' ) return this.url( value['href'], 'href' );
		}

		return value === undefined ? null : value as JsonValue;
	}

	/** The value of the first references entry carrying the id. */
	recordValue( id: RecordId ): JsonValue | null {
		return this.records.get( id.key ) ?? null;
	}

	/** The page's address, language or one of its dates as ISO 8601. */
	pageValue( key: PageKey ): JsonValue | null {
		if ( key === 'url' ) return this.address.url( this.itemPath );

		if ( key === 'language' ) return this.language.length === 0 ? null : this.language;

		return SitecoreDate.tryParse( this.storedDate( key ) )?.iso8601 ?? null;
	}

	/** One of the page's own identities. */
	pageId( fragment: string ): string {
		return this.address.id( this.itemPath, fragment );
	}

	/** The root, the field's value slugified or else the page's name, and the fragment. */
	pageSlug( field: string, root: string, fragment: string ): string {
		const value = member( this.fields, field, 'value' );
		const slug = Slug.from( typeof value === 'string' && value.trim().length > 0 ? value : this.name ).text;

		return slug.length === 0 ? `${root}#${fragment}` : `${root}${slug}/#${fragment}`;
	}

	private storedDate( key: 'created' | 'updated' ): string | null {
		return ( key === 'created' ? this.dates?.created : this.dates?.updated ) ?? textOf( member( this.page, key ) );
	}

	private url( value: unknown, part: 'src' | 'href' ): string | null {
		if ( typeof value !== 'string' || value.length === 0 ) return null;

		return this.absolute( part === 'src' ? fullSize( value ) : value );
	}

	private absolute( url: string ): string {
		if ( url.startsWith( '//' ) ) return `https:${url}`;

		if ( url.startsWith( '/' ) && this.address.root.length > 0 ) return `${this.address.root}${url}`;

		return url;
	}
}

/** The page's nodes, collected from every document in wire order and deduplicated by `@id`. */
export class JsonLdPage {
	private readonly nodes: JsonObject[] = [];
	private readonly ids = new Set<string>();
	private written: string | null = null;

	get isEmpty(): boolean {
		return this.nodes.length === 0;
	}

	/**
	 * Contributes the document's `@graph` entries, or the document itself as one node. The page takes the
	 * document over rather than copying it, so the caller must not change it afterwards.
	 */
	add( document: JsonObject | null | undefined ): void {
		if ( !isJsonObject( document ) ) return;

		const graph = document['@graph'];

		for ( const node of Array.isArray( graph ) ? graph.filter( isJsonObject ) : [document] ) {
			const id = node['@id'];

			if ( typeof id === 'string' && id.trim().length > 0 ) {
				if ( this.ids.has( id ) ) continue;

				this.ids.add( id );
			}

			delete node['@context'];

			this.nodes.push( node );
			this.written = null;
		}
	}

	/** A copy of the page's graph, the caller's to change. */
	toJson(): JsonObject {
		return clone( this.graph() );
	}

	/** The page as script-safe text, written once and kept until the next {@link add}. */
	get scriptText(): string {
		return this.written ??= ScriptWriter.text( this.graph() );
	}

	private graph(): JsonObject {
		return { '@context': CONTEXT, '@graph': this.nodes };
	}

	/**
	 * Every JSON-LD rendering on the layout, resolved and collected into one page. `dates` are the page's
	 * dates the head read with {@link readPageDates}; without them a date token drops its key.
	 */
	static buildPage( layout: LayoutServiceData | null | undefined, logger: JsonLdLogger = silentLogger, dates: PageItemDates | null = null ): JsonLdPage {
		const page = new JsonLdPage();

		for ( const rendering of JsonLdRendering.findAll( layout ) ) {
			if ( !rendering.contractOk ) {
				logger.warn( `JSON-LD component ${rendering.uid ?? '(no uid)'} is not on contract ${CONTRACT}, so nothing is emitted for it. Upgrade the app and republish its graph.` );

				continue;
			}

			page.add( rendering.template?.resolve( rendering.block.withPageDates( dates ) ) );
		}

		return page;
	}

	/** True when a JSON-LD rendering on the layout names a page date. */
	static wantsPageDates( layout: LayoutServiceData | null | undefined ): boolean {
		return JsonLdRendering.findAll( layout ).some( rendering => rendering.contractOk && rendering.wantsPageDates );
	}
}

/**
 * The page item's dates from published Experience Edge, for {@link JsonLdPage.buildPage}. Asks only when a
 * JSON-LD rendering on the page names a date, holds the answer for five minutes per context id, item and
 * language, and shares one read between renderings asking at once. A read that fails or outlasts the timeout
 * gives null and is not held, so the next page tries again.
 */
export async function readPageDates( layout: LayoutServiceData | null | undefined, options: PageDatesOptions ): Promise<PageItemDates | null> {
	const route = layout?.sitecore?.route;
	const itemId = route?.itemId ?? '';
	const language = route?.itemLanguage ?? '';

	if ( options.contextId.length === 0 || itemId.length === 0 || !JsonLdPage.wantsPageDates( layout ) ) return null;

	return heldDates.get( `${options.contextId}|${itemId}|${language}`, options.holdMs ?? HOLD_MS, () => askEdge( itemId, language, options ) );
}

async function askEdge( itemId: string, language: string, options: PageDatesOptions ): Promise<PageItemDates | null | undefined> {
	try {
		const response = await ( options.fetch ?? fetch )( `${options.url ?? EDGE_URL}?sitecoreContextId=${encodeURIComponent( options.contextId )}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { query: PAGE_DATES_QUERY, variables: { id: itemId, language } } ),
			signal: AbortSignal.timeout( options.timeoutMs ?? TIMEOUT_MS )
		} );

		if ( !response.ok ) throw new Error( `Experience Edge answered ${response.status}` );

		const item = member( await response.json(), 'data', 'item' );

		return isJsonObject( item ) ? { created: textOf( item['created'] ), updated: textOf( item['updated'] ) } : null;
	} catch ( error ) {
		( options.logger ?? silentLogger ).warn( `The dates of page item ${itemId} (${language}) could not be read from Experience Edge: ${error instanceof Error ? error.message : String( error )}` );

		return undefined;
	}
}

/** Writes a page as script-safe text, as the script element, or as the editing chip's text. */
export class ScriptWriter {
	static readonly CHIP_CLASS = 'jsonld-marker';
	static readonly CHIP_TITLE = 'Structured data for search engines. It is not visible on the published page.';
	static readonly CHIP_BADGE = '{ } JSON-LD';
	static readonly CHIP_STYLE =
		'display:flex;align-items:center;gap:8px;width:fit-content;max-width:calc(100% - 32px);margin:8px auto;padding:4px 12px 4px 4px;'
		+ 'border:1px dashed #99419F;border-radius:999px;background:#F4EBF5;color:#633569;font:500 12px/1.4 system-ui,sans-serif;';
	static readonly CHIP_BADGE_STYLE =
		'padding:2px 8px;border-radius:999px;background:#99419F;color:#fff;font-weight:700;letter-spacing:.04em;white-space:nowrap;';

	/** The node as JSON with `<`, `>`, `&`, U+2028 and U+2029 written as `\uXXXX` and `/` as `\/`. */
	static text( node: JsonValue, indented = false ): string {
		return JSON.stringify( node, null, indented ? 2 : undefined ).replace( UNSAFE, character => SCRIPT_ESCAPES[character] );
	}

	/** The whole script element, or an empty string for an empty page. */
	static write( page: JsonLdPage ): string {
		if ( page.isEmpty ) return '';

		return `<script type="application/ld+json" data-source="${ATTRIBUTION}">${page.scriptText}</script>`;
	}

	/** The chip's text in editing mode: the size of what the published page carries, or that nothing does yet. */
	static chipText( page: JsonLdPage ): string {
		if ( page.isEmpty ) return 'Nothing to emit yet: no graph has been saved to the datasources on this page.';

		return `${grouped( page.scriptText.length )} bytes, not shown on the published page`;
	}
}

function recordsOf( component: Record<string, unknown> | undefined ): ReadonlyMap<string, JsonValue> {
	const records = new Map<string, JsonValue>();
	const references = component?.[REFERENCES_FIELD];

	for ( const entry of Array.isArray( references ) ? references : [] ) {
		const id = RecordId.of( member( entry, 'id' ) );

		if ( id !== null && !records.has( id.key ) ) records.set( id.key, ( member( entry, 'fields', 'value', 'value' ) ?? null ) as JsonValue );
	}

	return records;
}

function walk( placeholders: PlaceholderData | undefined, found: ( component: ComponentRendering ) => void ): void {
	if ( !placeholders ) return;

	for ( const key of Object.keys( placeholders ) ) {
		const entries = placeholders[key];

		if ( !Array.isArray( entries ) ) continue;

		for ( const entry of entries ) {
			const component = entry as ComponentRendering;

			if ( component.componentName === COMPONENT_NAME ) found( component );

			walk( component.placeholders, found );
		}
	}
}

function sayless( value: JsonValue, depth: number ): boolean {
	if ( depth < ENTITY_DEPTH ) return false;

	if ( Array.isArray( value ) ) return value.length === 0;

	if ( isJsonObject( value ) ) return !Object.keys( value ).some( key => key !== '@type' );

	if ( typeof value === 'string' ) return value.trim().length === 0;

	return false;
}

function clone<T extends JsonValue>( value: T ): T {
	if ( Array.isArray( value ) ) return value.map( entry => clone( entry ) ) as T;

	if ( isJsonObject( value ) ) {
		const copy: JsonObject = {};

		for ( const key of Object.keys( value ) ) copy[key] = clone( value[key] );

		return copy as T;
	}

	return value;
}

function member( node: unknown, ...keys: string[] ): unknown {
	let current = node;

	for ( const key of keys ) {
		if ( !isJsonObject( current ) ) return undefined;

		current = current[key];
	}

	return current;
}

function textOf( field: unknown ): string | null {
	if ( typeof field === 'string' ) return field;

	const value = member( field, 'value' );

	return typeof value === 'string' ? value : null;
}

function fullSize( src: string ): string {
	const query = src.indexOf( '?' );

	if ( query < 0 ) return src;

	const kept = src.slice( query + 1 )
		.split( '&' )
		.filter( pair => pair.length > 0 && !SIZE_PARAMETERS.has( pair.split( '=' )[0].toLowerCase() ) );

	return kept.length === 0 ? src.slice( 0, query ) : `${src.slice( 0, query )}?${kept.join( '&' )}`;
}

function languageSegment( language: string | null | undefined ): string {
	return trim( ( language ?? '' ).trim(), '/' ).toLowerCase();
}

function grouped( count: number ): string {
	return String( count ).replace( /\B(?=(\d{3})+(?!\d))/g, ',' );
}

function trimEnd( value: string, character: string ): string {
	let end = value.length;

	while ( end > 0 && value[end - 1] === character ) end--;

	return value.slice( 0, end );
}

function trim( value: string, character: string ): string {
	let start = 0;

	while ( start < value.length && value[start] === character ) start++;

	return trimEnd( value.slice( start ), character );
}
