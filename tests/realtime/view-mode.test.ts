import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("View Mode Parameter Resolution", () => {
  it("resolves view mode correctly with fallback to list", () => {
    const resolveView = (val?: string | null) => (val === "kanban" ? "kanban" : "list");
    assert.equal(resolveView("kanban"), "kanban");
    assert.equal(resolveView("list"), "list");
    assert.equal(resolveView("unknown"), "list");
    assert.equal(resolveView(undefined), "list");
    assert.equal(resolveView(null), "list");
    assert.equal(resolveView(""), "list");
    assert.equal(resolveView("BOARD"), "list");
    assert.equal(resolveView("table"), "list");
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
