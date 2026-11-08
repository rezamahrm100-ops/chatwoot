import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Chatwoot } from '../src/chatwoot.mjs';

test('uses account-scoped Chatwoot APIs and relays Telegram payload unchanged', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, method: req.method, apiToken: req.headers.api_access_token, body });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { payload: [{ id: 17 }] }, ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const cw = new Chatwoot('http://127.0.0.1:' + server.address().port, 9, 'owner-secret', '123:ABCD');
    const result = await cw.conversations();
    assert.deepEqual(result.data.payload, [{ id: 17 }]);
    await cw.reply(17, 'پاسخ', false);
    await cw.reply(17, 'یادداشت', true);
    await cw.setStatus(17, 'resolved');
    await cw.assign(17, 5);
    const original = { update_id: 8, message: { chat: { id: 33, type: 'private' }, text: 'سلام' } };
    await cw.forwardTelegramUpdate(original);
    await cw.reportSummary();
    await cw.agentSummary();
    await cw.profile();
    assert.match(requests[0].url, /^\/api\/v1\/accounts\/9\/conversations\?/);
    assert.equal(requests[0].apiToken, 'owner-secret');
    assert.equal(requests[1].method, 'POST');
    assert.equal(JSON.parse(requests[1].body).message_type, 'outgoing');
    assert.equal(JSON.parse(requests[2].body).private, true);
    assert.equal(JSON.parse(requests[3].body).status, 'resolved');
    assert.equal(JSON.parse(requests[4].body).assignee_id, 5);
    assert.equal(requests[5].url, '/webhooks/telegram/123%3AABCD');
    assert.deepEqual(JSON.parse(requests[5].body), original);
    assert.equal(requests[5].apiToken, undefined);
    assert.match(requests[6].url, /^\/api\/v2\/accounts\/9\/reports\/summary\?type=account&since=\d+&until=\d+$/);
    assert.match(requests[7].url, /^\/api\/v2\/accounts\/9\/summary_reports\/agent\?since=\d+&until=\d+$/);
    assert.equal(requests[8].url, '/api/v1/profile');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
