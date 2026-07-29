import { describe, expect, it } from "vite-plus/test";

import { isLoopbackRemoteAddress, isSameAppBrowserRequest } from "./tableauLocalProxy.ts";

describe("isLoopbackRemoteAddress", () => {
  it("accepts loopback shapes and refuses the rest", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("192.168.1.20")).toBe(false);
    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
  });
});

describe("isSameAppBrowserRequest", () => {
  it("accepts the PACKAGED renderer despite its cross-site labelling", () => {
    // The custom scheme (t3code://app) makes Chromium label every fetch to
    // the local server cross-site — the origin allowlist must win, or the
    // installed app loses Tableau local and the update pill (vécu 29/07).
    expect(
      isSameAppBrowserRequest({ origin: "t3code://app", "sec-fetch-site": "cross-site" }),
    ).toBe(true);
    expect(
      isSameAppBrowserRequest({ origin: "t3code-dev://app", "sec-fetch-site": "cross-site" }),
    ).toBe(true);
  });

  it("accepts the dev renderer and plain local tooling", () => {
    // Dev: web port → server port is same-site. curl: no browser headers.
    expect(isSameAppBrowserRequest({ "sec-fetch-site": "same-site" })).toBe(true);
    expect(isSameAppBrowserRequest({ "sec-fetch-site": "same-origin" })).toBe(true);
    expect(isSameAppBrowserRequest({})).toBe(true);
    expect(isSameAppBrowserRequest({ origin: "http://localhost:5738" })).toBe(true);
  });

  it("refuses cross-site websites — the CSRF this guard exists for", () => {
    expect(
      isSameAppBrowserRequest({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
    ).toBe(false);
    expect(isSameAppBrowserRequest({ "sec-fetch-site": "cross-site" })).toBe(false);
    expect(isSameAppBrowserRequest({ origin: "null" })).toBe(false);
    expect(isSameAppBrowserRequest({ origin: "https://evil.example" })).toBe(false);
  });
});
