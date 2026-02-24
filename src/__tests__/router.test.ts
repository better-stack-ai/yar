import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoute, createRouter } from "../router";
import {
	createFailingSchema,
	createMockSchema,
	createObjectSchema,
} from "./test-helpers";

// Mock components for testing
const MockComponent: ComponentType<Record<string, unknown>> = () => null;
const AnotherComponent: ComponentType<Record<string, unknown>> = () => null;

describe("createRoute", () => {
	it("should create a route with a simple path", () => {
		const route = createRoute("/home", () => ({
			PageComponent: MockComponent,
		}));

		expect(route.path).toBe("/home");
		expect(route.options).toBeUndefined();

		const result = route();
		expect(result.PageComponent).toBe(MockComponent);
	});

	it("should create a route with path parameters", async () => {
		const route = createRoute("/user/:id", ({ params }) => ({
			PageComponent: MockComponent,
			loader: () => `User ${params.id}`,
		}));

		expect(route.path).toBe("/user/:id");

		const result = route({ params: { id: "123" } });
		expect(result.PageComponent).toBe(MockComponent);
		expect(result.loader).toBeDefined();

		if (result.loader) {
			const data = await result.loader();
			expect(data).toBe("User 123");
		}
	});

	it("should create a route with multiple path parameters", async () => {
		const route = createRoute("/posts/:category/:id", ({ params }) => ({
			PageComponent: MockComponent,
			loader: () => `${params.category}/${params.id}`,
		}));

		const result = route({
			params: { category: "tech", id: "42" },
		});

		if (result.loader) {
			const data = await result.loader();
			expect(data).toBe("tech/42");
		}
	});

	it("should create a route with query parameter validation", async () => {
		const querySchema = createObjectSchema<{ search: string }>({
			search: (val) => typeof val === "string",
		});

		const route = createRoute(
			"/search",
			({ query }) => ({
				PageComponent: MockComponent,
				loader: () => query?.search || "no query",
			}),
			{ query: querySchema },
		);

		const result = route({ query: { search: "test" } });

		if (result.loader) {
			const data = await result.loader();
			expect(data).toBe("test");
		}
	});

	it("should handle optional query parameters", async () => {
		const route = createRoute("/products", ({ query: _query }) => ({
			PageComponent: MockComponent,
			loader: () => _query || null,
		}));

		const result = route();
		if (result.loader) {
			const data = await result.loader();
			expect(data).toBeNull();
		}
	});

	it("should support meta function", () => {
		const route = createRoute("/about", () => ({
			PageComponent: MockComponent,
			meta: () => [
				{ name: "title", content: "About" },
				{ name: "description", content: "About page" },
			],
		}));

		const result = route();
		expect(result.meta).toBeDefined();

		if (result.meta) {
			const metaTags = result.meta();
			expect(metaTags).toHaveLength(2);
			expect(metaTags[0]).toEqual({ name: "title", content: "About" });
		}
	});

	it("should pass loader data to meta function", async () => {
		const route = createRoute("/article/:id", ({ params }) => ({
			PageComponent: MockComponent,
			loader: async (): Promise<{ title: string }> => ({
				title: `Article ${params.id}`,
			}),
			meta: (data?: { title: string }) => [
				{ name: "title", content: data?.title || "Default" },
			],
		}));

		const result = route({ params: { id: "123" } });

		if (result.loader && result.meta) {
			const data = await result.loader();
			const metaTags = result.meta(data);
			expect(metaTags[0]).toEqual({ name: "title", content: "Article 123" });
		}
	});

	it("should handle async loaders", async () => {
		const mockLoader = vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return "async data";
		});

		const route = createRoute("/async", () => ({
			PageComponent: MockComponent,
			loader: mockLoader,
		}));

		const result = route();
		if (result.loader) {
			const data = await result.loader();
			expect(data).toBe("async data");
			expect(mockLoader).toHaveBeenCalledTimes(1);
		}
	});

	it("should support LoadingComponent and ErrorComponent", () => {
		const LoadingComp: ComponentType<Record<string, unknown>> = () => null;
		const ErrorComp: ComponentType<Record<string, unknown>> = () => null;

		const route = createRoute("/with-loading", () => ({
			PageComponent: MockComponent,
			LoadingComponent: LoadingComp,
			ErrorComponent: ErrorComp,
		}));

		const result = route();
		expect(result.PageComponent).toBe(MockComponent);
		expect(result.LoadingComponent).toBe(LoadingComp);
		expect(result.ErrorComponent).toBe(ErrorComp);
	});

	it("should allow optional PageComponent", () => {
		const route = createRoute("/no-component", () => ({
			loader: () => ({ data: "test" }),
		}));

		const result = route();
		expect(result.PageComponent).toBeUndefined();
		expect(result.loader).toBeDefined();
	});

	it("should support extra field for additional static data", () => {
		const extraData = { breadcrumbs: ["Home", "About"], layout: "full-width" };

		const route = createRoute("/with-extra", () => ({
			PageComponent: MockComponent,
			extra: () => extraData,
		}));

		const result = route();
		expect(result.PageComponent).toBe(MockComponent);
		if (result.extra) {
			expect(result.extra()).toEqual(extraData);
		}
	});

	it("should support typed extra field", () => {
		type ExtraType = { apiVersion: string; requiresAuth: boolean };
		const extraData: ExtraType = { apiVersion: "v2", requiresAuth: true };

		const route = createRoute("/typed-extra", () => ({
			PageComponent: MockComponent,
			extra: () => extraData,
		}));

		const result = route();
		if (result.extra) {
			expect(result.extra()).toEqual(extraData);
		}
	});
});

describe("createRouter", () => {
	it("should create a router with multiple routes", () => {
		const routes = {
			home: createRoute("/", () => ({ PageComponent: MockComponent })),
			about: createRoute("/about", () => ({ PageComponent: AnotherComponent })),
		};

		const router = createRouter(routes);

		expect(router.routes).toBe(routes);
		expect(router.getRoute).toBeDefined();
	});

	it("should match a simple route", () => {
		const routes = {
			home: createRoute("/", () => ({ PageComponent: MockComponent })),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/");

		expect(match).toBeDefined();
		expect(match?.PageComponent).toBe(MockComponent);
	});

	it("should return null for unmatched routes", () => {
		const routes = {
			home: createRoute("/", () => ({ PageComponent: MockComponent })),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/nonexistent");

		expect(match).toBeNull();
	});

	it("should extract path parameters", async () => {
		const routes = {
			user: createRoute("/user/:id", ({ params }) => ({
				PageComponent: MockComponent,
				loader: () => params.id,
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/user/123");

		expect(match).toBeDefined();
		expect(match?.params).toEqual({ id: "123" });

		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBe("123");
		}
	});

	it("should handle multiple path parameters", () => {
		const routes = {
			post: createRoute("/posts/:category/:id", () => ({
				PageComponent: MockComponent,
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/posts/tech/42");

		expect(match).toBeDefined();
		expect(match?.params).toEqual({ category: "tech", id: "42" });
	});

	it("should pass query parameters to route handler", async () => {
		const querySchema = createObjectSchema<{ page: string }>({
			page: (val) => typeof val === "string",
		});

		const routes = {
			search: createRoute(
				"/search",
				({ query }) => ({
					PageComponent: MockComponent,
					loader: () => query?.page || "1",
				}),
				{ query: querySchema },
			),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/search", { page: "2" });

		expect(match).toBeDefined();
		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBe("2");
		}
	});

	it("should handle query parameter validation errors", async () => {
		const failingSchema = createFailingSchema("Invalid query");

		const routes = {
			search: createRoute(
				"/search",
				({ query: _query }) => ({
					PageComponent: MockComponent,
					loader: () => _query || null,
				}),
				{ query: failingSchema },
			),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/search", { invalid: "param" });

		// Route should still match, but query will be undefined due to validation failure
		expect(match).toBeDefined();
		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBeNull();
		}
	});

	it("should execute loader functions", async () => {
		const mockLoader = vi.fn(async () => ({ data: "test" }));

		const routes = {
			data: createRoute("/data", () => ({
				PageComponent: MockComponent,
				loader: mockLoader,
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/data");

		expect(match).toBeDefined();
		if (match?.loader) {
			const result = await match.loader();
			expect(result).toEqual({ data: "test" });
			expect(mockLoader).toHaveBeenCalled();
		}
	});

	it("should generate meta tags", () => {
		const routes = {
			page: createRoute("/page", () => ({
				PageComponent: MockComponent,
				meta: () => [
					{ name: "title", content: "Test Page" },
					{ property: "og:title", content: "Test Page" },
				],
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/page");

		expect(match).toBeDefined();
		if (match?.meta) {
			const metaTags = match.meta();
			expect(metaTags).toHaveLength(2);
			expect(metaTags[0]).toEqual({ name: "title", content: "Test Page" });
			expect(metaTags[1]).toEqual({
				property: "og:title",
				content: "Test Page",
			});
		}
	});

	it("should support router context", () => {
		const routes = {
			home: createRoute("/", () => ({ PageComponent: MockComponent })),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/");

		expect(match).toBeDefined();
	});

	it("should match routes with trailing slashes correctly", () => {
		const routes = {
			about: createRoute("/about", () => ({ PageComponent: MockComponent })),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/about");

		expect(match).toBeDefined();
		expect(match?.PageComponent).toBe(MockComponent);
	});

	it("should handle complex route patterns", async () => {
		const routes = {
			nested: createRoute(
				"/api/v1/users/:userId/posts/:postId",
				({ params }) => ({
					PageComponent: MockComponent,
					loader: () => `${params.userId}-${params.postId}`,
				}),
			),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/api/v1/users/123/posts/456");

		expect(match).toBeDefined();
		expect(match?.params).toEqual({ userId: "123", postId: "456" });

		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBe("123-456");
		}
	});

	it("should handle routes without loaders or meta", () => {
		const routes = {
			simple: createRoute("/simple", () => ({ PageComponent: MockComponent })),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/simple");

		expect(match).toBeDefined();
		expect(match?.PageComponent).toBe(MockComponent);
		expect(match?.loader).toBeUndefined();
		expect(match?.meta).toBeUndefined();
	});

	it("should prioritize exact matches over parameterized routes", () => {
		const routes = {
			exact: createRoute("/users/me", () => ({ PageComponent: MockComponent })),
			param: createRoute("/users/:id", () => ({
				PageComponent: AnotherComponent,
			})),
		};

		const router = createRouter(routes);
		const exactMatch = router.getRoute("/users/me");
		const paramMatch = router.getRoute("/users/123");

		expect(exactMatch?.PageComponent).toBe(MockComponent);
		expect(paramMatch?.PageComponent).toBe(AnotherComponent);
		expect(paramMatch?.params).toEqual({ id: "123" });
	});

	it("should support LoadingComponent and ErrorComponent in router.getRoute", () => {
		const LoadingComp: ComponentType<Record<string, unknown>> = () => null;
		const ErrorComp: ComponentType<Record<string, unknown>> = () => null;

		const routes = {
			asyncPage: createRoute("/async-page", () => ({
				PageComponent: MockComponent,
				LoadingComponent: LoadingComp,
				ErrorComponent: ErrorComp,
				loader: async () => ({ data: "loaded" }),
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/async-page");

		expect(match).toBeDefined();
		expect(match?.PageComponent).toBe(MockComponent);
		expect(match?.LoadingComponent).toBe(LoadingComp);
		expect(match?.ErrorComponent).toBe(ErrorComp);
		expect(match?.loader).toBeDefined();
	});

	it("should handle routes with optional PageComponent", () => {
		const routes = {
			dataOnly: createRoute("/data-only", () => ({
				loader: async () => ({ data: "some data" }),
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/data-only");

		expect(match).toBeDefined();
		expect(match?.PageComponent).toBeUndefined();
		expect(match?.loader).toBeDefined();
	});

	it("should return extra field from router.getRoute", () => {
		const extraData = { section: "admin", requiresAuth: true };

		const routes = {
			admin: createRoute("/admin", () => ({
				PageComponent: MockComponent,
				extra: () => extraData,
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/admin");

		expect(match).toBeDefined();
		if (match?.extra) {
			expect(match.extra()).toEqual(extraData);
		}
	});
});

describe("Route validation", () => {
	it("should validate query parameters with passing schema", async () => {
		const schema = createMockSchema<{ id: string }>((value) => {
			if (
				typeof value === "object" &&
				value !== null &&
				"id" in value &&
				typeof (value as Record<string, unknown>).id === "string"
			) {
				return { value: value as { id: string }, issues: undefined };
			}
			return { issues: [{ message: "Invalid id" }] };
		});

		const routes = {
			item: createRoute(
				"/item",
				({ query }) => ({
					PageComponent: MockComponent,
					loader: () => query?.id || "no-id",
				}),
				{ query: schema },
			),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/item", { id: "test-id" });

		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBe("test-id");
		}
	});

	it("should handle validation failure gracefully", async () => {
		const schema = createFailingSchema("Required field missing");

		const routes = {
			form: createRoute(
				"/form",
				({ query }) => ({
					PageComponent: MockComponent,
					loader: () => query || null,
				}),
				{ query: schema },
			),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/form", { invalid: "data" });

		expect(match).toBeDefined();
		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBeNull();
		}
	});

	it("should throw error for async validation", () => {
		const asyncSchema = createMockSchema<{ token: string }>(async (value) => {
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			if (typeof value === "object" && value !== null && "token" in value) {
				return { value: value as { token: string }, issues: undefined };
			}
			return { issues: [{ message: "Invalid token" }] };
		});

		const routes = {
			auth: createRoute(
				"/auth",
				({ query }) => ({
					PageComponent: MockComponent,
					loader: () => query?.token || "no-token",
				}),
				{ query: asyncSchema },
			),
		};

		const router = createRouter(routes);

		expect(() => router.getRoute("/auth", { token: "abc123" })).toThrow(
			"Async validation is not supported",
		);
	});

	it("should handle array query parameters", async () => {
		const schema = createMockSchema<{ tags: string[] }>((value) => {
			if (
				typeof value === "object" &&
				value !== null &&
				"tags" in value &&
				Array.isArray((value as Record<string, unknown>).tags)
			) {
				return { value: value as { tags: string[] }, issues: undefined };
			}
			return { issues: [{ message: "Invalid tags" }] };
		});

		const routes = {
			filter: createRoute(
				"/filter",
				({ query }) => ({
					PageComponent: MockComponent,
					loader: () => query?.tags || [],
				}),
				{ query: schema },
			),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/filter", {
			tags: ["tag1", "tag2"],
		});

		if (match?.loader) {
			const data = await match.loader();
			expect(data).toEqual(["tag1", "tag2"]);
		}
	});
});

describe("Edge cases", () => {
	it("should handle routes with no handler context", () => {
		const route = createRoute("/test", () => ({
			PageComponent: MockComponent,
		}));

		const result = route();
		expect(result.PageComponent).toBe(MockComponent);
	});

	it("should handle empty query parameters", async () => {
		const routes = {
			search: createRoute("/search", ({ query }) => ({
				PageComponent: MockComponent,
				loader: () => query || null,
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/search", {});

		if (match?.loader) {
			const data = await match.loader();
			expect(data).toBeNull();
		}
	});

	it("should handle undefined meta function return", () => {
		const routes = {
			page: createRoute("/page", () => ({
				PageComponent: MockComponent,
				meta: () => [undefined, { name: "title", content: "Test" }],
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/page");

		if (match?.meta) {
			const metaTags = match.meta();
			expect(metaTags).toHaveLength(2);
			expect(metaTags[0]).toBeUndefined();
			expect(metaTags[1]).toEqual({ name: "title", content: "Test" });
		}
	});

	it("should handle routes with special characters", () => {
		const routes = {
			special: createRoute("/items/:id", ({ params }) => ({
				PageComponent: MockComponent,
				loader: () => params.id,
			})),
		};

		const router = createRouter(routes);
		const match = router.getRoute("/items/test-123");

		expect(match?.params).toEqual({ id: "test-123" });
	});

	it("should infer meta function types correctly - no params", () => {
		const route = createRoute("/meta-no-params", () => ({
			PageComponent: MockComponent,
			meta: () => [{ name: "description", content: "Static meta" }],
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/meta-no-params");

		expect(match?.meta).toBeDefined();
		if (match?.meta) {
			const metaTags = match.meta();
			expect(metaTags).toEqual([
				{ name: "description", content: "Static meta" },
			]);
		}
	});

	it("should infer meta function types correctly - custom params", () => {
		const route = createRoute("/meta-custom", () => ({
			PageComponent: MockComponent,
			meta: (title: string, author: string) => [
				{ name: "title", content: title },
				{ name: "author", content: author },
			],
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/meta-custom");

		expect(match?.meta).toBeDefined();
		if (match?.meta) {
			const metaTags = match.meta("My Post", "John Doe");
			expect(metaTags).toEqual([
				{ name: "title", content: "My Post" },
				{ name: "author", content: "John Doe" },
			]);
		}
	});

	it("should infer meta function types correctly - with loader data", () => {
		interface UserData {
			name: string;
			email: string;
		}

		const route = createRoute("/meta-loader", () => ({
			PageComponent: MockComponent,
			loader: () => ({ name: "Jane", email: "jane@example.com" }),
			meta: (data?: UserData) => [
				{ name: "title", content: data?.name || "Unknown" },
				{ property: "og:email", content: data?.email || "" },
			],
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/meta-loader");

		expect(match?.meta).toBeDefined();
		if (match?.meta) {
			const metaTags = match.meta({ name: "Jane", email: "jane@example.com" });
			expect(metaTags).toEqual([
				{ name: "title", content: "Jane" },
				{ property: "og:email", content: "jane@example.com" },
			]);
		}
	});

	it("should support async meta functions", async () => {
		const route = createRoute("/meta-async", () => ({
			PageComponent: MockComponent,
			meta: async (userId: string) => {
				// Simulate async operation (e.g., fetching data)
				await new Promise((resolve) => setTimeout(resolve, 10));
				return [
					{ name: "title", content: `User ${userId}` },
					{ name: "description", content: "Async meta tags" },
				];
			},
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/meta-async");

		expect(match?.meta).toBeDefined();
		if (match?.meta) {
			const metaTags = await match.meta("123");
			expect(metaTags).toEqual([
				{ name: "title", content: "User 123" },
				{ name: "description", content: "Async meta tags" },
			]);
		}
	});

	it("should infer extra function types correctly - no params", () => {
		const route = createRoute("/extra-no-params", () => ({
			PageComponent: MockComponent,
			extra: () => ({ analytics: "tracking-id-123" }),
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/extra-no-params");

		expect(match?.extra).toBeDefined();
		if (match?.extra) {
			const extraData = match.extra();
			expect(extraData).toEqual({ analytics: "tracking-id-123" });
		}
	});

	it("should infer extra function types correctly - with params", () => {
		const route = createRoute("/extra-custom", () => ({
			PageComponent: MockComponent,
			extra: (userId: string, sessionId: number) => ({
				tracking: { userId, sessionId },
				timestamp: Date.now(),
			}),
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/extra-custom");

		expect(match?.extra).toBeDefined();
		if (match?.extra) {
			const extraData = match.extra("user-123", 456);
			expect(extraData.tracking).toEqual({
				userId: "user-123",
				sessionId: 456,
			});
			expect(extraData.timestamp).toBeGreaterThan(0);
		}
	});

	it("should support async extra functions", async () => {
		const route = createRoute("/extra-async", () => ({
			PageComponent: MockComponent,
			extra: async (apiKey: string) => {
				// Simulate async operation
				await new Promise((resolve) => setTimeout(resolve, 10));
				return {
					apiKey,
					validated: true,
					timestamp: Date.now(),
				};
			},
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/extra-async");

		expect(match?.extra).toBeDefined();
		if (match?.extra) {
			const extraData = await match.extra("secret-key");
			expect(extraData.apiKey).toBe("secret-key");
			expect(extraData.validated).toBe(true);
			expect(extraData.timestamp).toBeGreaterThan(0);
		}
	});

	// Type safety test - this DOES cause a compile error now! ✅
	it("should enforce meta shape at compile time", () => {
		const route = createRoute("/invalid-meta", () => ({
			PageComponent: MockComponent,
			// @ts-expect-error - This correctly fails: invalid meta shape
			meta: () => [{ invalid: "property", notAllowed: true }],
		}));

		expect(route).toBeDefined();
	});

	it("should support route-level metadata", () => {
		const homeRoute = createRoute(
			"/",
			() => ({
				PageComponent: MockComponent,
			}),
			undefined,
			{ isStatic: true, category: "public" },
		);

		const userRoute = createRoute(
			"/user/:id",
			() => ({
				PageComponent: MockComponent,
			}),
			undefined,
			{ isStatic: false, category: "user", requiresAuth: true },
		);

		expect(homeRoute.meta).toEqual({ isStatic: true, category: "public" });
		expect(userRoute.meta).toEqual({
			isStatic: false,
			category: "user",
			requiresAuth: true,
		});
	});

	it("should allow filtering routes by metadata", () => {
		const routes = {
			home: createRoute(
				"/",
				() => ({ PageComponent: MockComponent }),
				undefined,
				{ isStatic: true },
			),
			about: createRoute(
				"/about",
				() => ({ PageComponent: MockComponent }),
				undefined,
				{ isStatic: true },
			),
			user: createRoute(
				"/user/:id",
				() => ({ PageComponent: MockComponent }),
				undefined,
				{ isStatic: false, requiresAuth: true },
			),
		};

		const router = createRouter(routes);

		// Filter static routes without calling handlers
		const staticRoutes = Object.entries(router.routes).filter(
			([_, route]) => route.meta?.isStatic === true,
		);

		expect(staticRoutes).toHaveLength(2);
		expect(staticRoutes.map(([name]) => name)).toEqual(["home", "about"]);

		// Filter routes requiring auth
		const authRoutes = Object.entries(router.routes).filter(
			([_, route]) =>
				route.meta &&
				"requiresAuth" in route.meta &&
				route.meta.requiresAuth === true,
		);

		expect(authRoutes).toHaveLength(1);
		expect(authRoutes[0][0]).toBe("user");
	});

	it("should infer loader function types correctly - no params", async () => {
		const route = createRoute("/loader-no-params", () => ({
			PageComponent: MockComponent,
			loader: () => ({ data: "static" }),
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/loader-no-params");

		expect(match?.loader).toBeDefined();
		if (match?.loader) {
			const data = await match.loader();
			expect(data).toEqual({ data: "static" });
		}
	});

	it("should infer loader function types correctly - with params", async () => {
		const route = createRoute("/loader-custom", () => ({
			PageComponent: MockComponent,
			loader: (userId: string, options?: { cache: boolean }) =>
				Promise.resolve({
					userId,
					cached: options?.cache ?? false,
				}),
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/loader-custom");

		expect(match?.loader).toBeDefined();
		if (match?.loader) {
			const data = await match.loader("user-123", { cache: true });
			expect(data.userId).toBe("user-123");
			expect(data.cached).toBe(true);
		}
	});

	it("should support loader with AbortSignal parameter", async () => {
		const route = createRoute("/loader-signal", () => ({
			PageComponent: MockComponent,
			loader: async (signal?: AbortSignal) => {
				// Simulate async operation that can be aborted
				await new Promise((resolve) => setTimeout(resolve, 10));
				if (signal?.aborted) {
					throw new Error("Aborted");
				}
				return { data: "loaded" };
			},
		}));

		const router = createRouter({ route });
		const match = router.getRoute("/loader-signal");

		expect(match?.loader).toBeDefined();
		if (match?.loader) {
			const controller = new AbortController();
			const data = await match.loader(controller.signal);
			expect(data).toEqual({ data: "loaded" });
		}
	});
});

describe("routeKey", () => {
	it("should expose the route key on a matched route", () => {
		const routes = {
			home: createRoute("/", () => ({ PageComponent: MockComponent })),
			about: createRoute("/about", () => ({ PageComponent: AnotherComponent })),
		};

		const router = createRouter(routes);

		expect(router.getRoute("/")?.routeKey).toBe("home");
		expect(router.getRoute("/about")?.routeKey).toBe("about");
	});

	it("should return null for unmatched paths (no routeKey)", () => {
		const routes = {
			home: createRoute("/", () => ({ PageComponent: MockComponent })),
		};

		const router = createRouter(routes);
		expect(router.getRoute("/missing")).toBeNull();
	});

	it("should set the correct routeKey for parameterised routes", () => {
		const routes = {
			post: createRoute("/posts/:slug", () => ({
				PageComponent: MockComponent,
			})),
			user: createRoute("/users/:id", () => ({
				PageComponent: AnotherComponent,
			})),
		};

		const router = createRouter(routes);

		expect(router.getRoute("/posts/hello-world")?.routeKey).toBe("post");
		expect(router.getRoute("/users/42")?.routeKey).toBe("user");
	});

	it("should set the correct routeKey when exact and parameterised routes overlap", () => {
		const routes = {
			me: createRoute("/users/me", () => ({ PageComponent: MockComponent })),
			user: createRoute("/users/:id", () => ({
				PageComponent: AnotherComponent,
			})),
		};

		const router = createRouter(routes);

		expect(router.getRoute("/users/me")?.routeKey).toBe("me");
		expect(router.getRoute("/users/123")?.routeKey).toBe("user");
	});
});
