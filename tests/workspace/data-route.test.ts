import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("workspace reads authorize every request and distinguish failures from empty data", () => {
  execFileSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { stripTypeScriptTypes } from 'node:module';
    import { SourceTextModule, SyntheticModule } from 'node:vm';
    let signedIn = true;
    let role = 'member';
    let fail = false;
    let missing = false;
    let reads = 0;
    const context = { user: { id: 'user' }, currentOrg: { id: 'org' } };
    const load = async () => { reads++; if (fail) throw new Error('Database unavailable'); return missing ? null : { tickets: [] }; };
    const imports = {
      '@/lib/data/tenant': {
        getCurrentUser: async () => signedIn ? context.user : null,
        getTenantContext: async () => ({ ...context, currentRole: role }),
      },
      '@/lib/data/workspace': { loadOverview: load, loadTickets: load, loadMembers: load, loadSettings: load, loadDetail: load },
    };
    const module = new SourceTextModule(stripTypeScriptTypes(readFileSync('src/app/org/[slug]/data/[...screen]/route.ts', 'utf8')));
    await module.link(specifier => {
      const values = imports[specifier];
      assert.ok(values, 'Unexpected import ' + specifier);
      return new SyntheticModule(Object.keys(values), function () {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      });
    });
    await module.evaluate();
    const get = (screen = ['tickets'], query = 'user=user&org=org') => module.namespace.GET(
      new Request('http://localhost/org/example/data/' + screen.join('/') + '?' + query),
      { params: Promise.resolve({ slug: 'example', screen }) },
    );
    signedIn = false;
    assert.equal((await get()).status, 401);
    signedIn = true; role = null;
    assert.equal((await get()).status, 403);
    role = 'member';
    assert.equal((await get(['tickets'], 'user=other&org=org')).status, 403);
    assert.equal((await get(['tickets'], 'user=user&org=other')).status, 403);
    assert.equal(reads, 0);
    let response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { tickets: [] });
    fail = true;
    response = await get();
    assert.equal(response.status, 500);
    assert.equal((await response.json()).tickets, undefined);
    fail = false; missing = true;
    assert.equal((await get(['ticket', '10000000-0000-4000-8000-000000000001'])).status, 410);
    assert.equal((await get(['ticket', 'invalid'])).status, 400);
    assert.equal((await get(['unexpected'])).status, 400);
  `], { stdio: "pipe" });
});
