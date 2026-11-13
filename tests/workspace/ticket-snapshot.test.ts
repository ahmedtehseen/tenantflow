import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("ticket state reconciles authoritative snapshots after edits, creation, deletion, and scope changes", () => {
  execFileSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { stripTypeScriptTypes } from 'node:module';
    import { SourceTextModule, SyntheticModule } from 'node:vm';
    const slots = [];
    let cursor = 0;
    let effects = [];
    const channel = { on() { return this; }, subscribe() {} };
    const imports = {
      react: {
        useState(initial) {
          const index = cursor++;
          if (!slots[index]) slots[index] = { value: initial };
          return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
        },
        useRef(initial) {
          const index = cursor++;
          return slots[index] ||= { current: initial };
        },
        useEffect(effect, dependencies) {
          const index = cursor++;
          if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index].dependencies[i]))) {
            slots[index]?.cleanup?.();
            slots[index] = { dependencies };
            effects.push(() => { slots[index].cleanup = effect(); });
          }
        },
      },
      '@/lib/supabase/client': { createClient: () => ({ channel: () => channel, removeChannel() {} }) },
      '@/lib/realtime/ticket-events': { applyTicketRealtimeEvent: value => value },
    };
    const module = new SourceTextModule(stripTypeScriptTypes(readFileSync('src/hooks/use-ticket-realtime.ts', 'utf8')));
    await module.link(specifier => {
      const values = imports[specifier];
      assert.ok(values, 'Unexpected import ' + specifier);
      return new SyntheticModule(Object.keys(values), function () {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      });
    });
    await module.evaluate();
    const memberMap = new Map();
    function render(tickets, orgId = 'org') {
      const props = { initialTickets: tickets, orgId, memberMap };
      cursor = 0;
      module.namespace.useTicketRealtime(props);
      const pending = effects; effects = [];
      pending.forEach(effect => effect());
      cursor = 0;
      return module.namespace.useTicketRealtime(props).tickets;
    }
    const first = [{ id: 'one', title: 'Before' }];
    assert.deepEqual(render(first), first);
    const edited = [{ id: 'one', title: 'After' }];
    assert.deepEqual(render(edited), edited);
    const created = [...edited, { id: 'two', title: 'New' }];
    assert.deepEqual(render(created), created);
    assert.deepEqual(render([]), []);
    const other = [{ id: 'other', title: 'Other organization' }];
    assert.deepEqual(render(other, 'other-org'), other);
  `], { stdio: "pipe" });
});
