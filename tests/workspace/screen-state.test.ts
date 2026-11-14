import assert from "node:assert/strict";
import { test } from "node:test";
import { ScreenState } from "#workspace/screen-state";
import { resolvePreferredView, viewPreferenceKey } from "#tickets/view-mode";

test("screen context survives more than three screen visits and stays scope-local", () => {
  const first = new ScreenState();
  first.set("tickets:search", "leak");
  first.set("tickets:scroll", 640);
  for (const name of ["overview", "members", "settings", "ticket:1"]) first.set(name, true);
  assert.equal(first.get("tickets:search"), "leak");
  assert.equal(first.get("tickets:scroll"), 640);
  assert.equal(new ScreenState().get("tickets:search"), undefined);
  first.clear();
  assert.equal(first.get("tickets:search"), undefined);
});

test("view preference is scoped to user, organization and screen", () => {
  assert.notEqual(viewPreferenceKey("u1", "o1"), viewPreferenceKey("u2", "o1"));
  assert.notEqual(viewPreferenceKey("u1", "o1"), viewPreferenceKey("u1", "o2"));
});

test("explicit valid URL view wins, otherwise restore a valid saved preference", () => {
  assert.equal(resolvePreferredView("list", "kanban"), "list");
  assert.equal(resolvePreferredView("kanban", "list"), "kanban");
  assert.equal(resolvePreferredView(null, "kanban"), "kanban");
  assert.equal(resolvePreferredView("bad", "kanban"), "kanban");
  assert.equal(resolvePreferredView(null, "bad"), "list");
});

test("clearing submitted form drafts preserves other working context", () => {
  const state = new ScreenState();
  state.set("settings:sla:timezone", { base: "UTC", value: "Asia/Karachi" });
  state.set("tickets:search", "open");
  state.clear("settings:sla:");
  assert.equal(state.get("settings:sla:timezone"), undefined);
  assert.equal(state.get("tickets:search"), "open");
});
