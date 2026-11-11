import { createHmac, timingSafeEqual } from 'node:crypto';

export function parseIds(value = '') {
  return new Set(value.split(',').map(x => x.trim()).filter(Boolean));
}

export function parseAgentMap(value = '{}') {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('AGENT_MAP_JSON must be an object');
  const result = new Map();
  for (const [telegramId, agentId] of Object.entries(parsed)) {
    if (!/^\d+$/.test(telegramId) || !Number.isSafeInteger(Number(agentId)) || Number(agentId) < 1) {
      throw Error('AGENT_MAP_JSON must map Telegram numeric IDs to Chatwoot positive integer agent IDs');
    }
    result.set(telegramId, Number(agentId));
  }
  return result;
}

export function parseAgentTokens(value = '{}') {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('AGENT_API_TOKENS_JSON must be an object');
  const result = new Map();
  for (const [telegramId, token] of Object.entries(parsed)) {
    if (!/^\d+$/.test(telegramId) || typeof token !== 'string' || token.length < 10) {
      throw Error('AGENT_API_TOKENS_JSON must map Telegram numeric IDs to nonempty user access tokens');
    }
    result.set(telegramId, token);
  }
  return result;
}

export function staffFor(userId, owners, agents) {
  const id = String(userId ?? '');
  if (owners.has(id)) return { role: 'owner', telegramId: id };
  if (agents.has(id)) return { role: 'agent', telegramId: id, agentId: agents.get(id) };
  return null;
}

export function verifyTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof initData !== 'string' || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const entries = [...params.entries()].filter(([key]) => key !== 'hash');
  if (!hash || params.getAll('hash').length !== 1 || !/^[0-9a-f]{64}$/i.test(hash) ||
      entries.length !== new Set(entries.map(([key]) => key)).size) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 60 || nowSeconds - authDate > 900) return null;
  const dataCheck = entries.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + '=' + v).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', key).update(dataCheck).digest();
  if (!timingSafeEqual(calculated, Buffer.from(hash, 'hex'))) return null;
  try {
    const user = JSON.parse(params.get('user') || '{}');
    return Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}

export function secureEquals(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assigneeId(conversation) {
  const assignee = conversation?.meta?.assignee ?? conversation?.assignee;
  return Number(assignee?.id ?? conversation?.assignee_id ?? 0);
}

export function canAccessConversation(staff, conversation) {
  if (staff?.role === 'owner') return true;
  const assignedType = conversation?.meta?.assignee_type ?? conversation?.assignee_type;
  return staff?.role === 'agent' && (!assignedType || assignedType === 'User') &&
    assigneeId(conversation) === staff.agentId;
}

export function conversationList(value) {
  if (Array.isArray(value?.data?.payload)) return value.data.payload;
  if (Array.isArray(value?.payload)) return value.payload;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}
