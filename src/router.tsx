import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { BrandLoader } from "./components/brand-loader";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Branded loader while a route's data resolves.
    defaultPendingComponent: () => <BrandLoader fullscreen />,
    defaultPendingMs: 150,
  });

  return router;
};
