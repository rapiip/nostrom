import { Component, type ErrorInfo, type ReactNode } from "react";
import { ArrowClockwise, WarningOctagon } from "@phosphor-icons/react";
import { Button } from "./Button";
import { EmptyState, Panel } from "./Panel";

/**
 * Render-error containment.
 *
 * Without a boundary, one throwing component unmounts the whole tree and the
 * user is left with a blank page, which on a screen that guards funds reads as
 * "the app ate my vault". Two scopes are used:
 *
 *   app    wraps the router, last line of defence. Offers a full reload.
 *   route  wraps each console route, keyed by pathname so navigating away
 *          clears the error. The shell (nav, wallet) stays usable.
 *
 * A failed lazy chunk (typically a stale tab after a redeploy) is detected and
 * explained separately, because the remedy is a reload, not a retry.
 */

type Scope = "app" | "route";

interface Props {
  children: ReactNode;
  scope?: Scope;
}

interface State {
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced to the console so it reaches whatever error reporting the host
    // attaches; nothing is sent anywhere by the app itself.
    console.error("[Nostrom] render error", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const scope = this.props.scope ?? "route";
    const stale = isChunkLoadError(error);

    const body = (
      <EmptyState
        icon={<WarningOctagon size={26} aria-hidden />}
        title={stale ? "A newer version is available" : "This view failed to render"}
        description={
          stale
            ? "Part of the app could not be downloaded, usually because it was updated while this tab was open. Reload to get the current version. Nothing on-chain was affected."
            : "An unexpected error stopped this screen from drawing. No transaction was sent and nothing on-chain was affected. Try again, or reload the page if it keeps happening."
        }
        action={
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-2">
              {!stale && scope === "route" && (
                <Button variant="secondary" onClick={this.reset}>
                  Try again
                </Button>
              )}
              <Button
                variant="primary"
                icon={<ArrowClockwise size={14} aria-hidden />}
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
            </div>
            {!stale && (
              <details className="w-full max-w-md text-left">
                <summary className="cursor-pointer text-[12px] text-text-faint hover:text-text-dim">
                  Technical details
                </summary>
                <pre className="tnum mt-2 max-h-40 overflow-auto rounded border border-line bg-ink-800 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-text-dim">
                  {error.name}: {error.message}
                </pre>
              </details>
            )}
          </div>
        }
      />
    );

    if (scope === "app") {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-5">
          <Panel className="w-full max-w-xl" as="div">
            <div role="alert">{body}</div>
          </Panel>
        </main>
      );
    }

    return (
      <Panel as="div">
        <div role="alert">{body}</div>
      </Panel>
    );
  }
}
