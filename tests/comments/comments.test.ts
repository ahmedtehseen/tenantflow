import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractMentionedUserIds,
  renderMentionTokens,
} from "#comments/mention-utils";

describe("Structured mentions", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  it("deduplicates valid UUID tokens and ignores malformed tokens", () => {
    assert.deepEqual(
      extractMentionedUserIds(
        `@[Alice](${id}) @[Alice](${id}) @[Bad](abc) @plain`,
      ),
      [id],
    );
    assert.deepEqual(
      extractMentionedUserIds(
        "@[Bad](1111-2222) @[Bad](------------------------------------)",
      ),
      [],
    );
  });
  it("renders plain display text without generating HTML", () => {
    assert.equal(
      renderMentionTokens(`Hi @[Alice](${id}) <script>`),
      "Hi @Alice <script>",
    );
  });
  it("normalizes uppercase UUIDs", () => {
    assert.deepEqual(
      extractMentionedUserIds("@[Alice](AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA)"),
      ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    );
  });
});
