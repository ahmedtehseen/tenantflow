import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signWebhookPayload, calculateRetryBackoffMs } from "#webhooks/signer";
import { isPublicAddress, validateWebhookUrl } from "#webhooks/url";

describe("Webhook delivery security", () => {
  it("signs exact serialized bytes with HMAC-SHA256", () => {
    const payload = '{"event":"ticket.created"}';
    assert.equal(
      signWebhookPayload(payload, "secret"),
      "sha256=" + createHmac("sha256", "secret").update(payload).digest("hex"),
    );
  });
  it("uses the agreed retry schedule", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map(calculateRetryBackoffMs),
      [60000, 300000, 900000, 3600000, 21600000, 21600000],
    );
    assert.throws(() => calculateRetryBackoffMs(0));
  });
  it("rejects private, loopback, link-local, multicast, and mapped addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.2.3.4",
      "172.16.1.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
      "2002:7f00:1::",
    ]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
    assert.equal(isPublicAddress("8.8.8.8"), true);
    assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  });
  it("requires credential-free public HTTPS endpoints", () => {
    for (const url of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://localhost",
      "https://127.1",
      "https://[::1]",
      "file:///tmp/a",
      "https://example.com/#fragment",
    ]) {
      assert.throws(() => validateWebhookUrl(url), Error, url);
    }
    assert.equal(
      validateWebhookUrl("https://example.com/hook").hostname,
      "example.com",
    );
  });
});
