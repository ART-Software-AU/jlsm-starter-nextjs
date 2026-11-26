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

/** Where the engine warns of a component on another contract, which it emits nothing for, and of a failed date read. */
export interface JsonLdLogger {
	warn( message: string ): void;
}

export const silentLogger: JsonLdLogger = { warn: () => undefined };

export const consoleLogger: JsonLdLogger = { warn: message => console.warn( `[json-ld] ${message}` ) };

/**
 * When the page's item was created and last changed, as Sitecore stores them (`20260902T040111Z`). The
 * layout service does not send them unless a rendering's own query adds them under `data.page`, so the head
 * reads them itself, with {@link readPageDates}.
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

	/**
	 * The API key of an on-premises Sitecore's Edge endpoint. When set, the read sends it as the `sc_apikey` header
	 * to `url` and sends no context id.
	 */
	apiKey?: string;

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

/** The field a datasource-and-children resolver delivers a datasource's children under. */
export const CHILDREN_FIELD = 'items';

/** The contract version this engine reads, as the datasource's `jlsmContract` field states it. */
export const CONTRACT = '2';

/** The contract version of a graph that describes a component, which this engine also reads. */
export const COMPONENT_CONTRACT = '3';

/** The datasource field naming the component a graph describes; blank for a graph that describes pages. */
export const COMPONENT_FIELD = 'jlsmComponent';

/** The datasource field naming how a component graph publishes across the component's placements; blank publishes one node for the page. */
export const EMISSION_FIELD = 'jlsmEmission';

/** The `jlsmEmission` value of a component graph that publishes one node per placement of its component. */
export const EMISSION_EACH = 'each';

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

/** The component field a rendering's own GraphQL query writes a page block under; JSON-LD Schema Manager's rendering has no such query. */
export const DATA_FIELD = 'data';

/** The datasource field naming, for each `each:` key, the page field it repeats over and the entry it publishes per item. */
export const REPEATS_FIELD = 'jlsmRepeats';

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

const EACH_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const EACH_KEY_LIMIT = 100;

const ID_KEY = '@id';

const SCHEME_SEPARATOR = '://';

const STORED_DATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

const COMBINING_MARKS = new RegExp( '\\p{Mn}', 'gu' );

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

/** A record's id in one form whatever form the wire gives it: trimmed of {@link WHITESPACE}, braces, parentheses and dashes removed, lowercase. */
export class RecordId {
	private constructor( readonly key: string ) {}

	/** The id, or null when nothing is left of it. */
	static of( text: unknown ): RecordId | null {
		if ( typeof text !== 'string' ) return null;

		const key = trimmed( text ).replace( /[{}()-]/g, '' ).toLowerCase();

		return key.length === 0 ? null : new RecordId( key );
	}

	/**
	 * The first eight hex characters of the id, as the specification's `#review-58c85218`: what a repeating or
	 * per-placement Auto `@id` suffixes its fragment with. Fewer for an id holding fewer.
	 */
	get short(): string {
		return this.key.replace( /[^0-9a-f]/g, '' ).slice( 0, 8 );
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

/** The name of a cast; `none` publishes a value as the page holds it. */
export type ValueCastName = 'none' | 'number' | 'boolean' | 'date' | 'minutes';

const PLAIN_NUMBER = /^-?[0-9]{1,9}(\.[0-9]{1,6})?$/;

const WHITESPACE = '\t\n\v\f\r \u0085\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000';

const DIGIT_RUN = /[0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?/g;

const FOREIGN_DIGIT = /(?![0-9])\p{Nd}/u;

const LETTER_OR_POINT_AT_END = /[\p{L}.]$/u;

const OTHER_NUMBER_AT_END = /\p{No}$/u;

const OTHER_NUMBER_AT_START = /^\p{No}/u;

const LETTER_AT_START = /^\p{L}/u;

const THOUSANDS_GROUPED = /^(?!0+,)[0-9]{1,3}(,[0-9]{3})+$/;

const ALL_DIGITS = /^[0-9]+$/;

const MINUTES_UNIT = /^(m|mins?\.?|minutes?)( read)?$/;

const ASCII_UPPER = /[A-Z]/g;

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$/;

const ISO_DURATION = /^P(?=[0-9]|T[0-9])([0-9]+Y)?([0-9]+M)?([0-9]+W)?([0-9]+D)?(T(?=[0-9])([0-9]+H)?([0-9]+M)?([0-9]+(\.[0-9]+)?S)?)?$/;

/**
 * The one number a trimmed text value holds, and where its text sits: `start` includes a sign read as part of it,
 * and `end` is just past its last digit.
 */
interface TextNumber {
	readonly value: number;
	readonly start: number;
	readonly end: number;
}

/**
 * The type a page field's value is converted to before it is published, named by a suffix on the field token:
 * `/number`, `/boolean`, `/date` or `/minutes`. A value the cast cannot convert is refused, so the key is
 * dropped rather than published as the wrong type. Compared by reference.
 */
export class ValueCast {
	/** No conversion: the value is published as the page holds it. */
	static readonly NONE = new ValueCast( '', 'none' );

	/** A JSON number, from a number, a plain decimal string, or the one number in a text value such as `"$49"`. */
	static readonly NUMBER = new ValueCast( '/number', 'number' );

	/** A JSON boolean, from a boolean or `true`, `1`, `false`, `0`. */
	static readonly BOOLEAN = new ValueCast( '/boolean', 'boolean' );

	/** An ISO 8601 date or date and time, from one or from Sitecore's stored form. */
	static readonly DATE = new ValueCast( '/date', 'date' );

	/** An ISO 8601 duration, from a number of minutes, from text naming minutes such as `"5 min"`, or from a duration. */
	static readonly MINUTES = new ValueCast( '/minutes', 'minutes' );

	private static readonly CASTS: readonly ValueCast[] = [ValueCast.NUMBER, ValueCast.BOOLEAN, ValueCast.DATE, ValueCast.MINUTES];

	private constructor( readonly suffix: string, private readonly which: ValueCastName ) {}

	/** The cast the key ends with and the key without its suffix; `NONE` and the key itself when it ends with none. */
	static trailing( key: string ): { cast: ValueCast; rest: string } {
		const cast = ValueCast.CASTS.find( candidate => key.endsWith( candidate.suffix ) );

		return cast === undefined ? { cast: ValueCast.NONE, rest: key } : { cast, rest: key.slice( 0, key.length - cast.suffix.length ) };
	}

	/** The value converted, or null when this cast cannot convert it. `NONE` returns the value itself. */
	convert( value: JsonValue | null ): JsonValue | null {
		switch ( this.which ) {
			case 'number': return ValueCast.numberOf( value );
			case 'boolean': return ValueCast.convertBoolean( value );
			case 'date': return ValueCast.convertDate( value );
			case 'minutes': return ValueCast.convertMinutes( value );
			default: return value;
		}
	}

	private static textOf( value: JsonValue | null ): string | null {
		if ( typeof value !== 'string' ) return null;

		const text = trimmed( value );

		return text.length === 0 ? null : text;
	}

	private static isWhitespace( character: string ): boolean {
		return WHITESPACE.includes( character );
	}

	private static numberOf( value: JsonValue | null ): number | null {
		if ( typeof value === 'number' ) return Number.isFinite( value ) ? ValueCast.plainNumber( String( value ) ) : null;

		const text = ValueCast.textOf( value );

		if ( text === null ) return null;

		const read = ValueCast.readNumber( text );

		return read === null || LETTER_AT_START.test( text.slice( read.end ) ) ? null : read.value;
	}

	private static plainNumber( text: string | null ): number | null {
		return text !== null && PLAIN_NUMBER.test( text ) ? ValueCast.normalised( Number( text ) ) : null;
	}

	private static normalised( number: number ): number {
		return number === 0 ? 0 : number;
	}

	private static convertBoolean( value: JsonValue | null ): boolean | null {
		if ( typeof value === 'boolean' ) return value;

		switch ( ValueCast.textOf( value )?.toLowerCase() ) {
			case 'true':
			case '1': return true;
			case 'false':
			case '0': return false;
			default: return null;
		}
	}

	private static convertDate( value: JsonValue | null ): string | null {
		const text = ValueCast.textOf( value );

		if ( text === null ) return null;

		const stored = SitecoreDate.tryParse( text );

		if ( stored !== null ) return ValueCast.isYearOne( stored.iso8601 ) ? null : stored.iso8601;

		return ISO_DATE.test( text ) && !ValueCast.isYearOne( text ) ? text : null;
	}

	private static convertMinutes( value: JsonValue | null ): string | null {
		const duration = ValueCast.isoDuration( value );

		if ( duration !== null ) return duration;

		const number = ValueCast.minutesOf( value );

		if ( number === null || number <= 0 ) return null;

		const whole = Math.round( number );

		return whole === 0 ? null : `PT${whole}M`;
	}

	private static minutesOf( value: JsonValue | null ): number | null {
		const text = ValueCast.textOf( value );

		if ( text === null ) return ValueCast.numberOf( value );

		const read = ValueCast.readNumber( text );

		return read !== null && ValueCast.namesMinutes( text.slice( 0, read.start ) + text.slice( read.end ) ) ? read.value : null;
	}

	private static namesMinutes( remainder: string ): boolean {
		const unit = trimmed( remainder ).replace( ASCII_UPPER, letter => letter.toLowerCase() );

		return unit.length === 0 || MINUTES_UNIT.test( unit );
	}

	private static readNumber( text: string ): TextNumber | null {
		if ( PLAIN_NUMBER.test( text ) ) return ValueCast.textNumber( text, 0, text.length );

		if ( FOREIGN_DIGIT.test( text ) ) return null;

		const runs = [...text.matchAll( DIGIT_RUN )];

		return runs.length === 1 ? ValueCast.fromRun( text, runs[0][0], runs[0].index ) : null;
	}

	private static fromRun( text: string, run: string, index: number ): TextNumber | null {
		if ( LETTER_OR_POINT_AT_END.test( text.slice( 0, index ) ) ) return null;

		if ( OTHER_NUMBER_AT_END.test( text.slice( 0, index ) ) || OTHER_NUMBER_AT_START.test( text.slice( index + run.length ) ) ) return null;

		const digits = ValueCast.ungrouped( run );

		if ( digits === null ) return null;

		const start = ValueCast.signedStart( text, index );

		if ( start === null ) return null;

		return ValueCast.textNumber( start < index ? `-${digits}` : digits, start, index + run.length );
	}

	private static textNumber( number: string, start: number, end: number ): TextNumber | null {
		const value = ValueCast.plainNumber( number );

		return value === null ? null : { value, start, end };
	}

	private static ungrouped( run: string ): string | null {
		const point = run.indexOf( '.' );
		const whole = point < 0 ? run : run.slice( 0, point );

		if ( ALL_DIGITS.test( whole ) ) return run;

		return THOUSANDS_GROUPED.test( whole ) ? whole.replace( /,/g, '' ) + run.slice( whole.length ) : null;
	}

	private static signedStart( text: string, index: number ): number | null {
		const prefix = ValueCast.prefix( text, index );

		if ( prefix.length === 1 && ValueCast.isMinus( prefix ) ) return index - 1;

		return [...prefix].some( ValueCast.isMinus ) ? null : index;
	}

	private static prefix( text: string, index: number ): string {
		let start = index;

		while ( start > 0 && !ValueCast.isWhitespace( text[start - 1] ) ) start--;

		return text.slice( start, index );
	}

	private static isMinus( character: string ): boolean {
		return character === '-' || character === '\u2212';
	}

	private static isoDuration( value: JsonValue | null ): string | null {
		const text = ValueCast.textOf( value );

		return text !== null && ISO_DURATION.test( text ) ? text : null;
	}

	private static isYearOne( iso: string ): boolean {
		return iso.startsWith( '0001' );
	}
}

/** A name made fit for a URL segment: lowercase ASCII letters and digits joined by single hyphens. */
export class Slug {
	private constructor( readonly text: string ) {}

	/** The name's slug, whose text is empty when nothing survives sanitising. */
	static from( name: string ): Slug {
		const letters = name.toLowerCase().normalize( 'NFD' ).replace( COMBINING_MARKS, '' ).normalize( 'NFC' );

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
 * and a key. Only a string opening with the sentinel is a token. Its source and key are matched exactly,
 * except a record's id, which matches with or without braces and dashes, in either case.
 */
export abstract class RenderToken {
	static readonly SENTINEL = SENTINEL;

	/** The token as a compiled template carries it. */
	abstract get text(): string;

	/** True when the token reads one of the page's dates. */
	get namesPageDate(): boolean {
		return false;
	}

	/** True when the token reads a value the head supplies. */
	get namesExternal(): boolean {
		return false;
	}

	/** The value the token names in the block, or null when it names nothing. */
	abstract valueIn( block: ReferenceBlock ): JsonValue | null;

	/** The token the text is, or null when it is not one. */
	static tryParse( text: unknown ): RenderToken | null {
		if ( typeof text !== 'string' || !text.startsWith( SENTINEL ) ) return null;

		const expression = text.slice( SENTINEL.length );

		if ( expression.startsWith( 'field:' ) ) return FieldToken.parse( expression.slice( 6 ) );

		if ( expression.startsWith( 'component:field:' ) ) return ComponentFieldToken.parse( expression.slice( 16 ) );

		if ( expression.startsWith( 'component:id/' ) ) return new ComponentIdToken( expression.slice( 13 ) );

		if ( expression.startsWith( 'record:' ) ) return RecordToken.parse( expression.slice( 7 ) );

		if ( expression.startsWith( 'page:' ) ) return RenderToken.parsePage( expression.slice( 5 ) );

		if ( expression.startsWith( 'external:' ) ) return ExternalToken.parse( expression.slice( 9 ) );

		if ( expression.startsWith( 'each:' ) ) return EachToken.parse( expression.slice( 5 ) );

		if ( expression.startsWith( 'selected:' ) ) return SelectedToken.parse( expression.slice( 9 ) );

		return null;
	}

	/** A field key split into the field's name, the member a `/src` or `/href` suffix names, and the cast a trailing cast suffix names. */
	protected static split( key: string ): { name: string; member: FieldMember; cast: ValueCast } {
		const { cast, rest } = ValueCast.trailing( key );
		const slash = rest.lastIndexOf( '/' );
		const member = FIELD_MEMBERS.find( candidate => slash >= 0 && rest.slice( slash + 1 ) === candidate );

		return member === undefined ? { name: rest, member: 'value', cast } : { name: rest.slice( 0, slash ), member, cast };
	}

	/** The suffix a field key carries for the member. */
	protected static memberText( member: FieldMember ): string {
		return member === 'value' ? '' : `/${member}`;
	}

	private static parsePage( key: string ): RenderToken | null {
		if ( key.startsWith( 'id/' ) ) return new PageIdToken( key.slice( 3 ) );

		if ( key.startsWith( 'slug/' ) ) return PageSlugToken.parse( key.slice( 5 ) );

		const named = PAGE_KEYS.find( candidate => candidate === key );

		return named === undefined ? null : new PageToken( named );
	}
}

/** `field:<name>`, with `/src` or `/href`, then a cast suffix: one of the page's own fields, converted by its cast. */
export class FieldToken extends RenderToken {
	constructor( readonly field: string, readonly member: FieldMember = 'value', readonly cast: ValueCast = ValueCast.NONE ) {
		super();
	}

	static parse( key: string ): FieldToken | null {
		const { name, member, cast } = RenderToken.split( key );

		return name.length === 0 ? null : new FieldToken( name, member, cast );
	}

	get text(): string {
		return `${SENTINEL}field:${this.field}${RenderToken.memberText( this.member )}${this.cast.suffix}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return this.cast.convert( block.fieldValue( this.field, this.member ) );
	}
}

/**
 * `component:field:<name>`, with `/src` or `/href`, then a cast suffix: a field of the first placement of the
 * component a graph describes, converted by its cast. It names nothing where the block holds no placement, and
 * inside a repeated entry.
 */
export class ComponentFieldToken extends RenderToken {
	constructor( readonly field: string, readonly member: FieldMember = 'value', readonly cast: ValueCast = ValueCast.NONE ) {
		super();
	}

	static parse( key: string ): ComponentFieldToken | null {
		const { name, member, cast } = RenderToken.split( key );

		return name.length === 0 ? null : new ComponentFieldToken( name, member, cast );
	}

	get text(): string {
		return `${SENTINEL}component:field:${this.field}${RenderToken.memberText( this.member )}${this.cast.suffix}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return this.cast.convert( block.componentFieldValue( this.field, this.member ) );
	}
}

/**
 * `each:<key>`: a list bound to a page field that selects items, such as a multi-select or a Droplink,
 * published as one entry per selected item from the `jlsmRepeats` entry under the key, less any entry that
 * repeats an earlier one or its `@id`. It names no single value; the template expands it.
 */
export class EachToken extends RenderToken {
	constructor( readonly key: string ) {
		super();
	}

	/** True when the key may name a repeat: a letter or digit, then letters, digits, `.`, `_` or `-`, at most 100 in all. */
	static isKey( key: unknown ): key is string {
		return typeof key === 'string' && key.length <= EACH_KEY_LIMIT && EACH_KEY.test( key );
	}

	static parse( key: string ): EachToken | null {
		return EachToken.isKey( key ) ? new EachToken( key ) : null;
	}

	get text(): string {
		return `${SENTINEL}each:${this.key}`;
	}

	valueIn(): JsonValue | null {
		return null;
	}
}

/** What of the item being repeated a selected token reads. */
export type SelectedPart = 'displayName' | 'name' | 'field';

/**
 * `selected:displayName`, `selected:name` or `selected:field:<name>`, optionally with `/src` or `/href`: a value
 * of the item a repeat is publishing an entry for. Outside a repeat it names nothing.
 */
export class SelectedToken extends RenderToken {
	constructor( readonly part: SelectedPart, readonly field = '', readonly member: FieldMember = 'value', readonly cast: ValueCast = ValueCast.NONE ) {
		super();
	}

	static parse( key: string ): SelectedToken | null {
		if ( key === 'displayName' || key === 'name' ) return new SelectedToken( key );

		if ( !key.startsWith( 'field:' ) ) return null;

		const { name, member, cast } = RenderToken.split( key.slice( 6 ) );

		return name.length === 0 ? null : new SelectedToken( 'field', name, member, cast );
	}

	get text(): string {
		if ( this.part !== 'field' ) return `${SENTINEL}selected:${this.part}`;

		return `${SENTINEL}selected:field:${this.field}${RenderToken.memberText( this.member )}${this.cast.suffix}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return this.cast.convert( block.selectedValue( this.part, this.field, this.member ) );
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
 * `component:id/<fragment>`: the Auto identity of the node a per-placement graph publishes for one placement, the
 * page's own address and the fragment suffixed by the placement's short identity. It names nothing where the block
 * reads no placement.
 */
export class ComponentIdToken extends RenderToken {
	constructor( readonly fragment: string ) {
		super();
	}

	get text(): string {
		return `${SENTINEL}component:id/${this.fragment}`;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.componentId( this.fragment );
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

/** `external:<key>`: a value the head supplies from outside Sitecore, named by a key of letters, digits, `.`, `_` and `-`. */
export class ExternalToken extends RenderToken {
	private static readonly KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

	private static readonly KEY_LIMIT = 100;

	constructor( readonly key: string ) {
		super();
	}

	static parse( expression: string ): ExternalToken | null {
		return expression.length <= ExternalToken.KEY_LIMIT && ExternalToken.KEY.test( expression ) ? new ExternalToken( expression ) : null;
	}

	get text(): string {
		return `${SENTINEL}external:${this.key}`;
	}

	get namesExternal(): boolean {
		return true;
	}

	valueIn( block: ReferenceBlock ): JsonValue | null {
		return block.externalNamed( this.key );
	}
}

/**
 * Values from outside Sitecore that the head supplies. A `♣external:<key>` token is replaced whole by what
 * `lookup` answers for its key. A string opening with a custom sentinel, when one is given, is replaced the same
 * way by what `lookup` answers for the rest of the string. Null, undefined or blank drops the key, as for the
 * engine's own tokens. `lookup` runs during rendering, so the head fetches its data beforehand.
 */
export class ExternalValues {
	readonly sentinel: string | null;

	private reporter: JsonLdLogger | null = null;

	constructor( sentinel: string, lookup: ( key: string ) => JsonValue | null | undefined );
	constructor( sentinel: string | null, private readonly lookup: ( key: string ) => JsonValue | null | undefined ) {
		if ( sentinel !== null && ( sentinel.length !== 1 || sentinel === SENTINEL || sentinel.trim().length === 0 ) )
			throw new Error( `An external sentinel is one character in the Basic Multilingual Plane, other than ${SENTINEL}.` );

		this.sentinel = sentinel;
	}

	/** Values for `♣external:` tokens only, with no custom sentinel. */
	static of( lookup: ( key: string ) => JsonValue | null | undefined ): ExternalValues {
		return ExternalValues.make( null, lookup );
	}

	private static make( sentinel: string | null, lookup: ( key: string ) => JsonValue | null | undefined ): ExternalValues {
		return new ExternalValues( sentinel as string, lookup );
	}

	/** The value the text names; null when the head has none, undefined when the text is not one of these tokens. */
	valueOf( text: string ): JsonValue | null | undefined {
		if ( this.sentinel === null || !text.startsWith( this.sentinel ) ) return undefined;

		return this.answer( text.slice( this.sentinel.length ), this.sentinel );
	}

	/** The value the head has for the key of a `♣external:` token; null when it has none or the lookup throws. */
	named( key: string ): JsonValue | null {
		return this.answer( key, `${SENTINEL}external:` );
	}

	/** These values, telling the logger each time the head has no value, or a blank one, for a token, or its lookup throws. */
	reportingTo( logger: JsonLdLogger ): ExternalValues {
		const reporting = ExternalValues.make( this.sentinel, this.lookup );

		reporting.reporter = logger;

		return reporting;
	}

	private answer( key: string, prefix: string ): JsonValue | null {
		let value: JsonValue | null;

		try {
			value = this.lookup( key ) ?? null;
		} catch ( error ) {
			this.reporter?.warn( `The head's lookup failed for ${prefix}${key}: ${error instanceof Error ? error.message : String( error )}` );

			return null;
		}

		if ( value === null || ( typeof value === 'string' && value.trim().length === 0 ) )
			this.reporter?.warn( `The head has no value for ${prefix}${key}, so its key is left out of the JSON-LD.` );

		return value !== null && typeof value === 'object' ? structuredClone( value ) : value;
	}
}

/** What one resolution has found out so far. It lives for that resolution only, so a template shared between pages never carries it. */
class Outcome {
	emptyRequiredRepeat: RequiredRepeatGap | null = null;

	markRequiredRepeatEmpty( gap: RequiredRepeatGap ): void {
		this.emptyRequiredRepeat ??= gap;
	}
}

/** A required repeat over a component that yields no entry on a page, and whether an entry it resolved missed a key it needs. */
export class RequiredRepeatGap {
	constructor( readonly component: string, readonly lackedNeeds: boolean ) {}

	/** What the editing chip says for the rendering the repeat withholds. */
	get withheld(): string {
		return this.lackedNeeds
			? `The required repeat over ${this.component} finds items on this page, but none has its required values, so nothing is published here`
			: `The required repeat over ${this.component} finds nothing on this page, so nothing is published here`;
	}
}

/**
 * A compiled template, parsed once and never changed after: its tokens are parsed in the same walk, and
 * resolving it builds a new tree.
 */
export class CompiledTemplate {
	private constructor( readonly root: JsonValue, readonly namesPageDates: boolean, readonly externalTokens: number, private readonly tokens: ReadonlyMap<string, RenderToken | null> ) {}

	/** True when the template holds a `♣external:` token. */
	get namesExternal(): boolean {
		return this.externalTokens > 0;
	}

	/** The keys of the `♣each:` tokens the template holds, each once, in the order first met. */
	get eachKeys(): string[] {
		const keys = new Set<string>();

		for ( const token of this.tokens.values() ) if ( token instanceof EachToken ) keys.add( token.key );

		return [...keys];
	}

	/** The template the text holds, or null when it is blank or not JSON. */
	static parse( text: string | null | undefined ): CompiledTemplate | null {
		if ( text === null || text === undefined || text.trim().length === 0 ) return null;

		let root: JsonValue;

		try {
			root = JSON.parse( text ) as JsonValue;
		} catch {
			return null;
		}

		return CompiledTemplate.of( root );
	}

	/** A template over a tree already parsed, which it freezes and never changes. */
	static of( root: JsonValue ): CompiledTemplate {
		const tokens = new Map<string, RenderToken | null>();

		const externals = { count: 0 };
		const namesPageDates = CompiledTemplate.collect( root, tokens, externals );

		return new CompiledTemplate( root, namesPageDates, externals.count, tokens );
	}

	/**
	 * The document the template becomes on the page the block describes: every token substituted, a key whose
	 * token names nothing or blank dropped, and below the top-level entries an empty list or an object left with
	 * only its `@type` dropped. Null when the template is not an object, or when a required repeat over a
	 * component yields no entry.
	 */
	resolve( block: ReferenceBlock ): JsonObject | null {
		return this.resolution( block ).document;
	}

	/**
	 * The document {@link resolve} gives with the block, with the first required repeat that yields no entry and so
	 * leaves the document null; that repeat is null when none does or the template is not an object.
	 */
	resolution( block: ReferenceBlock ): { document: JsonObject | null; emptyRequiredRepeat: RequiredRepeatGap | null } {
		const outcome = new Outcome();
		const built = this.resolved( block, outcome );

		if ( built === null ) return { document: null, emptyRequiredRepeat: null };

		return outcome.emptyRequiredRepeat === null ? { document: built, emptyRequiredRepeat: null } : { document: null, emptyRequiredRepeat: outcome.emptyRequiredRepeat };
	}

	private resolved( block: ReferenceBlock, outcome: Outcome ): JsonObject | null {
		if ( !isJsonObject( this.root ) ) return null;

		return this.resolveObject( this.root, block, Array.isArray( this.root['@graph'] ) ? 0 : ENTITY_DEPTH, outcome );
	}

	private static collect( node: JsonValue, tokens: Map<string, RenderToken | null>, externals: { count: number } ): boolean {
		if ( typeof node === 'string' ) {
			if ( !node.startsWith( SENTINEL ) ) return false;

			const token = tokens.get( node ) ?? RenderToken.tryParse( node );

			tokens.set( node, token );

			if ( token?.namesExternal ) externals.count++;

			return token?.namesPageDate ?? false;
		}

		if ( node === null || typeof node !== 'object' ) return false;

		let namesPageDates = false;

		for ( const value of Array.isArray( node ) ? node : Object.values( node ) ) namesPageDates = CompiledTemplate.collect( value, tokens, externals ) || namesPageDates;

		Object.freeze( node );

		return namesPageDates;
	}

	private resolveObject( node: JsonObject, block: ReferenceBlock, depth: number, outcome: Outcome ): JsonObject {
		const resolved: JsonObject = {};

		for ( const key of Object.keys( node ) ) {
			const value = this.resolveValue( node[key], block, depth, outcome );

			if ( value !== undefined ) resolved[key] = value;
		}

		return resolved;
	}

	private resolveArray( node: JsonValue[], block: ReferenceBlock, depth: number, outcome: Outcome ): JsonValue[] {
		const resolved: JsonValue[] = [];

		for ( const entry of node ) {
			const value = this.resolveValue( entry, block, depth, outcome );

			if ( value !== undefined ) resolved.push( value );
		}

		return resolved;
	}

	private resolveValue( value: JsonValue, block: ReferenceBlock, depth: number, outcome: Outcome ): JsonValue | undefined {
		const result = this.valueOf( value, block, depth, outcome );

		return result === undefined || sayless( result, depth ) ? undefined : result;
	}

	private valueOf( value: JsonValue, block: ReferenceBlock, depth: number, outcome: Outcome ): JsonValue | undefined {
		if ( typeof value === 'string' ) {
			const token = value.startsWith( SENTINEL ) ? this.tokens.get( value ) ?? null : undefined;
			const found = token === undefined
				? block.externalValue( value )
				: token instanceof EachToken ? CompiledTemplate.expanded( token, block, depth, outcome ) : token?.valueIn( block ) ?? null;

			if ( found === undefined ) return value;

			return found === null || ( typeof found === 'string' && trimmed( found ).length === 0 ) ? undefined : found;
		}

		if ( Array.isArray( value ) ) return this.resolveArray( value, block, depth + 1, outcome );

		if ( isJsonObject( value ) ) return this.resolveObject( value, block, depth + 1, outcome );

		return value;
	}

	/**
	 * The entries a repeat publishes: its entry resolved once per item the page field selects, at the depth an
	 * entry of a literal list sits, with an entry identical to an earlier one, or carrying an earlier one's `@id`,
	 * left out. Null inside a repeat, for a key no repeat names, or when no entry is left.
	 */
	private static expanded( each: EachToken, block: ReferenceBlock, depth: number, outcome: Outcome ): JsonValue[] | null {
		if ( block.inRepeat ) return null;

		const repeat = block.repeats.get( each.key );

		if ( repeat === null ) return null;

		const { entries, lackedNeeds } = repeat.resolvedFor( block, repeat.source.itemsIn( block ), depth + 1 );

		if ( entries.length > 0 ) return entries.map( entry => entry.entry );

		if ( repeat.required && repeat.source instanceof ComponentSource ) outcome.markRequiredRepeatEmpty( new RequiredRepeatGap( repeat.source.component, lackedNeeds ) );

		return null;
	}

	/** The entry for one selected item, its own `@id` removed unless it is a web address, and dropped if that leaves it saying nothing. */
	entryFor( selected: ReferenceBlock, depth: number ): JsonValue | undefined {
		const kept = this.resolveValue( this.root, selected, depth, new Outcome() );

		if ( kept === undefined ) return undefined;

		const entry = isJsonObject( kept ) && ID_KEY in kept && !CompiledTemplate.isWebAddress( kept[ID_KEY] ) ? CompiledTemplate.withoutId( kept ) : kept;

		return sayless( entry, depth ) ? undefined : entry;
	}

	private static withoutId( entry: JsonObject ): JsonObject {
		const copy = { ...entry };

		delete copy[ID_KEY];

		return copy;
	}

	/** True for an absolute `http` or `https` address with a host, written with no surrounding whitespace. */
	private static isWebAddress( value: unknown ): boolean {
		if ( typeof value !== 'string' || value.length === 0 || value !== value.trim() ) return false;

		const schemeEnd = value.indexOf( SCHEME_SEPARATOR );

		if ( schemeEnd < 0 ) return false;

		const scheme = value.slice( 0, schemeEnd ).toLowerCase();

		if ( scheme !== 'http' && scheme !== 'https' ) return false;

		return CompiledTemplate.hostOf( value.slice( schemeEnd + SCHEME_SEPARATOR.length ) ).length > 0;
	}

	private static hostOf( afterScheme: string ): string {
		const authority = afterScheme.split( /[/?#]/ )[0];
		const host = authority.slice( authority.lastIndexOf( '@' ) + 1 );
		const port = host.lastIndexOf( ':' );

		return port < 0 || host.endsWith( ']' ) ? host : host.slice( 0, port );
	}
}

/**
 * Where a repeat reads the items it publishes an entry for.
 */
export abstract class RepeatSource {
	abstract itemsIn( block: ReferenceBlock ): SelectedItem[];
}

/** A repeat over the items a field of the page selects. */
export class PageFieldSource extends RepeatSource {
	constructor( readonly field: string ) {
		super();
	}

	itemsIn( block: ReferenceBlock ): SelectedItem[] {
		return block.selectedIn( this.field );
	}
}

/**
 * A repeat over a component placed on the page: the items a field of its datasource holds, or, with no field, the
 * placements themselves. Each item is read once, the first kept.
 */
export class ComponentSource extends RepeatSource {
	constructor( readonly component: string, readonly items: string | null ) {
		super();
	}

	itemsIn( block: ReferenceBlock ): SelectedItem[] {
		return oneOfEach( block.placementsOf( this.component ).flatMap( placement => this.itemsOf( placement ) ), item => item.id );
	}

	private itemsOf( placement: Placement ): SelectedItem[] {
		return this.items === null ? [placement.asItem()] : placement.itemsIn( this.items );
	}
}

/** One entry a repeat publishes, resolved, with the item it was resolved for. */
export interface RepeatedEntry {
	item: SelectedItem;
	entry: JsonValue;
}

/** One `jlsmRepeats` entry: where its items come from, the entry published for each, whether the graph needs it, and the keys each entry needs. */
export class Repeat {
	constructor( readonly source: RepeatSource, readonly entry: CompiledTemplate, readonly required: boolean, readonly needs: readonly string[] ) {}

	/**
	 * The entries the repeat publishes for the items, each resolved at the depth with its item selected, in item
	 * order: an entry missing a key the repeat needs left out, then an entry identical to an earlier one, or
	 * carrying an earlier one's `@id`, left out.
	 */
	entriesFor( block: ReferenceBlock, items: Iterable<SelectedItem>, depth: number ): RepeatedEntry[] {
		return this.resolvedFor( block, items, depth ).entries;
	}

	/** The entries {@link entriesFor} gives, and whether an entry resolved but missed a key the repeat needs. */
	resolvedFor( block: ReferenceBlock, items: Iterable<SelectedItem>, depth: number ): { entries: RepeatedEntry[]; lackedNeeds: boolean } {
		const entries: RepeatedEntry[] = [];
		const published = new Set<string>();
		const ids = new Set<string>();
		let lackedNeeds = false;

		for ( const item of items ) {
			const resolved = this.entry.entryFor( block.withSelected( item ), depth );

			if ( resolved === undefined ) continue;

			if ( !this.meets( resolved ) ) {
				lackedNeeds = true;

				continue;
			}

			const text = JSON.stringify( resolved );

			if ( published.has( text ) ) continue;

			const id = isJsonObject( resolved ) && typeof resolved[ID_KEY] === 'string' ? resolved[ID_KEY] : null;

			if ( id !== null && ids.has( id ) ) continue;

			published.add( text );

			if ( id !== null ) ids.add( id );

			entries.push( { item, entry: resolved } );
		}

		return { entries, lackedNeeds };
	}

	/** True when the entry holds every key the repeat needs. */
	private meets( entry: JsonValue ): boolean {
		return this.needs.every( need => isJsonObject( entry ) && Object.prototype.hasOwnProperty.call( entry, need ) );
	}
}

/**
 * The datasource's `jlsmRepeats`: for each `each:` key, the source of the items it repeats over, a page field or a
 * component placed on the page, and the compiled entry published once per item. Read once per rendering; each
 * entry is parsed here, once.
 */
export class Repeats {
	/** No repeats at all. */
	static readonly EMPTY = new Repeats( new Map() );

	private constructor( private readonly held: ReadonlyMap<string, Repeat> ) {}

	/**
	 * The repeats the text holds. Never throws: text that is blank, not JSON or not an object is {@link EMPTY}, and
	 * a key that is malformed, or names no field or no entry, is left out.
	 */
	static parse( text: string | null | undefined ): Repeats {
		if ( text === null || text === undefined || text.trim().length === 0 ) return Repeats.EMPTY;

		let root: unknown;

		try {
			root = JSON.parse( text );
		} catch {
			return Repeats.EMPTY;
		}

		return isJsonObject( root ) ? new Repeats( Repeats.read( root ) ) : Repeats.EMPTY;
	}

	/** The repeat the key names, its entry already parsed, or null when there is none. */
	get( key: string ): Repeat | null {
		return this.held.get( key ) ?? null;
	}

	/** True when a repeat is filed under the key. */
	holds( key: string ): boolean {
		return this.held.has( key );
	}

	/**
	 * The entries the repeat under the key publishes for the items on the page the block reads, each with its item,
	 * as {@link Repeat.entriesFor} gives them at the depth an entry of a top-level property sits. Empty when no
	 * repeat has the key.
	 */
	entriesFor( key: string, block: ReferenceBlock, items: Iterable<SelectedItem> ): RepeatedEntry[] {
		return this.held.get( key )?.entriesFor( block, items, ENTITY_DEPTH + 1 ) ?? [];
	}

	private static read( root: JsonObject ): Map<string, Repeat> {
		const held = new Map<string, Repeat>();

		for ( const key of Object.keys( root ) ) {
			const source = Repeats.sourceOf( root[key] );
			const entry = member( root[key], 'entry' );

			if ( !EachToken.isKey( key ) || source === null ) continue;

			if ( entry === undefined || entry === null ) continue;

			held.set( key, new Repeat( source, CompiledTemplate.of( entry as JsonValue ), member( root[key], 'required' ) === true, Repeats.needsOf( member( root[key], 'needs' ) ) ) );
		}

		return held;
	}

	private static needsOf( needs: unknown ): string[] {
		return Array.isArray( needs ) ? [...new Set( needs.filter( ( need ): need is string => typeof need === 'string' && need.length > 0 ) )] : [];
	}

	private static sourceOf( repeat: unknown ): RepeatSource | null {
		const field = member( repeat, 'field' );

		if ( typeof field === 'string' && field.trim().length > 0 ) return new PageFieldSource( field );

		const component = member( repeat, 'component' );
		const items = member( repeat, 'items' );

		if ( typeof component !== 'string' || component.trim().length === 0 ) return null;

		return new ComponentSource( component, typeof items === 'string' && items.trim().length > 0 ? items : null );
	}
}

/**
 * One item selected in a multi-select page field, as the layout gives it. `displayName` falls back to `name`
 * when the wire's is blank.
 */
export interface SelectedItem {
	id: string;
	name: string;
	displayName: string;
	fields: Record<string, unknown> | null;
	/** The item's `url` as the wire gives it, when it carries one as text. */
	url?: string;
}

/**
 * The items a route field holds, in field order: each object of an array, or the one item a Droplink's object
 * with an `id` is. Anything else, a string or a `{ value }` among them, holds none; a string is never split.
 */
export function selectedItemsOf( field: unknown ): SelectedItem[] {
	if ( Array.isArray( field ) ) return field.filter( isJsonObject ).map( selectedItemOf );

	return isJsonObject( field ) && 'id' in field ? [selectedItemOf( field )] : [];
}

/** The items in order with each id once, the first kept; an item whose id is blank or only braces, parentheses and dashes is always kept. */
function oneOfEach<T>( items: T[], idOf: ( item: T ) => string ): T[] {
	const seen = new Set<string>();

	return items.filter( item => {
		const id = RecordId.of( idOf( item ) );

		if ( id === null ) return true;

		if ( seen.has( id.key ) ) return false;

		seen.add( id.key );

		return true;
	} );
}

function selectedItemOf( item: JsonObject ): SelectedItem {
	const name = typeof item['name'] === 'string' ? item['name'] : '';
	const displayName = item['displayName'];
	const fields = item['fields'];

	const url = item['url'];

	return {
		id: typeof item['id'] === 'string' ? item['id'] : '',
		name,
		displayName: typeof displayName === 'string' && displayName.trim().length > 0 ? displayName : name,
		fields: isJsonObject( fields ) ? fields : null,
		...( typeof url === 'string' ? { url } : {} )
	};
}

/**
 * One component placed on a page, as the layout wire gives it: its name, its uid, the datasource it names and
 * the fields that datasource holds. A component graph repeats over the placements of the component it is for.
 */
export class Placement {
	constructor(
		readonly componentName: string,
		readonly uid: string,
		readonly dataSource: string,
		readonly fields: Record<string, unknown> | null ) {}

	/**
	 * Every placement of the component on the route, depth-first through the placeholders in wire order. The
	 * JSON-LD component is never a placement.
	 */
	static in( route: RouteData | null | undefined, componentName: string ): Placement[] {
		if ( componentName === COMPONENT_NAME ) return [];

		return renderings( route?.placeholders )
			.filter( component => component.componentName === componentName )
			.map( component => Placement.of( component, componentName ) );
	}

	/** The name of every component placed on the route, each once, in layout order; the JSON-LD component and a nameless one left out. */
	static namesIn( route: RouteData | null | undefined ): string[] {
		const names = renderings( route?.placeholders )
			.map( component => component.componentName )
			.filter( ( name ): name is string => typeof name === 'string' && name.length > 0 && name !== COMPONENT_NAME );

		return [...new Set( names )];
	}

	/** The placements in order with each {@link identity} once, the first kept. */
	static distinct( placements: Placement[] ): Placement[] {
		return oneOfEach( placements, placement => placement.identity );
	}

	private static of( component: ComponentRendering, componentName: string ): Placement {
		return new Placement(
			componentName,
			typeof component.uid === 'string' ? component.uid : '',
			typeof component.dataSource === 'string' ? component.dataSource : '',
			isJsonObject( component.fields ) ? component.fields : null );
	}

	/** The datasource's id when the datasource is one, as {@link namesAnId} tells; otherwise the placement's uid. */
	get identity(): string {
		return this.namesAnId ? this.dataSource : this.uid;
	}

	/** The identity as a per-placement `@id` suffixes its fragment with: its {@link RecordId.short}. */
	get shortIdentity(): string {
		return RecordId.of( this.identity )?.short ?? '';
	}

	/** This placement as the item its entry's tokens read. */
	asItem(): SelectedItem {
		return { id: this.identity, name: this.componentName, displayName: this.componentName, fields: this.fields };
	}

	/** The value of the field of this placement's datasource, as a route field's `value` holds it. */
	fieldValue( field: string ): unknown {
		return member( this.fields, field, 'value' );
	}

	/**
	 * The items the field of this placement's datasource selects, in field order, without the datasource item
	 * itself: a children field leads with it, and it is never one of its own entries. On an id datasource that is
	 * every item with the datasource's id. On a path datasource it is the first item of {@link CHILDREN_FIELD} alone,
	 * when its name is the path's last segment, compared with ASCII letters in either case, and every later item
	 * carrying a `url` sits under the first item's `url`.
	 */
	itemsIn( field: string ): SelectedItem[] {
		const items = selectedItemsOf( this.fields?.[field] );
		const leadsWithDatasource = field === CHILDREN_FIELD && this.leadsWithDatasource( items );

		return items.filter( ( item, index ) => !( index === 0 && leadsWithDatasource ) && !this.isDatasource( item ) );
	}

	/** The datasource's id when the datasource is one; null for a path or an empty datasource, which leave no item out. */
	private get datasourceId(): RecordId | null {
		return this.namesAnId ? RecordId.of( this.dataSource ) : null;
	}

	/**
	 * True when the datasource, trimmed of {@link WHITESPACE}, is a GUID of 32 hex digits, bare with all four dashes
	 * or none, or dashed inside braces or parentheses.
	 */
	private get namesAnId(): boolean {
		return GUID.test( trimmed( this.dataSource ) );
	}

	/**
	 * The last segment of the datasource when it is a path, trimmed of {@link WHITESPACE} and any trailing slash; null
	 * for an id, or an empty datasource, which leave no item out.
	 */
	private get datasourceName(): string | null {
		if ( this.namesAnId ) return null;

		const path = trimEnd( trimmed( this.dataSource ), '/' );

		return path.length === 0 ? null : path.slice( path.lastIndexOf( '/' ) + 1 );
	}

	private isDatasource( item: SelectedItem ): boolean {
		const id = this.datasourceId;

		return id !== null && RecordId.of( item.id )?.key === id.key;
	}

	private leadsWithDatasource( items: SelectedItem[] ): boolean {
		const name = this.datasourceName;

		return name !== null && items.length > 0 && Placement.asciiLowered( items[0].name ) === Placement.asciiLowered( name ) && Placement.holdsTheRest( items );
	}

	/** True when every item after the first that carries a `url` sits under the first item's `url`, or the first carries none. */
	private static holdsTheRest( items: SelectedItem[] ): boolean {
		const folder = items[0].url;

		if ( folder === undefined ) return true;

		const under = `${Placement.asciiLowered( trimEnd( folder, '/' ) )}/`;

		return items
			.slice( 1 )
			.map( item => item.url )
			.filter( ( url ): url is string => url !== undefined )
			.every( url => Placement.asciiLowered( url ).startsWith( under ) );
	}

	private static asciiLowered( text: string ): string {
		return text.replace( ASCII_UPPER, letter => letter.toLowerCase() );
	}
}

const DASHED_GUID = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}';

const GUID = new RegExp( `^(?:[0-9A-Fa-f]{32}|${DASHED_GUID}|\\{${DASHED_GUID}\\}|\\(${DASHED_GUID}\\))$` );

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
	/** True when `jlsmContract` is `2`, the contract of a graph that describes pages; false for `3`, a graph that describes a component. */
	readonly contractOk: boolean;
	/** True when `jlsmContract` is a contract this engine reads: `2`, or `3` for a graph that describes a component. */
	readonly contractReadable: boolean;
	readonly component: string | null;
	readonly emission: string | null;
	readonly placements: Placement[];
	private notes: { withheld: string | null; found: string | null } | null = null;

	constructor( component: ComponentRendering, route: RouteData | null | undefined, context: Record<string, unknown> | null | undefined, templates: CompiledTemplates = compiledTemplates ) {
		this.uid = component.uid;
		this.template = templates.parse( textOf( component.fields?.[JSON_TEMPLATE_FIELD] ) );
		this.block = new ReferenceBlock( component.fields, route, context );
		const contract = trimmed( textOf( component.fields?.[CONTRACT_FIELD] ) ?? '' );

		this.contractOk = contract === CONTRACT;
		this.contractReadable = contract === CONTRACT || contract === COMPONENT_CONTRACT;
		this.component = namedOrNull( textOf( component.fields?.[COMPONENT_FIELD] ) );
		this.emission = namedOrNull( textOf( component.fields?.[EMISSION_FIELD] ) );
		this.placements = this.component === null ? [] : this.block.placementsOf( this.component );
	}

	/** The component the graph describes when the page does not place it, so nothing is published here; otherwise null. */
	get unplacedComponent(): string | null {
		return this.contractReadable && this.placements.length === 0 ? this.component : null;
	}

	/**
	 * The document this rendering publishes with the block: nothing on a contract the head does not read; a page
	 * graph's template resolved as it stands, on contract `2` only; a component graph's template resolved against the
	 * first placement of its component, or nothing where the component is not placed or the emission mode is not one
	 * this head knows.
	 */
	resolve( block: ReferenceBlock ): JsonObject | null {
		const read = this.oneDocumentRead( block );

		return read === null ? null : this.template?.resolve( read ) ?? null;
	}

	/**
	 * Every document this rendering publishes with the block: for a component graph whose emission is
	 * {@link EMISSION_EACH}, one per placement of its component in layout order, each resolved against that placement
	 * alone and each placement identity once, the first kept; for any other rendering, the one document
	 * {@link resolve} gives, or none.
	 */
	resolveAll( block: ReferenceBlock ): JsonObject[] {
		return this.reads( block )
			.map( read => this.template?.resolve( read ) ?? null )
			.filter( ( document ): document is JsonObject => document !== null );
	}

	/**
	 * What the editing chip says when this rendering publishes nothing here though its contract is one the head
	 * reads: its component is not placed, it is on contract `3` but names no component, its emission mode is not one
	 * this head knows, or a required repeat finds nothing on this page, read with its own block. Null when nothing
	 * withholds it.
	 */
	get withheld(): string | null {
		return this.chipNotes.withheld;
	}

	/**
	 * For the editing chip: how many placements of its component a per-placement graph publishes a node for, read
	 * with its own block, and whether placements whose documents share their `@id`s leave all but the first
	 * unpublished. Null for any other rendering, or when no placement publishes.
	 */
	get placementsFound(): string | null {
		return this.chipNotes.found;
	}

	private get publishesEachPlacement(): boolean {
		return this.contractReadable && this.component !== null && this.emission === EMISSION_EACH;
	}

	/** {@link withheld} and {@link placementsFound}, worked out together the first time either is read. */
	private get chipNotes(): { withheld: string | null; found: string | null } {
		return this.notes ??= this.notesOf();
	}

	private notesOf(): { withheld: string | null; found: string | null } {
		const unplaced = this.unplacedComponent;

		if ( unplaced !== null ) return { withheld: `No ${unplaced} on this page, so nothing is published here`, found: null };

		if ( this.contractReadable && !this.contractOk && this.component === null ) return { withheld: 'This graph is on the component contract but names no component, so nothing is published here', found: null };

		if ( this.contractReadable && this.component !== null && this.emission !== null && !this.publishesEachPlacement ) return { withheld: `This head does not know the emission mode ${this.emission}, so nothing is published here`, found: null };

		const template = this.template;

		if ( template === null ) return { withheld: null, found: null };

		const resolutions = this.reads( this.block ).map( read => template.resolution( read ) );

		if ( resolutions.length > 0 && resolutions.every( resolution => resolution.emptyRequiredRepeat !== null ) )
			return { withheld: resolutions[0].emptyRequiredRepeat?.withheld ?? null, found: null };

		const documents = resolutions.map( resolution => resolution.document ).filter( ( document ): document is JsonObject => document !== null );

		return { withheld: null, found: this.publishesEachPlacement ? this.found( documents ) : null };
	}

	/**
	 * The count of the documents, one per placement, that leave the page at least one entry once each non-blank `@id`
	 * is kept the first time only, with a note when some leave none; null when none publishes.
	 */
	private found( documents: JsonObject[] ): string | null {
		const seen = new Set<string>();
		let count = 0;

		for ( const document of documents ) {
			let kept = false;
			const graph = document['@graph'];

			for ( const entry of Array.isArray( graph ) ? graph.filter( isJsonObject ) : [document] ) {
				const id = JsonLdPage.idOf( entry );

				if ( id === null || !seen.has( id ) ) kept = true;

				if ( id !== null ) seen.add( id );
			}

			if ( kept ) count++;
		}

		if ( count === 0 ) return null;

		const found = `${count} ${this.component} placement${count === 1 ? '' : 's'} found`;

		return count < documents.length ? `${found}; some share an @id, so only the first of each is published` : found;
	}

	/** The blocks, built from the block, this rendering resolves its template with to publish: one per document. */
	private reads( block: ReferenceBlock ): ReferenceBlock[] {
		if ( this.publishesEachPlacement ) return this.distinctPlacements.map( placement => block.withPlacementAlone( placement ) );

		const read = this.oneDocumentRead( block );

		return read === null ? [] : [read];
	}

	private oneDocumentRead( block: ReferenceBlock ): ReferenceBlock | null {
		if ( !this.contractReadable ) return null;

		if ( this.component === null ) return this.contractOk ? block : null;

		if ( this.placements.length === 0 || this.emission !== null ) return null;

		return block.withPlacement( this.placements[0] );
	}

	private get distinctPlacements(): Placement[] {
		return Placement.distinct( this.placements );
	}

	/**
	 * Every document the rendering resolves: its template, then the entry of each repeat the template's `♣each:`
	 * tokens name. Empty where there is no template.
	 */
	get documents(): CompiledTemplate[] {
		if ( this.template === null ) return [];

		const entries = this.template.eachKeys
			.map( key => this.block.repeats.get( key )?.entry )
			.filter( ( entry ): entry is CompiledTemplate => entry !== undefined );

		return [this.template, ...entries];
	}

	/** True when the template or a repeat entry it publishes names a page date, so a head knows it is worth reading them. */
	get wantsPageDates(): boolean {
		return this.documents.some( document => document.namesPageDates );
	}

	/** True when the template or a repeat entry it publishes names a `♣external:` token. */
	get wantsExternal(): boolean {
		return this.externalTokens > 0;
	}

	/** How many `♣external:` tokens the template and the repeat entries it publishes hold. */
	get externalTokens(): number {
		return this.documents.reduce( ( total, document ) => total + document.externalTokens, 0 );
	}

	/** Every JSON-LD component on the page, depth-first through the placeholders in wire order. */
	static findAll( layout: LayoutServiceData | null | undefined, templates: CompiledTemplates = compiledTemplates ): JsonLdRendering[] {
		const route = layout?.sitecore?.route ?? null;
		const context = layout?.sitecore?.context ?? null;

		return renderings( route?.placeholders )
			.filter( component => component.componentName === COMPONENT_NAME )
			.map( component => new JsonLdRendering( component, route, context, templates ) );
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
	private readonly selected: SelectedItem | null;

	/** The repeats the component's `each:` tokens name, read from its `jlsmRepeats` once per rendering. */
	readonly repeats: Repeats;

	constructor(
		private readonly component: Record<string, unknown> | undefined,
		private readonly route: RouteData | null | undefined,
		private readonly context: Record<string, unknown> | null | undefined,
		dates: PageItemDates | null = null,
		records: ReadonlyMap<string, JsonValue> = recordsOf( component ),
		repeats: Repeats = Repeats.parse( textOf( component?.[REPEATS_FIELD] ) ),
		selected: SelectedItem | null = null,
		private readonly external: ExternalValues | null = null,
		private readonly current: Placement | null = null,
		private readonly currentAlone = false ) {
		this.records = records;
		this.repeats = repeats;
		this.selected = selected;
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
		return new ReferenceBlock( this.component, this.route, this.context, dates ?? null, this.records, this.repeats, this.selected, this.external, this.current, this.currentAlone );
	}

	/** A block like this one that also answers for the values the head supplies. This block is left as it is. */
	withExternalValues( external: ExternalValues | null | undefined ): ReferenceBlock {
		return new ReferenceBlock( this.component, this.route, this.context, this.dates, this.records, this.repeats, this.selected, external ?? null, this.current, this.currentAlone );
	}

	/** The value the head supplies for the text; null when it has none, undefined when the text is not its token. */
	externalValue( text: string ): JsonValue | null | undefined {
		return this.external?.valueOf( text );
	}

	/** The value the head supplies for a `♣external:` key; null when it has none or supplies no values. */
	externalNamed( key: string ): JsonValue | null {
		return this.external?.named( key ) ?? null;
	}

	/**
	 * A block like this one while a repeat publishes the entry for the item: selected tokens read the item, every
	 * other token reads what it read before. This block is left as it is.
	 */
	withSelected( item: SelectedItem ): ReferenceBlock {
		return new ReferenceBlock( this.component, this.route, this.context, this.dates, this.records, this.repeats, item, this.external, this.current, this.currentAlone );
	}

	/**
	 * A block like this one reading the placement as the component a graph describes: `component:field:` tokens
	 * read its fields, every other token reads what it read before. This block is left as it is.
	 */
	withPlacement( placement: Placement ): ReferenceBlock {
		return new ReferenceBlock( this.component, this.route, this.context, this.dates, this.records, this.repeats, this.selected, this.external, placement, false );
	}

	/**
	 * A block like this one reading the placement as the one placement a per-placement graph publishes a node for: as
	 * {@link withPlacement}, and a repeat over the placement's own component reads it alone. This block is left as it is.
	 */
	withPlacementAlone( placement: Placement ): ReferenceBlock {
		return new ReferenceBlock( this.component, this.route, this.context, this.dates, this.records, this.repeats, this.selected, this.external, placement, true );
	}

	/** The Auto identity of the placement the block reads, its fragment suffixed by the placement's short identity; null when it reads none. */
	componentId( fragment: string ): string | null {
		if ( this.current === null ) return null;

		return this.address.id( this.itemPath, `${fragment}-${this.current.shortIdentity}` );
	}

	/** A field of the placement the block reads as the component a graph describes, or null when it reads none or a repeat is publishing an entry. */
	componentFieldValue( field: string, part: FieldMember ): JsonValue | null {
		if ( this.current === null || this.inRepeat ) return null;

		return this.memberOf( this.current.fieldValue( field ), part );
	}

	/** True while a repeat publishes an entry, where a further `each:` names nothing. */
	get inRepeat(): boolean {
		return this.selected !== null;
	}

	/**
	 * The placements of the component on the page, in wire order; only the placement the block reads alone when the
	 * component is that placement's.
	 */
	placementsOf( component: string ): Placement[] {
		if ( this.currentAlone && this.current !== null && this.current.componentName === component ) return [this.current];

		return Placement.in( this.route, component );
	}

	/** The items the page field selects, in field order, each id once, the first kept; an item with no id is always kept. */
	selectedIn( field: string ): SelectedItem[] {
		return oneOfEach( selectedItemsOf( this.fields[field] ), item => item.id );
	}

	/** A value of the item a repeat is publishing an entry for, or null outside a repeat. */
	selectedValue( part: SelectedPart, field: string, fieldPart: FieldMember ): JsonValue | null {
		if ( this.selected === null ) return null;

		if ( part === 'displayName' ) return this.selected.displayName;

		if ( part === 'name' ) return this.selected.name;

		return this.memberOf( member( this.selected.fields, field, 'value' ), fieldPart );
	}

	/** The value the token text names, or null when it is not a token or names nothing. */
	lookup( text: string ): JsonValue | null {
		return RenderToken.tryParse( text )?.valueIn( this ) ?? null;
	}

	/**
	 * A field's value, or for an image or link its URL: a root-relative URL joined to the site root when there is
	 * one, a protocol-relative URL given `https:`, and an image's `w`, `h`, `mw` and `mh` parameters removed.
	 */
	fieldValue( field: string, part: FieldMember ): JsonValue | null {
		return this.memberOf( member( this.fields, field, 'value' ), part );
	}

	private memberOf( value: unknown, part: FieldMember ): JsonValue | null {
		if ( part !== 'value' ) return this.url( member( value, part ), part );

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

	private readonly noted: JsonLdRendering[] = [];

	/** What the editing chip says of the renderings that publish nothing here, in wire order. */
	get withheld(): readonly string[] {
		return this.noted.map( rendering => rendering.withheld ).filter( ( note ): note is string => note !== null );
	}

	/** What the editing chip says of the placements each per-placement graph found, in wire order. */
	get placementsFound(): readonly string[] {
		return this.noted.map( rendering => rendering.placementsFound ).filter( ( note ): note is string => note !== null );
	}

	get isEmpty(): boolean {
		return this.nodes.length === 0;
	}

	/**
	 * Contributes the document's `@graph` entries, or the document itself as one node; given a list, each document's
	 * in order. The page takes the documents over rather than copying them, so the caller must not change them afterwards.
	 */
	add( document: JsonObject | readonly JsonObject[] | null | undefined ): void {
		if ( Array.isArray( document ) ) {
			for ( const each of document ) this.add( each );

			return;
		}

		if ( !isJsonObject( document ) ) return;

		const graph = document['@graph'];

		for ( const node of Array.isArray( graph ) ? graph.filter( isJsonObject ) : [document] ) {
			const id = JsonLdPage.idOf( node );

			if ( id !== null ) {
				if ( this.ids.has( id ) ) continue;

				this.ids.add( id );
			}

			delete node['@context'];

			this.nodes.push( node );
			this.written = null;
		}
	}

	/** The `@id` the page dedupes the node by: its `@id` when that is text that is not blank, null when it is not. */
	static idOf( node: JsonObject ): string | null {
		const id = node['@id'];

		return typeof id === 'string' && trimmed( id ).length > 0 ? id : null;
	}

	/** Keeps the rendering for what the editing chip says of it, worked out when the chip is written. */
	note( rendering: JsonLdRendering ): void {
		this.noted.push( rendering );
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
	 * dates the head read with {@link readPageDates}; without them a date token falls back to `data.page`, and
	 * drops its key when that has none. `external` are the values the head supplies from outside Sitecore; without
	 * them a `♣external:` token drops its key and a token of a custom sentinel stays as its text.
	 */
	static buildPage( layout: LayoutServiceData | null | undefined, logger: JsonLdLogger = silentLogger, dates: PageItemDates | null = null, external: ExternalValues | null = null ): JsonLdPage {
		const page = new JsonLdPage();
		const supplied = external?.reportingTo( logger ) ?? null;

		const renderings = JsonLdRendering.findAll( layout );

		for ( const rendering of renderings ) {
			if ( !rendering.contractReadable ) {
				logger.warn( `JSON-LD component ${rendering.uid ?? '(no uid)'} is not on a contract this head reads (${CONTRACT}, or ${COMPONENT_CONTRACT} for a graph that describes a component), so nothing is emitted for it. Upgrade the app and republish its graph.` );

				continue;
			}

			page.note( rendering );
			page.add( rendering.resolveAll( rendering.block.withPageDates( dates ).withExternalValues( supplied ) ) );
		}

		if ( supplied === null )
			JsonLdPage.warnUnsupplied( renderings, logger );

		return page;
	}

	private static warnUnsupplied( renderings: JsonLdRendering[], logger: JsonLdLogger ): void {
		const left = renderings
			.filter( rendering => rendering.contractReadable && rendering.wantsExternal )
			.reduce( ( total, rendering ) => total + rendering.externalTokens, 0 );

		if ( left > 0 )
			logger.warn( `${left} external data value(s) on this page are left out: the head supplies no lookup.` );
	}

	/** True when a JSON-LD rendering on the layout names a page date. */
	static wantsPageDates( layout: LayoutServiceData | null | undefined ): boolean {
		return JsonLdRendering.findAll( layout ).some( rendering => rendering.contractReadable && rendering.wantsPageDates );
	}
}

/**
 * The page item's dates from published Experience Edge, for {@link JsonLdPage.buildPage}. Asks only when there
 * is a context id, the route has an item id and a JSON-LD rendering on the page names a date; otherwise null.
 * Holds the answer per context id, item and language, for five minutes unless `holdMs` says otherwise, and
 * shares one read between renderings asking at once. A read that fails or outlasts the timeout gives null and
 * is not held, so the next page tries again.
 */
export async function readPageDates( layout: LayoutServiceData | null | undefined, options: PageDatesOptions ): Promise<PageItemDates | null> {
	const route = layout?.sitecore?.route;
	const itemId = route?.itemId ?? '';
	const language = route?.itemLanguage ?? '';

	const source = PageDatesSource.of( options );

	if ( source === null || itemId.length === 0 || !JsonLdPage.wantsPageDates( layout ) ) return null;

	return heldDates.get( `${source.key}|${itemId}|${language}`, options.holdMs ?? HOLD_MS, () => askEdge( itemId, language, source, options ) );
}

/** Where the page-dates read goes and what it presents: an API key in a header, or a context id in the address. */
class PageDatesSource {
	private constructor( readonly address: string, readonly headers: Record<string, string>, readonly key: string ) {}

	/** The source the options name, or null when they name neither a context id nor an API key with its endpoint. */
	static of( options: PageDatesOptions ): PageDatesSource | null {
		const apiKey = options.apiKey ?? '';

		if ( apiKey.length > 0 ) {
			const url = options.url ?? '';

			return url.length > 0 ? new PageDatesSource( url, { 'Content-Type': 'application/json', sc_apikey: apiKey }, url ) : null;
		}

		if ( options.contextId.length === 0 ) return null;

		return new PageDatesSource( `${options.url ?? EDGE_URL}?sitecoreContextId=${encodeURIComponent( options.contextId )}`, { 'Content-Type': 'application/json' }, options.contextId );
	}
}

async function askEdge( itemId: string, language: string, source: PageDatesSource, options: PageDatesOptions ): Promise<PageItemDates | null | undefined> {
	try {
		const response = await ( options.fetch ?? fetch )( source.address, {
			method: 'POST',
			headers: source.headers,
			body: JSON.stringify( { query: PAGE_DATES_QUERY, variables: { id: itemId, language } } ),
			signal: AbortSignal.timeout( options.timeoutMs ?? TIMEOUT_MS )
		} );

		if ( !response.ok ) throw new Error( `Experience Edge answered ${response.status}` );

		const item = member( await response.json(), 'data', 'item' );

		if ( !isJsonObject( item ) ) return null;

		const dates = { created: textOf( item['created'] ), updated: textOf( item['updated'] ) };

		if ( !dates.created && !dates.updated )
			( options.logger ?? silentLogger ).warn( `Experience Edge returned page item ${itemId} (${language}) with neither a created nor an updated date, so its JSON-LD carries no dates. An on-premises Edge endpoint does not return those fields.` );

		return dates;
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

	/**
	 * The chip's text in editing mode: why each rendering that publishes nothing here does not, how many placements
	 * each per-placement graph found, then the size of what the published page carries, or that nothing does yet.
	 * A page carrying nothing that a rendering withholds says only what is withheld and found.
	 */
	static chipText( page: JsonLdPage ): string {
		const withheld = page.withheld;
		const notes = [...withheld, ...page.placementsFound];

		if ( page.isEmpty && withheld.length > 0 ) return notes.join( '. ' );

		const size = page.isEmpty
			? 'Nothing to emit yet: no graph has been saved to the datasources on this page.'
			: `${grouped( page.scriptText.length )} characters, not shown on the published page`;

		return [...notes, size].join( '. ' );
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

/**
 * Every component under the placeholders, in placeholder order, walking nested placeholders depth-first; placeholders
 * that are not an object hold none, and an entry that is not an object is skipped.
 */
function renderings( placeholders: PlaceholderData | undefined ): ComponentRendering[] {
	const found: ComponentRendering[] = [];

	if ( !isJsonObject( placeholders ) ) return found;

	for ( const entries of Object.values( placeholders ) ) {
		for ( const entry of Array.isArray( entries ) ? entries : [] ) {
			if ( !isJsonObject( entry ) ) continue;

			const component = entry as ComponentRendering;

			found.push( component, ...renderings( component.placeholders ) );
		}
	}

	return found;
}

function sayless( value: JsonValue, depth: number ): boolean {
	if ( depth < ENTITY_DEPTH ) return false;

	if ( Array.isArray( value ) ) return value.length === 0;

	if ( isJsonObject( value ) ) return !Object.keys( value ).some( key => key !== '@type' );

	if ( typeof value === 'string' ) return trimmed( value ).length === 0;

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

function namedOrNull( text: string | null ): string | null {
	const named = text === null ? '' : trimmed( text );

	return named.length === 0 ? null : named;
}

/** The text without the {@link WHITESPACE} it opens or closes with. */
function trimmed( text: string ): string {
	let start = 0;
	let end = text.length;

	while ( start < end && WHITESPACE.includes( text[start] ) ) start++;

	while ( end > start && WHITESPACE.includes( text[end - 1] ) ) end--;

	return text.slice( start, end );
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
