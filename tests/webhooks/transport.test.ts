import { it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

it("pins validated DNS, sends signed bytes, and never follows redirects", () => {
  // Isolate built-in mocks and use the server-only module's React server condition.
  const result = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import dns from 'node:dns/promises';
    import https from 'node:https';
    import { EventEmitter } from 'node:events';
    import { syncBuiltinESMExports } from 'node:module';
    let requests = 0;
    dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
    https.request = (url, options, callback) => {
      requests++;
      assert.equal(options.family, 4);
      assert.equal(options.agent, false);
      assert.match(options.headers['X-TenantFlow-Signature'], /^sha256=[a-f0-9]{64}$/);
      assert.equal(options.headers['X-TenantFlow-Delivery'], 'delivery-id');
      options.lookup('example.com', {}, (error, address, family) => {
        assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
      });
      const request = new EventEmitter();
      request.destroy = () => request.emit('close');
      request.end = (body) => {
        assert.equal(body, '{"event":"ticket.created"}');
        callback({ statusCode: 302, destroy() {} });
        request.emit('close');
      };
      return request;
    };
    syncBuiltinESMExports();
    const { postWebhook } = await import('#webhooks/transport');
    assert.equal(await postWebhook('https://example.com/hook', '{"event":"ticket.created"}', 'secret', 'delivery-id'), 302);
    assert.equal(requests, 1);
    dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
    syncBuiltinESMExports();
    await assert.rejects(postWebhook('https://example.com/hook', '{}', 'secret', 'delivery-id'), /public IP/);
    assert.equal(requests, 1);
    console.log('Transport verified');
  `,
    ],
    { encoding: "utf8" },
  );
  assert.match(result, /Transport verified/);
});
