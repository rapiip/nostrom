import { describe, expect, it } from "vitest";
import { phaseAlert } from "./alerts";
import { isMobileBrowser, metamaskDappLink, trustWalletDappLink } from "./walletLinks";

describe("phaseAlert", () => {
  it("never announces the first reading", () => {
    expect(phaseAlert(undefined, "EXECUTABLE", "v")).toBeNull();
  });

  it("announces the transitions someone must act on", () => {
    expect(phaseAlert("ALIVE", "EXPIRING", "v")?.urgency).toBe("warn");
    expect(phaseAlert("EXPIRING", "EXECUTABLE", "v")?.urgency).toBe("danger");
    expect(phaseAlert("ALIVE", "EXECUTABLE", "v")?.title).toBe("Heartbeat lapsed: v");
    expect(phaseAlert("EXECUTABLE", "TRIGGERED", "v")?.urgency).toBe("danger");
  });

  it("stays quiet for recoveries and no-ops", () => {
    expect(phaseAlert("EXPIRING", "ALIVE", "v")).toBeNull();
    expect(phaseAlert("TRIGGERED", "ALIVE", "v")).toBeNull();
    expect(phaseAlert("ALIVE", "ALIVE", "v")).toBeNull();
    // Clock skew can flip EXECUTABLE back to EXPIRING; that is not news.
    expect(phaseAlert("EXECUTABLE", "EXPIRING", "v")).toBeNull();
  });
});

describe("isMobileBrowser", () => {
  it("detects phones and tablets", () => {
    expect(
      isMobileBrowser({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(true);
    expect(
      isMobileBrowser({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
      }),
    ).toBe(true);
  });

  it("treats a touch-screen 'Macintosh' as an iPad", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
    expect(isMobileBrowser({ userAgent: ua, maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBrowser({ userAgent: ua, maxTouchPoints: 0 })).toBe(false);
  });

  it("leaves desktop browsers alone", () => {
    expect(
      isMobileBrowser({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      }),
    ).toBe(false);
    expect(isMobileBrowser(undefined)).toBe(false);
  });
});

describe("wallet deep links", () => {
  const href = "https://nostrom.example/app/vault/0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968?x=1#y";

  it("MetaMask: host and path in the link path, query and hash dropped", () => {
    expect(metamaskDappLink(href)).toBe(
      "https://link.metamask.io/dapp/nostrom.example/app/vault/0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
    );
  });

  it("Trust Wallet: the full URL, encoded, on the EVM browser", () => {
    expect(trustWalletDappLink(href)).toBe(
      `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}`,
    );
  });
});
