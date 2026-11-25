import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSameTicketVersion,
  ticketVersionMicros,
} from "#tickets/versioning";

describe("ticket version tokens (optimistic concurrency)", () => {
  it("treats different spellings of the same instant as the same version", () => {
    const postgrest = "2026-11-10T12:00:01.123456+00:00";
    for (const spelling of [
      "2026-11-10T12:00:01.123456Z",
      "2026-11-10 12:00:01.123456+00",
      "2026-11-10T12:00:01.123456",
      "2026-11-10T17:00:01.123456+05:00",
      "2026-11-10T12:00:01.1234560Z",
    ]) {
      assert.equal(isSameTicketVersion(spelling, postgrest), true, spelling);
    }
  });

  it("distinguishes versions one microsecond apart", () => {
    assert.equal(
      isSameTicketVersion(
        "2026-11-10T12:00:01.123456+00:00",
        "2026-11-10T12:00:01.123457+00:00",
      ),
      false,
    );
  });

  it("treats a missing fraction as zero microseconds", () => {
    assert.equal(
      isSameTicketVersion("2026-11-10T12:00:01Z", "2026-11-10T12:00:01.000000+00:00"),
      true,
    );
  });

  it("never matches unparseable or empty values, so tampered input is refused", () => {
    assert.equal(ticketVersionMicros(""), null);
    assert.equal(ticketVersionMicros("yesterday"), null);
    assert.equal(isSameTicketVersion("", "2026-11-10T12:00:01Z"), false);
    assert.equal(isSameTicketVersion("not-a-date", "not-a-date"), false);
  });
});
