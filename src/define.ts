// biome-ignore-all lint/suspicious/noExplicitAny: complex types
import { type ComponentType, createElement } from "react";
import { createRoute } from "./router";
import type {
	InferParam,
	InferQuery,
	Route,
	RouteMeta,
	RouteOptions,
} from "./types";

type MetaArray = Array<React.JSX.IntrinsicElements["meta"] | undefined>;
type MetaReturnType = MetaArray | Promise<MetaArray>;

/**
 * The context object passed to declarative route functions (`loader`, `meta`,
 * `extra`) and injected as props into `page`, `loading`, and `error` components.
 */
export type RouteContext<
	Path extends string,
	Options extends RouteOptions = RouteOptions,
> = {
	params: InferParam<Path>;
	query: InferQuery<Options> | undefined;
};

/**
 * Declarative route definition accepted by `defineRoute`.
 */
export type RouteDef<
	Path extends string,
	Options extends RouteOptions = RouteOptions,
> = {
	/** Page component. Receives the route context (`params`, `query`) as props. */
	page?: ComponentType<RouteContext<Path, Options>>;
	/** Loading component. Receives the route context as props. */
	loading?: ComponentType<RouteContext<Path, Options>>;
	/** Error component. Receives the route context as props. */
	error?: ComponentType<RouteContext<Path, Options>>;
	/** Data loader. Receives the route context first; extra args are caller-defined. */
	loader?: (ctx: RouteContext<Path, Options>, ...args: any[]) => any;
	/** Meta tag generator. Receives the route context first; extra args are caller-defined. */
	meta?: (ctx: RouteContext<Path, Options>, ...args: any[]) => MetaReturnType;
	/** Extra data generator. Receives the route context first; extra args are caller-defined. */
	extra?: (ctx: RouteContext<Path, Options>, ...args: any[]) => any;
};

// Drops the bound context argument from a context-first function type.
type BoundFn<F> = F extends (ctx: any, ...args: infer A) => infer R
	? (...args: A) => R
	: undefined;

type DefinedHandlerReturn<D extends RouteDef<any, any>> = {
	PageComponent: ComponentType<any> | undefined;
	LoadingComponent: ComponentType<any> | undefined;
	ErrorComponent: ComponentType<any> | undefined;
	loader: BoundFn<D["loader"]>;
	meta: BoundFn<D["meta"]>;
	extra: BoundFn<D["extra"]>;
};

/**
 * The route produced by `defineRoute`: a regular yar `Route` whose handler
 * returns context-bound components and functions, with the original
 * declarative definition attached as `def` (used by `defineRoutes` to apply
 * page overrides).
 */
export type DefinedRoute<
	Path extends string,
	D extends RouteDef<any, any>,
	Meta extends RouteMeta = RouteMeta,
> = Route<
	Path,
	RouteOptions,
	(inputCtx?: any) => DefinedHandlerReturn<D>,
	Meta
> & {
	def: D;
};

function bindComponent(
	Component: ComponentType<any>,
	context: Record<string, any>,
): ComponentType<any> {
	const Bound = (props: Record<string, any>) =>
		createElement(Component, { ...context, ...props });
	Bound.displayName = `Bound(${Component.displayName || Component.name || "Component"})`;
	return Bound;
}

function bindFn<Ctx, F extends (ctx: Ctx, ...args: any[]) => any>(
	fn: F,
	context: Ctx,
): BoundFn<F> {
	return ((...args: any[]) => fn(context, ...args)) as BoundFn<F>;
}

/**
 * Declarative variant of `createRoute` that removes the handler-closure
 * boilerplate. Components receive the route context (`params`, `query`) as
 * props, and `loader`/`meta`/`extra` receive it as their first argument —
 * no manual wiring per route.
 *
 * @param {Path} path - The route path pattern with optional dynamic segments
 * @param {RouteDef} def - Declarative definition: `page`, `loading`, `error`, `loader`, `meta`, `extra`
 * @param {Options} [options] - Optional configuration including query parameter validation schema
 * @param {Meta} [routeMeta] - Optional route-level metadata for filtering without executing the handler
 *
 * @example
 * ```tsx
 * const post = defineRoute("/blog/:slug", {
 *   page: PostPage, // receives { params, query } as props
 *   loader: (ctx, signal?: AbortSignal) => fetchPost(ctx.params.slug, signal),
 *   meta: (ctx) => [{ name: "title", content: `Post ${ctx.params.slug}` }],
 * });
 * ```
 */
export function defineRoute<
	Path extends string,
	Options extends RouteOptions,
	const Def extends RouteDef<Path, Options>,
	Meta extends RouteMeta = RouteMeta,
>(
	path: Path,
	def: Def,
	options?: Options,
	routeMeta?: Meta,
): DefinedRoute<Path, Def, Meta> {
	const route = createRoute(
		path,
		({ params, query }) => {
			const context = { params, query } as RouteContext<Path, Options>;
			const componentContext = context as Record<string, any>;
			return {
				PageComponent: def.page
					? bindComponent(def.page, componentContext)
					: undefined,
				LoadingComponent: def.loading
					? bindComponent(def.loading, componentContext)
					: undefined,
				ErrorComponent: def.error
					? bindComponent(def.error, componentContext)
					: undefined,
				loader: def.loader ? bindFn(def.loader, context) : undefined,
				meta: def.meta ? bindFn(def.meta, context) : undefined,
				extra: def.extra ? bindFn(def.extra, context) : undefined,
			} as DefinedHandlerReturn<Def>;
		},
		options,
		routeMeta,
	);
	(route as any).def = def;
	return route as unknown as DefinedRoute<Path, Def, Meta>;
}

/**
 * Groups routes into a record compatible with `createRouter`, with optional
 * per-key page component overrides.
 *
 * Overrides on routes created with `defineRoute` are rebuilt so the override
 * component still receives the route context (`params`, `query`) as props.
 * Overrides on plain `createRoute` routes replace the `PageComponent` as-is.
 *
 * @param {Record<string, Route>} routes - Record of routes (from `defineRoute` or `createRoute`)
 * @param {Object} [shared] - Shared configuration
 * @param {Object} [shared.pages] - Per-key page component overrides
 *
 * @example
 * ```tsx
 * const routes = defineRoutes(
 *   {
 *     home: defineRoute("/", { page: HomePage }),
 *     post: defineRoute("/blog/:slug", {
 *       page: PostPage,
 *       loader: (ctx) => fetchPost(ctx.params.slug),
 *       meta: (ctx) => [{ name: "title", content: ctx.params.slug }],
 *     }),
 *   },
 *   { pages: { post: CustomPostPage } },
 * );
 *
 * const router = createRouter(routes);
 * ```
 */
export function defineRoutes<
	T extends Record<string, Route & { def?: RouteDef<any, any> }>,
>(
	routes: T,
	shared?: {
		pages?: { [K in keyof T]?: ComponentType<any> };
	},
): T {
	if (!shared?.pages) {
		return routes;
	}
	const result: Record<string, Route> = {};
	for (const key of Object.keys(routes)) {
		const route = routes[key] as Route & { def?: RouteDef<any, any> };
		const override = shared.pages[key];
		if (!override) {
			result[key] = route;
		} else if (route.def) {
			result[key] = defineRoute(
				route.path,
				{ ...route.def, page: override },
				route.options,
				route.meta,
			) as unknown as Route;
		} else {
			const wrapped = (inputCtx?: any) => ({
				...route(inputCtx),
				PageComponent: override,
			});
			wrapped.path = route.path;
			wrapped.options = route.options;
			wrapped.meta = route.meta;
			result[key] = wrapped as unknown as Route;
		}
	}
	return result as T;
}
