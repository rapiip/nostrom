import { clsx } from "clsx";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowSquareOut,
  CheckCircle,
  Info,
  ShieldWarning,
  Warning,
  X,
} from "@phosphor-icons/react";

/**
 * Transient notifications.
 *
 * For events the user did not directly trigger on the current control, or that
 * would otherwise go unnoticed: an agent's heartbeat landing while you watch a
 * vault, the grace window crossing into "expiring", the wallet switching
 * account, a clipboard write being blocked. Transaction outcomes are NOT
 * toasted; they already get the full receipt dialog, and saying it twice would
 * be noise.
 *
 * Accessibility:
 *   - Announcements go through two persistent, visually hidden live regions
 *     (polite and assertive) that exist before any toast does. Screen readers
 *     reliably announce changes to an existing region, not the insertion of a
 *     new element carrying role="status".
 *   - Visible toasts pause their timer on hover, keyboard focus, and while the
 *     tab is hidden, so nobody loses a message they were reading.
 *   - Every toast has an explicit dismiss control; none depends on the timer.
 *
 * Motion is a 200ms rise on enter and a faster fade on exit; the global
 * reduced-motion rule flattens both.
 */

export type ToastTone = "info" | "signal" | "warn" | "danger";

export interface ToastAction {
  label: string;
  /** In-app route. */
  to?: string;
  /** External URL, opened in a new tab. */
  href?: string;
  onClick?: () => void;
}

export interface ToastInput {
  /** Supplying an id de-duplicates: a second toast with the same id replaces the first. */
  id?: string;
  tone?: ToastTone;
  title: string;
  description?: ReactNode;
  action?: ToastAction;
  /** Milliseconds. Defaults to 5s, or 8s for danger. */
  duration?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, "id" | "tone" | "title" | "duration">> {
  description?: ReactNode;
  action?: ToastAction;
  leaving: boolean;
  /** Bumped when a de-duplicated toast is replaced, so its timer restarts. */
  version: number;
}

interface ToastApi {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE = 4;
const EXIT_MS = 140;

const ToastContext = createContext<ToastApi | null>(null);

/** No-op fallback so a component rendered outside the provider never crashes. */
const NOOP_API: ToastApi = { toast: () => "", dismiss: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_API;
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);
  const removalTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const announce = useCallback((text: string, assertive: boolean) => {
    const region = assertive ? assertiveRef.current : politeRef.current;
    if (!region) return;
    // Clear first so an identical message is announced again.
    region.textContent = "";
    setTimeout(() => {
      region.textContent = text;
    }, 60);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    clearTimeout(removalTimers.current.get(id));
    removalTimers.current.set(
      id,
      setTimeout(() => {
        removalTimers.current.delete(id);
        setToasts((list) => list.filter((t) => t.id !== id));
      }, EXIT_MS),
    );
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? `toast-${++counter}`;
      const tone = input.tone ?? "info";
      const duration = input.duration ?? (tone === "danger" ? 8000 : 5000);

      clearTimeout(removalTimers.current.get(id));
      removalTimers.current.delete(id);

      setToasts((list) => {
        const existing = list.find((t) => t.id === id);
        const record: ToastRecord = {
          id,
          tone,
          title: input.title,
          duration,
          leaving: false,
          version: (existing?.version ?? 0) + 1,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.action !== undefined ? { action: input.action } : {}),
        };
        const next = existing
          ? list.map((t) => (t.id === id ? record : t))
          : [...list, record];
        // Oldest go first when the stack is full; a wall of toasts helps nobody.
        return next.slice(-MAX_VISIBLE);
      });

      const spoken =
        typeof input.description === "string" ? `${input.title}. ${input.description}` : input.title;
      announce(spoken, tone === "danger");
      return id;
    },
    [announce],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Persistent live regions. Present from first paint. */}
      <div ref={politeRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div
        ref={assertiveRef}
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      />

      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
      >
        <ol className="flex flex-col gap-2">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} dismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

/* ===========================================================================
   One toast
   =========================================================================== */

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; border: string; iconClass: string }> = {
  info: { icon: Info, border: "border-line-strong", iconClass: "text-text-dim" },
  signal: { icon: CheckCircle, border: "border-signal-dim", iconClass: "text-signal" },
  warn: { icon: Warning, border: "border-warn-dim", iconClass: "text-warn" },
  danger: { icon: ShieldWarning, border: "border-danger-dim", iconClass: "text-danger" },
};

function ToastItem({ toast, dismiss }: { toast: ToastRecord; dismiss: (id: string) => void }) {
  const onDismiss = useCallback(() => dismiss(toast.id), [dismiss, toast.id]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Pausable countdown. Remaining time survives pauses; a replaced toast
  // (new `version`) starts over with its full duration.
  const remaining = useRef(toast.duration);
  const versionSeen = useRef(toast.version);
  const paused = hovered || focused || hidden || toast.leaving;

  useEffect(() => {
    if (versionSeen.current !== toast.version) {
      versionSeen.current = toast.version;
      remaining.current = toast.duration;
    }
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(onDismiss, Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, onDismiss, toast.version, toast.duration]);

  const { icon: Icon, border, iconClass } = TONE_STYLES[toast.tone];

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={clsx(
        "pointer-events-auto rounded-md border bg-ink-900/98 px-4 py-3.5 backdrop-blur-sm",
        "shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]",
        border,
        toast.leaving ? "toast-out" : "toast-in",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon size={16} weight="regular" className={clsx("mt-0.5 shrink-0", iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug font-medium text-text">{toast.title}</p>
          {toast.description && (
            <div className="mt-1 text-[12px] leading-relaxed text-text-dim">{toast.description}</div>
          )}
          {toast.action && <ToastActionControl action={toast.action} onDone={onDismiss} />}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-mt-1 -mr-1.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

function ToastActionControl({ action, onDone }: { action: ToastAction; onDone: () => void }) {
  const className =
    "mt-2.5 inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded border border-line-strong bg-ink-850 px-2.5 text-[12px] text-text no-underline transition-colors duration-150 hover:border-text-faint hover:bg-ink-750";

  if (action.to) {
    return (
      <Link
        to={action.to}
        className={className}
        onClick={() => {
          action.onClick?.();
          onDone();
        }}
      >
        {action.label}
      </Link>
    );
  }
  if (action.href) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        {action.label}
        <ArrowSquareOut size={11} aria-hidden />
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        action.onClick?.();
        onDone();
      }}
    >
      {action.label}
    </button>
  );
}
