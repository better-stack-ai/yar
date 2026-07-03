# @btst/yar (Yet Another Router)

A simple, type-safe router for React that works with any framework.

## Why use this?

- ✨ **Super Simple** - A tiny API: `createRoute` and `createRouter` (plus optional `defineRoute`/`defineRoutes` sugar)
- 🔒 **Type Safe** - TypeScript knows your route params automatically
- 🎯 **Flexible** - Works with any React framework
- ✅ **Validated** - Built-in query parameter validation

## Installation

```bash
npm install @btst/yar
# or
pnpm add @btst/yar
```

## Quick Start

Here's one complete example showing all features:

```tsx
import { createRoute, createRouter } from "@btst/yar";
import { z } from "zod"; // or any Standard Schema library
import HomePage from "./pages/home";
import BlogPostPage from "./pages/blog-post";

// 1️⃣ Simple route - just a page
const homeRoute = createRoute(
  "/",
  () => ({
    PageComponent: HomePage,
    meta: () => [{ name: "title", content: "Home" }],
  }),
  undefined,
  { isStatic: true } // 🏷️ Optional: tag routes for filtering for SSG environments
);

// 2️⃣ Dynamic route - with params, validation, and data loading
const blogRoute = createRoute(
  "/blog/:slug", // :slug becomes available as params.slug
  ({ params, query }) => ({
    PageComponent: BlogPostPage,
    
    // 📦 Load data (can use AbortSignal, options, etc.)
    loader: async (signal?: AbortSignal) => {
      const res = await fetch(`/api/posts/${params.slug}`, { signal });
      return res.json();
    },
    
    // 📄 Generate meta tags (can use loader data)
    meta: (post) => [
      { name: "title", content: post.title },
      { name: "description", content: post.excerpt },
    ],
    
    // 🎨 Extra data for anything (breadcrumbs, layout, etc.)
    extra: () => ({
      breadcrumbs: ["Home", "Blog", params.slug],
      layout: "blog",
    }),
  }),
  {
    // ✅ Validate query parameters
    query: z.object({
      preview: z.boolean().optional(),
    }),
  },
  { isStatic: false, requiresAuth: false } // 🏷️ Route tags
);

// 3️⃣ Create router
const router = createRouter({
  home: homeRoute,
  blog: blogRoute,
});

// 4️⃣ Use the router in your app
async function handleRequest(url: string) {
  const route = router.getRoute(url);
  
  if (!route) {
    return <NotFoundPage />;
  }

  // Everything is typed! TypeScript knows the types of all params
  const data = route.loader ? await route.loader() : null;
  const metaTags = route.meta ? route.meta(data) : [];
  const extras = route.extra ? route.extra() : null;

  return (
    <route.PageComponent 
      params={route.params} 
      data={data} 
    />
  );
}

// 5️⃣ Filter routes without running handlers (great for SSG!)
const staticRoutes = Object.values(router.routes)
  .filter(route => route.meta?.isStatic);
```

## Declarative Routes (less boilerplate)

If you don't need custom closures per route, `defineRoute` and `defineRoutes` remove the handler wiring entirely. Components receive the route context (`params`, `query`) as props, and `loader`/`meta`/`extra` receive it as their first argument:

```tsx
import { defineRoute, defineRoutes, createRouter } from "@btst/yar";

// Single route
const postRoute = defineRoute("/blog/:slug", {
  page: BlogPostPage, // rendered with { params, query } as props
  loading: Spinner,
  error: ErrorPage,
  loader: (ctx, signal?: AbortSignal) =>
    fetch(`/api/posts/${ctx.params.slug}`, { signal }).then((r) => r.json()),
  meta: (ctx, post) => [{ name: "title", content: post?.title ?? ctx.params.slug }],
  extra: (ctx) => ({ breadcrumbs: ["Home", "Blog", ctx.params.slug] }),
});

// Many routes at once, with optional page overrides
const routes = defineRoutes(
  {
    home: defineRoute("/", { page: HomePage }, undefined, { isStatic: true }),
    post: defineRoute("/blog/:slug", {
      page: BlogPostPage,
      loader: (ctx) => fetchPost(ctx.params.slug),
      meta: (ctx) => [{ name: "title", content: ctx.params.slug }],
    }),
  },
  { pages: { post: CustomPostPage } } // swap a page component per key
);

const router = createRouter(routes);
```

Overridden pages still receive the route context (`params`, `query`) as props. `defineRoutes` also accepts plain `createRoute` routes; overriding those swaps the `PageComponent` as-is.

`defineRoute` returns a regular route, so it composes freely with `createRoute` routes in the same `createRouter` call. Use `createRoute` when you need full control over the handler closure; use `defineRoute`/`defineRoutes` for the common declarative case.

## What You Need to Know

### `createRoute(path, handler, options?, routeMeta?)`

Creates a route. The handler returns:
- **`PageComponent`** - Your React component
- **`loader()`** - Load data (can accept any params like `AbortSignal`)
- **`meta()`** - Generate SEO tags (can accept any params)
- **`extra()`** - Any extra data you need (can accept any params)

The 4th parameter `routeMeta` lets you tag routes for filtering (e.g., `{ isStatic: true }`).

### `createRouter(routes)`

Combines your routes. Returns:
- **`routes`** - All your routes
- **`getRoute(path, query?)`** - Match a URL and get the route

### Key Features

**🎯 Path Parameters**
```tsx
"/blog/:slug" → params.slug is automatically typed
```

**✅ Query Validation**
```tsx
query: z.object({ sort: z.string() })
```

**🏷️ Route Tags**
```tsx
{ isStatic: true, requiresAuth: false }
// Filter without running handlers - perfect for finding static routes in SSG environments, or for filtering routes that require authentication.
```

**🎨 Flexible Functions**
```tsx
loader: (signal) => fetch(url, { signal })
meta: (data) => [{ name: "title", content: data.title }]
extra: (userId) => ({ breadcrumbs: [...], userId })
```
Perfect for prefetching data and generating meta tags in SSR environments, or for adding extra data to your routes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT