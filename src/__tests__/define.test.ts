import type { ComponentType, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineRoute, defineRoutes } from "../define";
import { createRoute, createRouter } from "../router";
import { createFailingSchema, createObjectSchema } from "./test-helpers";

// Mock components for testing
const MockPage: ComponentType<Record<string, unknown>> = () => null;
const MockLoading: ComponentType<Record<string, unknown>> = () => null;
const MockError: ComponentType<Record<string, unknown>> = () => null;
const OverridePage: ComponentType<Record<string, unknown>> = () => null;

// Bound components are wrappers that render the original component with the
// route context injected as props. Invoking the wrapper returns the element,
// which we can inspect without a DOM.
function renderBound(
	Component: ComponentType<Record<string, unknown>> | undefined,
	props: Record<string, unknown> = {},
): ReactElement<Record<string, unknown>> | null {
	if (!Component) return null;
	return (
		Component as (
			props: Record<string, unknown>,
		) => ReactElement<Record<string, unknown>>
	)(props);
}

describe("defineRoute", () => {
	it("should create a route with a simple path", () => {
		const route = defineRoute("/home", { page: MockPage });

		expect(route.path).toBe("/home");
		expect(route.options).toBeUndefined();

		const result = route();
		expect(result.PageComponent).toBeDefined();
		expect(result.LoadingComponent).toBeUndefined();
		expect(result.ErrorComponent).toBeUndefined();
		expect(result.loader).toBeUndefined();
		expect(result.meta).toBeUndefined();
		expect(result.extra).toBeUndefined();
	});

	it("should inject params and query into the page component as props", () => {
		const route = defineRoute("/user/:id", { page: MockPage });

		const result = route({ params: { id: "123" } });
		const element = renderBound(result.PageComponent);

		expect(element?.type).toBe(MockPage);
		expect(element?.props.params).toEqual({ id: "123" });
		expect(element?.props.query).toBeUndefined();
	});

	it("should merge render-time props with the injected context", () => {
		const route = defineRoute("/user/:id", { page: MockPage });

		const result = route({ params: { id: "123" } });
		const element = renderBound(result.PageComponent, { highlighted: true });

		expect(element?.props.params).toEqual({ id: "123" });
		expect(element?.props.highlighted).toBe(true);
	});

	it("should bind loading and error components to the context", () => {
		const route = defineRoute("/user/:id", {
			page: MockPage,
			loading: MockLoading,
			error: MockError,
		});

		const result = route({ params: { id: "7" } });

		const loading = renderBound(result.LoadingComponent);
		expect(loading?.type).toBe(MockLoading);
		expect(loading?.props.params).toEqual({ id: "7" });

		const error = renderBound(result.ErrorComponent);
		expect(error?.type).toBe(MockError);
		expect(error?.props.params).toEqual({ id: "7" });
	});

	it("should bind the loader to the context", async () => {
		const loader = vi.fn(
			(ctx: { params: { slug: string } }) => `Post ${ctx.params.slug}`,
		);
		const route = defineRoute("/blog/:slug", { page: MockPage, loader });

		const result = route({ params: { slug: "hello" } });
		const data = await result.loader?.();

		expect(data).toBe("Post hello");
		expect(loader).toHaveBeenCalledWith({
			params: { slug: "hello" },
			query: undefined,
		});
	});

	it("should support async loaders", async () => {
		const route = defineRoute("/blog/:slug", {
			page: MockPage,
			loader: async (ctx) => ({ title: `Post ${ctx.params.slug}` }),
		});

		const result = route({ params: { slug: "async" } });
		const data = await result.loader?.();

		expect(data).toEqual({ title: "Post async" });
	});

	it("should forward extra loader arguments after the context", async () => {
		const loader = vi.fn(
			(ctx: { params: { slug: string } }, signal?: AbortSignal) => ({
				slug: ctx.params.slug,
				aborted: signal?.aborted ?? null,
			}),
		);
		const route = defineRoute("/blog/:slug", { page: MockPage, loader });

		const result = route({ params: { slug: "sig" } });
		const controller = new AbortController();
		const data = await result.loader?.(controller.signal);

		expect(data).toEqual({ slug: "sig", aborted: false });
		expect(loader).toHaveBeenCalledWith(
			{ params: { slug: "sig" }, query: undefined },
			controller.signal,
		);
	});

	it("should bind meta to the context and forward extra arguments", async () => {
		const route = defineRoute("/blog/:slug", {
			page: MockPage,
			loader: (ctx) => ({ title: `Post ${ctx.params.slug}` }),
			meta: (ctx, data?: { title: string }) => [
				{ name: "title", content: data?.title ?? ctx.params.slug },
			],
		});

		const result = route({ params: { slug: "seo" } });

		// Without loader data, falls back to context
		expect(result.meta?.()).toEqual([{ name: "title", content: "seo" }]);

		// With loader data passed through (the common SSR pattern)
		const data = await result.loader?.();
		expect(result.meta?.(data)).toEqual([
			{ name: "title", content: "Post seo" },
		]);
	});

	it("should support async meta", async () => {
		const route = defineRoute("/about", {
			page: MockPage,
			meta: async () => [{ name: "title", content: "About" }],
		});

		const result = route();
		await expect(result.meta?.()).resolves.toEqual([
			{ name: "title", content: "About" },
		]);
	});

	it("should bind extra to the context", () => {
		const route = defineRoute("/blog/:slug", {
			page: MockPage,
			extra: (ctx) => ({ breadcrumb: ctx.params.slug }),
		});

		const result = route({ params: { slug: "crumb" } });
		expect(result.extra?.()).toEqual({ breadcrumb: "crumb" });
	});

	it("should validate query parameters via options", () => {
		const querySchema = createObjectSchema<{ search: string }>({
			search: (val) => typeof val === "string",
		});
		const route = defineRoute(
			"/search",
			{
				page: MockPage,
				loader: (ctx) => ctx.query?.search ?? "no query",
			},
			{ query: querySchema },
		);

		expect(route.options).toEqual({ query: querySchema });

		const result = route({ query: { search: "test" } });
		expect(result.loader?.()).toBe("test");
	});

	it("should pass undefined query when validation fails", () => {
		const route = defineRoute(
			"/search",
			{
				page: MockPage,
				loader: (ctx) => ctx.query ?? null,
			},
			{ query: createFailingSchema() },
		);

		const result = route({ query: { search: "bad" } });
		expect(result.loader?.()).toBeNull();
	});

	it("should attach route-level metadata", () => {
		const route = defineRoute("/", { page: MockPage }, undefined, {
			isStatic: true,
		});

		expect(route.meta).toEqual({ isStatic: true });
	});

	it("should expose the original definition on the route", () => {
		const def = { page: MockPage };
		const route = defineRoute("/home", def);

		expect(route.def).toBe(def);
	});
});

describe("defineRoutes", () => {
	it("should return the routes record unchanged without overrides", () => {
		const home = defineRoute("/", { page: MockPage });
		const post = defineRoute("/blog/:slug", { page: MockPage });
		const routes = defineRoutes({ home, post });

		expect(routes.home).toBe(home);
		expect(routes.post).toBe(post);
	});

	it("should work with createRouter and expose routeKey and params", async () => {
		const routes = defineRoutes({
			home: defineRoute("/", { page: MockPage }),
			post: defineRoute("/blog/:slug", {
				page: MockPage,
				loader: (ctx) => `Post ${ctx.params.slug}`,
			}),
		});
		const router = createRouter(routes);

		const match = router.getRoute("/blog/hello");
		expect(match).not.toBeNull();
		expect(match?.routeKey).toBe("post");
		expect(match?.params).toEqual({ slug: "hello" });
		expect(await match?.loader?.()).toBe("Post hello");

		const element = renderBound(match?.PageComponent);
		expect(element?.type).toBe(MockPage);
		expect(element?.props.params).toEqual({ slug: "hello" });
	});

	it("should apply per-key page overrides", () => {
		const routes = defineRoutes(
			{
				home: defineRoute("/", { page: MockPage }),
				post: defineRoute("/blog/:slug", { page: MockPage }),
			},
			{ pages: { post: OverridePage } },
		);
		const router = createRouter(routes);

		const homeElement = renderBound(router.getRoute("/")?.PageComponent);
		expect(homeElement?.type).toBe(MockPage);

		const postMatch = router.getRoute("/blog/x");
		const postElement = renderBound(postMatch?.PageComponent);
		expect(postElement?.type).toBe(OverridePage);
		// Overridden components still receive the route context as props
		expect(postElement?.props.params).toEqual({ slug: "x" });
	});

	it("should preserve loader, meta, extra, options, and routeMeta when overriding", () => {
		const querySchema = createObjectSchema<{ q: string }>({
			q: (val) => typeof val === "string",
		});
		const routes = defineRoutes(
			{
				search: defineRoute(
					"/search/:term",
					{
						page: MockPage,
						loading: MockLoading,
						error: MockError,
						loader: (ctx) => `Results for ${ctx.params.term}`,
						meta: (ctx) => [{ name: "title", content: ctx.params.term }],
						extra: (ctx) => ({ crumb: ctx.params.term }),
					},
					{ query: querySchema },
					{ requiresAuth: true },
				),
			},
			{ pages: { search: OverridePage } },
		);

		expect(routes.search.options).toEqual({ query: querySchema });
		expect(routes.search.meta).toEqual({ requiresAuth: true });

		const router = createRouter(routes);
		const match = router.getRoute("/search/yar");
		expect(renderBound(match?.PageComponent)?.type).toBe(OverridePage);
		expect(renderBound(match?.LoadingComponent)?.type).toBe(MockLoading);
		expect(renderBound(match?.ErrorComponent)?.type).toBe(MockError);
		expect(match?.loader?.()).toBe("Results for yar");
		expect(match?.meta?.()).toEqual([{ name: "title", content: "yar" }]);
		expect(match?.extra?.()).toEqual({ crumb: "yar" });
	});

	it("should override the page of plain createRoute routes as-is", () => {
		const routes = defineRoutes(
			{
				legacy: createRoute("/legacy/:id", ({ params }) => ({
					PageComponent: MockPage,
					loader: () => `Legacy ${params.id}`,
				})),
			},
			{ pages: { legacy: OverridePage } },
		);
		const router = createRouter(routes);

		const match = router.getRoute("/legacy/9");
		expect(match?.PageComponent).toBe(OverridePage);
		expect(match?.loader?.()).toBe("Legacy 9");
		expect(match?.params).toEqual({ id: "9" });
	});
});
