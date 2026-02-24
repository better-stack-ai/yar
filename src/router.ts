// biome-ignore-all lint/suspicious/noExplicitAny: complex types
import type { ComponentType } from "react";
import { addRoute, createRouter as createRou3Router, findRoute } from "rou3";
import type { StandardSchemaV1 } from "./standard-schema";
import type {
	HasRequiredKeys,
	InferParam,
	InferQuery,
	InputContext,
	Route,
	RouteMeta,
	RouteOptions,
	RouterConfig,
} from "./types";

// Helper type to validate meta function return type
type MetaArray = Array<React.JSX.IntrinsicElements["meta"] | undefined>;
type MetaReturnType = MetaArray | Promise<MetaArray>;

type HandlerReturn<
	ComponentProps,
	LoaderFn extends (...args: any[]) => any | Promise<any> = () => any,
	ExtraFn extends (...args: any[]) => any | Promise<any> = () => any,
	MetaFn extends (...args: any[]) => MetaReturnType = () => MetaArray,
> = {
	PageComponent?: ComponentType<ComponentProps>;
	LoadingComponent?: ComponentType<ComponentProps>;
	ErrorComponent?: ComponentType<ComponentProps>;
	loader?: LoaderFn;
	meta?: MetaFn;
	extra?: ExtraFn;
};

/**
 * Creates a route definition with type-safe path parameters and query validation.
 *
 * @template Path - The route path string, which may include dynamic segments (e.g., "/users/:id")
 * @template Options - Route options including query parameter validation schema
 * @template ComponentProps - The props type for the React component
 * @template LoaderFn - The type of the loader function
 * @template ExtraFn - The type of the extra function
 * @template MetaFn - The type of the meta function (must return valid React meta elements)
 * @template Meta - The type of route-level metadata
 *
 * @param {Path} path - The route path pattern with optional dynamic segments
 * @param {Function} handler - Handler function that receives route context (params, query) and returns component, loader, and meta configuration
 * @param {Options} [options] - Optional configuration including query parameter validation schema
 * @param {Meta} [meta] - Optional route-level metadata for filtering/categorization without executing the handler
 *
 * @returns {Function} A route handler function with path, options, and meta attached
 *
 * @example
 * ```ts
 * const userRoute = createRoute(
 *   "/user/:id",
 *   ({ params, query }) => ({
 *     PageComponent: UserPage,
 *     loader: (signal?: AbortSignal) => fetchUser(params.id, signal),
 *     meta: (data) => [{ name: "title", content: `User ${data.name}` }]
 *   }),
 *   { query: z.object({ tab: z.string().optional() }) },
 *   { isStatic: false, requiresAuth: true }
 * );
 * ```
 */
export function createRoute<
	Path extends string,
	Options extends RouteOptions,
	ComponentProps,
	LoaderFn extends (...args: any[]) => any | Promise<any> = () => any,
	ExtraFn extends (...args: any[]) => any | Promise<any> = () => any,
	MetaFn extends (...args: any[]) => MetaReturnType = () => MetaArray,
	Meta extends RouteMeta = RouteMeta,
>(
	path: Path,
	handler: (context: {
		params: InferParam<Path>;
		query: InferQuery<Options> | undefined;
	}) => HandlerReturn<ComponentProps, LoaderFn, ExtraFn, MetaFn>,
	options?: Options,
	meta?: Meta,
) {
	type Context = InputContext<Path, Options>;
	const internalHandler = (
		...inputCtx: HasRequiredKeys<Context> extends true ? [Context] : [Context?]
	) => {
		const context = (inputCtx[0] || {}) as InputContext<any, any>;
		const internalContext = createInternalContext(context, {
			options,
			path,
		});
		const response = handler(internalContext as any);

		return response;
	};
	internalHandler.options = options;
	internalHandler.path = path;
	internalHandler.meta = meta;
	return internalHandler;
}

// Helper type to extract the return type from a route handler
type ExtractRouteReturn<R> = R extends (...args: any[]) => infer Return
	? Return
	: never;

// The return type for getRoute, combining each handler return with params and routeKey.
// Distributing the mapped type over the union preserves the discriminated union so
// TypeScript can narrow params and other properties based on routeKey.
type GetRouteReturn<Routes extends Record<string, Route>> = {
	[K in keyof Routes]: ExtractRouteReturn<Routes[K]> & {
		params: Record<string, string>;
		routeKey: K;
	};
}[keyof Routes];

/**
 * Creates a router instance from a collection of routes.
 *
 * @template E - A record type mapping route names to route handlers
 * @template Config - Router configuration type that may include a router context
 *
 * @param {E} routes - An object mapping route names to route handlers created with `createRoute`
 * @param {Config} [config] - Optional router configuration including shared context accessible to all routes
 *
 * @returns {Object} Router object with the following properties:
 *   - `routes`: The original routes object passed in
 *   - `getRoute`: Function to match a path and return the corresponding route with component, params, loader, and meta
 *
 * @example
 * ```ts
 * const router = createRouter({
 *   home: createRoute("/", () => ({ PageComponent: HomePage })),
 *   user: createRoute("/user/:id", ({ params }) => ({
 *     PageComponent: UserPage,
 *     loader: () => fetchUser(params.id)
 *   }))
 * });
 *
 * // Later, match a route:
 * const route = router.getRoute("/user/123");
 * if (route) {
 *   const data = await route.loader?.();
 *   // render route.PageComponent with data
 * }
 * ```
 */
export const createRouter = <
	E extends Record<string, Route>,
	Config extends RouterConfig,
>(
	routes: E,
	config?: Config,
) => {
	const internalRouter = createRou3Router<Route>();

	for (const endpoint of Object.values(routes)) {
		addRoute(internalRouter, "GET", endpoint.path, endpoint);
	}

	return {
		routes: routes,

		/**
		 * Returns the route object for the given path and query params
		 * @param path
		 * @param queryParams
		 * @returns {GetRouteReturn<E> | null} The route object for the given path and query params
		 */
		getRoute: (
			path: string,
			queryParams: Record<string, string | string[]> = {},
		): GetRouteReturn<E> | null => {
			const route = findRoute<Route>(internalRouter, "GET", path);
			if (!route?.data) {
				return null;
			}
			const handler = route.data;
			const params = (route.params ?? {}) as Record<string, string>;
			const context = {
				path,
				method: "GET",
				params,
				query: queryParams,
				context: config?.routerContext || {},
			};
			const responseObj = handler(context);
			const {
				PageComponent,
				LoadingComponent,
				ErrorComponent,
				loader,
				meta,
				extra,
			} = responseObj;

			// Resolve the route key by finding the entry whose handler is the same
			// reference as the one the internal router matched.
			const routeKey = Object.entries(routes).find(
				([, v]) => v === handler,
			)?.[0] as keyof E | undefined;

			return {
				PageComponent,
				LoadingComponent,
				ErrorComponent,
				params,
				loader,
				meta,
				extra,
				routeKey,
			} as GetRouteReturn<E>;
		},
	};
};

const createInternalContext = (
	context: InputContext<any, any>,
	{
		options,
		path,
	}: {
		options: RouteOptions | undefined;
		path: string;
	},
) => {
	let data: {
		query: any;
	} | null = null;

	let error: {
		message: string;
	} | null = null;

	if (options) {
		const { data: validationData, error: validationError } = runValidation(
			options,
			context,
		);
		data = validationData;
		error = validationError;
	}

	const internalContext = {
		...context,
		query: data?.query ?? undefined,
		queryError: error,
		path: context.path || path,
		context: "context" in context && context.context ? context.context : {},
		params: "params" in context ? context.params : undefined,
		method: "GET",
	};

	return internalContext;
};

type ValidationResponse =
	| {
			data: {
				query: any;
			};
			error: null;
	  }
	| {
			data: null;
			error: {
				message: string;
			};
	  };

function runValidation(
	options: RouteOptions,
	context: InputContext<any, any> = {},
): ValidationResponse {
	const request = {
		query: context.query,
	} as {
		query: any;
	};

	if (options.query) {
		const result = options.query["~standard"].validate(context.query);

		// Check if result is a Promise (async validation)
		if (result instanceof Promise) {
			throw new Error(
				"Async validation is not supported. Please use synchronous validators only.",
			);
		}

		if (result.issues) {
			return {
				data: null,
				error: fromError(result.issues, "query"),
			};
		}
		request.query = result.value;
	}

	return {
		data: request,
		error: null,
	};
}

function fromError(
	error: readonly StandardSchemaV1.Issue[],
	validating: string,
) {
	const errorMessages: string[] = [];

	for (const issue of error) {
		const message = issue.message;
		errorMessages.push(message);
	}
	return {
		message: `Invalid ${validating} parameters`,
	};
}
