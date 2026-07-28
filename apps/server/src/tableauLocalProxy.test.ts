import { describe, expect, it } from "vite-plus/test";

import { isLoopbackRemoteAddress, readRemoteAddress } from "./tableauLocalProxy.ts";

describe("tableauLocalProxy", () => {
  describe("isLoopbackRemoteAddress", () => {
    it("accepts IPv4 loopback", () => {
      expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    });

    it("accepts IPv6 loopback", () => {
      expect(isLoopbackRemoteAddress("::1")).toBe(true);
    });

    it("accepts IPv4-mapped IPv6 loopback", () => {
      expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    });

    it("refuses a LAN address", () => {
      expect(isLoopbackRemoteAddress("192.168.1.24")).toBe(false);
    });

    it("refuses a tailnet-style address", () => {
      expect(isLoopbackRemoteAddress("100.98.12.7")).toBe(false);
    });

    it("refuses an unknown source rather than trusting it", () => {
      expect(isLoopbackRemoteAddress(undefined)).toBe(false);
      expect(isLoopbackRemoteAddress(null)).toBe(false);
      expect(isLoopbackRemoteAddress("")).toBe(false);
    });
  });

  describe("readRemoteAddress", () => {
    it("prefers the socket address", () => {
      expect(
        readRemoteAddress({ socket: { remoteAddress: "127.0.0.1" }, remoteAddress: "10.0.0.9" }),
      ).toBe("127.0.0.1");
    });

    it("falls back to the request-level address", () => {
      expect(readRemoteAddress({ remoteAddress: "::1" })).toBe("::1");
    });

    it("returns undefined for sourceless requests", () => {
      expect(readRemoteAddress(undefined)).toBeUndefined();
      expect(readRemoteAddress("not-an-object")).toBeUndefined();
      expect(readRemoteAddress({})).toBeUndefined();
    });
  });
});
