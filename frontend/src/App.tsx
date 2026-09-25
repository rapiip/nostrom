import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/config/wagmi";
import { Spinner } from "@/components/ui/Button";
import { EmptyState, Panel } from "@/components/ui/Panel";
import { AppShell } from "@/routes/AppShell";

/**
 * Providers and routing.
 *
 * The landing page loads eagerly because it is the entry point and must paint
 * fast. Console routes are lazy so a visitor who never launches the app does not
 * download the vault UI.
 */

const Landing = lazy(() =>
  import("@/routes/Landing").then((m) => ({ default: m.Landing })),
);
const Reference = lazy(() =>
  import("@/routes/Reference").then((m) => ({ default: m.Reference })),
);
const Vaults = lazy(() => import("@/routes/Vaults").then((m) => ({ default: m.Vaults })));
const CreateVault = lazy(() =>
  import("@/routes/CreateVault").then((m) => ({ default: m.CreateVault })),
);
const VaultDetail = lazy(() =>
  import("@/routes/VaultDetail").then((m) => ({ default: m.VaultDetail })),
);
const Lookup = lazy(() => import("@/routes/Lookup").then((m) => ({ default: m.Lookup })));
const Keeper = lazy(() => import("@/routes/Keeper").then((m) => ({ default: m.Keeper })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Contract reads are cheap and the countdown interpolates locally, so a
      // short stale window keeps the UI honest without hammering the RPC.
      staleTime: 8_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/reference" element={<Reference />} />

              <Route path="/app" element={<AppShell />}>
                <Route index element={<Vaults />} />
                <Route path="new" element={<CreateVault />} />
                <Route path="lookup" element={<Lookup />} />
                <Route path="keeper" element={<Keeper />} />
                <Route path="vault/:address" element={<VaultDetail />} />
                <Route path="*" element={<NotFoundInApp />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/** Reset scroll on navigation, but leave in-page hash links alone. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash]);
  return null;
}

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950">
      <span className="flex items-center gap-2.5 text-[13px] text-text-dim">
        <Spinner />
        Loading…
      </span>
    </div>
  );
}

function NotFoundInApp() {
  return (
    <Panel>
      <EmptyState
        title="Page not found"
        description="That console route does not exist."
        action={
          <Link
            to="/app"
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded border border-signal bg-signal px-4 text-[13px] font-medium text-ink-950 no-underline transition-colors hover:bg-signal/90"
          >
            Back to vaults
          </Link>
        }
      />
    </Panel>
  );
}
