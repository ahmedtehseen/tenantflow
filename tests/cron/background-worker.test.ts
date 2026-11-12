import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyCronAuthorization } from "#cron/authorization";

describe("Background worker authentication", () => {
  it("requires a configured, exact bearer token", () => {
    assert.equal(verifyCronAuthorization("Bearer secret", "secret"), true);
    assert.equal(verifyCronAuthorization(null, "secret"), false);
    assert.equal(verifyCronAuthorization("Bearer wrong", "secret"), false);
    assert.equal(verifyCronAuthorization("Bearer ", ""), false);
    assert.equal(verifyCronAuthorization("bearer secret", "secret"), false);
  });
});
