import { useState, useSyncExternalStore } from "react";
import { ArrowSquareOut, DeviceMobile, LinkSimple } from "@phosphor-icons/react";
import { isMobileBrowser, metamaskDappLink, trustWalletDappLink } from "@/lib/walletLinks";
import { writeClipboard } from "@/components/ui/Address";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

/**
 * What a phone visitor without a wallet can actually do.
 *
 * A phone's regular browser has no injected provider, so "Install MetaMask"
 * (a desktop extension link) is a dead end there. Mobile wallets inject a
 * provider inside their own in-app browser, so the useful action is to reopen
 * THIS page in one. The deep links carry the current path, so a visitor who
 * followed a link to a specific vault lands on that vault.
 */

const noop = () => () => {};

/** Stable for the page's lifetime; read once without an effect. */
export function useIsMobileBrowser(): boolean {
  return useSyncExternalStore(
    noop,
    () => isMobileBrowser(typeof navigator === "undefined" ? undefined : navigator),
    () => false,
  );
}

/** The options themselves, for inline placement (empty states, dialogs). */
export function OpenInWalletOptions() {
  const { toast } = useToast();
  const href = window.location.href;

  const copy = async () => {
    const ok = await writeClipboard(href);
    toast({
      id: "copy-page-link",
      tone: ok ? "signal" : "warn",
      title: ok ? "Link copied" : "Could not copy",
      description: ok
        ? "Open your wallet app, go to its browser, and paste the link."
        : "Copy the address from your browser's address bar instead.",
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <ButtonLink href={metamaskDappLink(href)} variant="primary" full iconRight={<ArrowSquareOut size={13} aria-hidden />}>
        Open in MetaMask
      </ButtonLink>
      <ButtonLink href={trustWalletDappLink(href)} full iconRight={<ArrowSquareOut size={13} aria-hidden />}>
        Open in Trust Wallet
      </ButtonLink>
      <Button full icon={<LinkSimple size={14} aria-hidden />} onClick={() => void copy()}>
        Copy link for another wallet
      </Button>
      <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
        Each link opens this page inside the wallet's own browser, where it can connect. Without the
        app installed, it leads to the wallet's download page.
      </p>
    </div>
  );
}

/** Header-sized trigger that opens the options in a dialog. */
export function OpenInWalletButton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size={size}
        icon={<DeviceMobile size={14} aria-hidden />}
        onClick={() => setOpen(true)}
        title="This browser has no wallet. Reopen the page inside a wallet app."
      >
        Open in wallet
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Open Nostrom in your wallet app"
        description="Phone browsers cannot talk to a wallet directly. Wallet apps have their own browser that can."
        size="sm"
      >
        <OpenInWalletOptions />
      </Dialog>
    </>
  );
}
