/**
 * Opening this page inside a mobile wallet's own browser.
 *
 * The app only uses the injected connector, and a phone's regular browser has
 * no injected provider, so "Connect wallet" cannot work there. Mobile wallets
 * ship an in-app browser that DOES inject one; these links open the current
 * page in it. Formats are the wallets' documented deep links:
 *
 *   MetaMask     https://link.metamask.io/dapp/{host}{path}
 *                (docs.metamask.io, "Use deeplinks")
 *   Trust Wallet https://link.trustwallet.com/open_url?coin_id=60&url={url}
 *                (developer.trustwallet.com, "Deep Linking")
 *
 * Both are universal links: with the app installed they open it, otherwise
 * they land on the wallet's download page. Any other wallet works by pasting
 * the page link into its browser, which the UI offers as a copy action.
 */

export interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
}

/**
 * Phone or tablet browser. iPadOS 13+ reports a desktop Mac user agent, so a
 * "Macintosh" with a touch screen is treated as a tablet.
 */
export function isMobileBrowser(nav: NavigatorLike | undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * MetaMask takes host + path in the URL path itself. Query and hash are
 * dropped: they would be parsed as the deep link's own, and no Nostrom route
 * depends on them.
 */
export function metamaskDappLink(href: string): string {
  const url = new URL(href);
  return `https://link.metamask.io/dapp/${url.host}${url.pathname}`;
}

/** coin_id 60 is the SLIP-44 index for Ethereum, i.e. "open the EVM browser". */
export function trustWalletDappLink(href: string): string {
  return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}`;
}
