import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ArrowLeft, Compass } from "@phosphor-icons/react";
import { wagmiConfig } from "@/config/wagmi";
import { ButtonRouterLink, Spinner } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState, Panel } from "@/components/ui/Panel";
import { ToastProvider } from "@/components/ui/Toast";
import { Nav } from "@/components/landing/Nav";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AppShell } from "@/routes/AppShell";
import { Landing } from "@/routes/Landing";

/**
 * Providers and routing.
 *
 * The landing page is imported eagerly because it is the entry point and must
 * paint without a second round-trip (it was previously lazy despite this
 * comment, which cost one extra chunk fetch plus a "Loading…" flash on every
 * first visit). Console routes are lazy so a visitor who never launches the app
 * does not download the vault UI.
 */

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
    <ErrorBoundary scope="app">
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ToastProvider>
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

                  {/* A real 404 rather than a silent redirect to "/": a mistyped
                      or stale link should say so, not pretend it worked. */}
                  <Route path="*" element={<NotFoundPublic />} />
                </Routes>
              </Suspense>
            </ToastProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
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
      <span className="flex items-center gap-2.5 text-[13px] text-text-dim" role="status">
        <Spinner />
        Loading…
      </span>
    </div>
  );
}

function NotFoundInApp() {
  useDocumentTitle("Page not found");
  return (
    <Panel>
      <EmptyState
        icon={<Compass size={26} aria-hidden />}
        title="Page not found"
        description="That console page does not exist. It may have been renamed, or the link was cut short."
        action={
          <ButtonRouterLink to="/app" variant="primary" icon={<ArrowLeft size={14} aria-hidden />}>
            Back to your vaults
          </ButtonRouterLink>
        }
      />
    </Panel>
  );
}

function NotFoundPublic() {
  useDocumentTitle("Page not found");
  return (
    <div className="min-h-dvh bg-ink-950">
      <Nav />
      <main id="main" className="mx-auto flex min-h-dvh max-w-[1240px] items-center px-5 pt-16 sm:px-8">
        <Panel className="w-full">
          <EmptyState
            icon={<Compass size={26} aria-hidden />}
            title="Nothing lives at this address"
            description="The page you asked for does not exist. If you were looking for a vault, open it from the console by its contract address."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonRouterLink to="/" variant="primary" icon={<ArrowLeft size={14} aria-hidden />}>
                  Back to overview
                </ButtonRouterLink>
                <ButtonRouterLink to="/app/lookup">Open a vault by address</ButtonRouterLink>
              </div>
            }
          />
        </Panel>
      </main>
    </div>
  );
}
