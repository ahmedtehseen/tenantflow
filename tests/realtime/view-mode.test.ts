import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveViewMode } from "#tickets/view-mode";

describe("View Mode Parameter Resolution", () => {
  it("resolves view mode correctly with fallback to list", () => {
    assert.equal(resolveViewMode("kanban"), "kanban");
    assert.equal(resolveViewMode("list"), "list");
    assert.equal(resolveViewMode("unknown"), "list");
    assert.equal(resolveViewMode(undefined), "list");
    assert.equal(resolveViewMode(null), "list");
    assert.equal(resolveViewMode(""), "list");
    assert.equal(resolveViewMode("BOARD"), "list");
    assert.equal(resolveViewMode("table"), "list");
  });

  it("handles URL search parameter parsing for view switching", () => {
    const parseViewParam = (searchString: string) => {
      const params = new URLSearchParams(searchString);
      const raw = params.get("view");
      return raw === "kanban" ? "kanban" : "list";
    };

    assert.equal(parseViewParam("?view=kanban"), "kanban");
    assert.equal(parseViewParam("?view=list"), "list");
    assert.equal(parseViewParam("?priority=high&view=kanban"), "kanban");
    assert.equal(parseViewParam("?search=issue"), "list");
    assert.equal(parseViewParam(""), "list");
  });
});
