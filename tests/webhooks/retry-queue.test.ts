import { it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

it("dispatches Redis-ready retries and retains database recovery when Redis fails", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { stripTypeScriptTypes } from 'node:module';
    import { SourceTextModule, SyntheticModule } from 'node:vm';
    let claims = [];
    let redisReads = 0;
    let redisFails = false;
    const query = {
      selection: '',
      select(value) { this.selection = value; return this; },
      eq() { return this; }, or() { return this; }, order() { return this; }, limit() { return this; },
      maybeSingle() { return Promise.resolve({ data: { status: 'pending', next_retry_at: null }, error: null }); },
      then(resolve) { return Promise.resolve({ data: [{id:'database-only'}, {id:'shared'}], error: null }).then(resolve); },
    };
    const client = {
      from() { return Object.create(query); },
      async rpc(name, input) { claims.push(input.p_id); return { data: [], error: null }; },
    };
    const imports = {
      'server-only': {},
      'node:crypto': { randomUUID: () => 'claim-token' },
      '@/lib/supabase/admin': { createAdminClient: () => client },
      '@/lib/redis/client': {
        async getReadyWebhookRetries() { redisReads++; if (redisFails) throw new Error('Redis unavailable'); return ['redis-only', 'shared']; },
        async scheduleWebhookRetry() {}, async removeWebhookRetry() {},
      },
      '#webhooks/signer': { calculateRetryBackoffMs: () => 60000 },
      './transport': { postWebhook: () => { throw new Error('Unexpected network request'); } },
    };
    const module = new SourceTextModule(stripTypeScriptTypes(readFileSync('src/lib/webhooks/dispatcher.ts','utf8')));
    await module.link(specifier => {
      const exports = imports[specifier];
      assert.ok(exports, 'Unexpected import '+specifier);
      return new SyntheticModule(Object.keys(exports), function() { for(const [name,value] of Object.entries(exports)) this.setExport(name,value); });
    });
    await module.evaluate();
    await module.namespace.dispatchPendingWebhooks();
    assert.deepEqual(new Set(claims), new Set(['redis-only','shared','database-only']));
    assert.equal(claims.length,3);
    assert.ok(redisReads > 0);
    claims=[]; redisFails=true;
    await module.namespace.dispatchPendingWebhooks();
    assert.deepEqual(claims,['database-only','shared']);
    claims=[]; redisReads=0;
    await module.namespace.dispatchPendingWebhooks('organization');
    assert.equal(redisReads,0);
    assert.deepEqual(claims,['database-only','shared']);
    console.log('Redis dispatch and durable recovery verified');
  `,
    ],
    { encoding: "utf8" },
  );
  assert.match(output, /Redis dispatch and durable recovery verified/);
});
