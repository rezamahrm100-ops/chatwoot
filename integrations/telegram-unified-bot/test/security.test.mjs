import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseAgentMap, parseAgentTokens, parseIds, staffFor, verifyTelegramInitData, canAccessConversation, conversationList } from '../src/security.mjs';

test('roles fail closed', () => {
  const owners = parseIds('11, 12');
  const agents = parseAgentMap('{"22":7}');
  assert.equal(staffFor('11', owners, agents).role, 'owner');
  assert.deepEqual(staffFor('22', owners, agents), { role: 'agent', telegramId: '22', agentId: 7 });
  assert.equal(staffFor('23', owners, agents), null);
});
test('agent token map requires real per-user tokens', () => {
  assert.equal(parseAgentTokens('{"22":"a-long-agent-user-token"}').get('22'), 'a-long-agent-user-token');
  assert.throws(() => parseAgentTokens('{"22":true}'));
  assert.throws(() => parseAgentTokens('{"22":"short"}'));
  assert.throws(() => parseAgentTokens('[]'));
});
test('agents only access assigned conversations', () => {
  const agent = { role: 'agent', agentId: 7 };
  assert.equal(canAccessConversation(agent, { meta: { assignee: { id: 7 } } }), true);
  assert.equal(canAccessConversation(agent, { meta: { assignee: { id: 8 } } }), false);
  assert.equal(canAccessConversation(agent, { meta: { assignee_type: 'AgentBot', assignee: { id: 7 } } }), false);
  assert.equal(canAccessConversation(agent, { meta: {} }), false);
  assert.equal(canAccessConversation({ role: 'owner' }, { meta: {} }), true);
});
test('signed Telegram Mini App data is accepted, tampering and expiry are rejected', () => {
  const botToken = '12345:example';
  const now = 1800000000;
  const pairs = [['auth_date', String(now)], ['query_id', 'AA'], ['user', JSON.stringify({ id: 11, first_name: 'Owner' })]];
  const check = pairs.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + '=' + v).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', key).update(check).digest('hex');
  const encoded = new URLSearchParams([...pairs, ['hash', hash]]).toString();
  assert.equal(verifyTelegramInitData(encoded, botToken, now)?.id, 11);
  assert.equal(verifyTelegramInitData(encoded.replace('Owner', 'Admin'), botToken, now), null);
  assert.equal(verifyTelegramInitData(encoded, botToken, now + 901), null);
  assert.equal(verifyTelegramInitData(encoded + '&auth_date=' + now, botToken, now), null);
  assert.equal(verifyTelegramInitData(encoded + '&hash=' + hash, botToken, now), null);
});
test('known Chatwoot conversation list shapes supported', () => {
  assert.deepEqual(conversationList({ data: { payload: [{ id: 1 }] } }), [{ id: 1 }]);
  assert.deepEqual(conversationList({ payload: [{ id: 2 }] }), [{ id: 2 }]);
});
