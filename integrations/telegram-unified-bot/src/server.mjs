import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chatwoot } from './chatwoot.mjs';
import { parseAgentMap, parseIds, staffFor, secureEquals, verifyTelegramInitData, canAccessConversation, conversationList } from './security.mjs';

const config = {
  token: process.env.BOT_TOKEN,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  accountId: process.env.CHATWOOT_ACCOUNT_ID,
  apiToken: process.env.CHATWOOT_API_TOKEN,
  baseUrl: process.env.CHATWOOT_BASE_URL || 'http://rails:3000',
  publicUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  owners: parseIds(process.env.OWNER_TELEGRAM_IDS),
  agents: parseAgentMap(process.env.AGENT_MAP_JSON),
  register: process.env.AUTO_REGISTER_WEBHOOK === 'true',
  port: Number(process.env.PORT || 8080)
};
for (const [key, value] of Object.entries({
  BOT_TOKEN: config.token, TELEGRAM_WEBHOOK_SECRET: config.webhookSecret,
  CHATWOOT_ACCOUNT_ID: config.accountId, CHATWOOT_API_TOKEN: config.apiToken
})) {
  if (!value || value.includes('REPLACE_WITH')) throw Error('Missing configuration: ' + key);
}
if (config.owners.size === 0) throw Error('OWNER_TELEGRAM_IDS must contain at least one Telegram ID');
if (!/^[a-zA-Z0-9_-]{1,256}$/.test(config.webhookSecret)) throw Error('Invalid Telegram webhook secret');
if (!/^\d+$/.test(config.accountId) || Number(config.accountId) < 1) throw Error('Invalid Chatwoot account ID');
if (config.publicUrl && !/^https:\/\//i.test(config.publicUrl)) throw Error('PUBLIC_BASE_URL must use HTTPS');
if (config.register && !config.publicUrl) throw Error('PUBLIC_BASE_URL is required to register webhook');

const cw = new Chatwoot(config.baseUrl, config.accountId, config.apiToken, config.token);
const telegramBase = 'https://api.telegram.org/bot' + config.token;
const here = dirname(fileURLToPath(import.meta.url));

async function telegram(method, data) {
  const response = await fetch(telegramBase + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw Error('Telegram API failed: ' + method + ' (' + response.status + ')');
  return body.result;
}

function keyboard() {
  const rows = [[
    { text: 'گفتگوهای باز', callback_data: 'menu:inbox' },
    { text: 'گزارش', callback_data: 'menu:stats' }
  ]];
  if (config.publicUrl) rows.push([{ text: 'داشبورد مدیریت', web_app: { url: config.publicUrl + '/app' } }]);
  return { inline_keyboard: rows };
}
async function send(chatId, message, replyMarkup) {
  return telegram('sendMessage', { chat_id: chatId, text: String(message).slice(0, 3900), ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}
async function ensureStaff(userId) {
  const staff = staffFor(userId, config.owners, config.agents);
  if (!staff) return null;
  if (staff.role === 'agent') {
    // A removed Chatwoot agent must not keep bot privileges through a stale mapping.
    const agents = await cw.agents();
    const records = Array.isArray(agents) ? agents : (agents?.payload ?? []);
    if (!records.some(agent => Number(agent.id) === staff.agentId)) return null;
  }
  return staff;
}
async function conversationFor(staff, id) {
  const conversation = await cw.conversation(id);
  if (!canAccessConversation(staff, conversation)) {
    const error = Error('Conversation not found or not assigned to you');
    error.status = 403;
    throw error;
  }
  return conversation;
}
function conversationLabel(c) {
  const person = c.meta?.sender?.name || c.meta?.sender?.phone_number || 'مشتری';
  return '#' + c.id + ' | ' + person + ' | ' + c.status;
}
async function listConversations(staff, page = 1, status = 'open') {
  const data = await cw.conversations(page, status);
  const conversations = conversationList(data).filter(item => canAccessConversation(staff, item));
  return { conversations, meta: staff.role === 'owner' ? data.data?.meta ?? {} : {}, page };
}
function parseCommand(text) {
  const match = text?.trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return match ? { command: match[1].toLowerCase(), args: (match[2] || '').trim() } : null;
}
async function performStaffAction(staff, input) {
  const parsed = parseCommand(input);
  if (!parsed) return 'دستور شناخته نشد. برای راهنما /help را وارد کنید.';
  const { command, args } = parsed;
  if (['start', 'help'].includes(command)) return [
    'پنل اختصاصی فروشگاه',
    '/inbox — گفتگوهای باز',
    '/reply ID متن — پاسخ به مشتری',
    '/note ID متن — یادداشت داخلی',
    '/close ID — بستن گفتگو',
    '/open ID — بازگشایی گفتگو',
    ...(staff.role === 'owner' ? ['/assign ID AGENT_ID — ارجاع', '/agents — پشتیبان‌ها', '/customers — مشتریان', '/stats — گزارش'] : []),
    'برای پاسخ‌گویی، شناسهٔ گفتگو را از /inbox انتخاب کنید.'
  ].join('\n');
  if (['inbox', 'my'].includes(command)) {
    const { conversations } = await listConversations(staff);
    return conversations.length ? conversations.slice(0, 12).map(conversationLabel).join('\n') : 'در صفحهٔ نخست گفتگوی مجازی نمایش داده نمی‌شود.';
  }
  if (command === 'agents' && staff.role === 'owner') {
    const value = await cw.agents();
    const records = Array.isArray(value) ? value : (value?.payload ?? []);
    return records.slice(0, 30).map(x => '#' + x.id + ' ' + x.name).join('\n') || 'پشتیبانی ثبت نشده است.';
  }
  if (command === 'customers' && staff.role === 'owner') {
    const value = await cw.contacts();
    const records = value.payload || value.data?.payload || [];
    return records.slice(0, 15).map(x => '#' + x.id + ' ' + (x.name || x.email || 'مشتری')).join('\n') || 'مشتری ثبت نشده است.';
  }
  if (command === 'stats' && staff.role === 'owner') {
    const data = await cw.conversations(1, 'open');
    const meta = data.data?.meta || {};
    return 'گزارش گفتگوهای باز\nکل: ' + (meta.all_count ?? 'نامشخص') +
      '\nارجاع‌داده‌شده: ' + (meta.assigned_count ?? 'نامشخص') +
      '\nبدون پشتیبان: ' + (meta.unassigned_count ?? 'نامشخص');
  }
  if (['reply', 'note', 'close', 'open', 'assign'].includes(command)) {
    const match = args.match(/^(\d+)(?:\s+([\s\S]+))?$/);
    if (!match) return 'قالب دستور نامعتبر است؛ /help را ببینید.';
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id < 1) return 'شناسهٔ گفتگو نامعتبر است.';
    await conversationFor(staff, id);
    if (command === 'close' || command === 'open') {
      await cw.setStatus(id, command === 'close' ? 'resolved' : 'open');
      return 'وضعیت گفتگو #' + id + ' تغییر کرد.';
    }
    if (command === 'assign') {
      if (staff.role !== 'owner') return 'دسترسی ندارید.';
      if (!/^\d+$/.test(match[2] || '')) return 'شناسهٔ پشتیبان را وارد کنید.';
      const agentId = Number(match[2]);
      const values = await cw.agents();
      const records = Array.isArray(values) ? values : values.payload || [];
      if (!records.some(agent => Number(agent.id) === agentId)) return 'پشتیبان معتبر نیست.';
      await cw.assign(id, agentId);
      return 'گفتگو #' + id + ' ارجاع داده شد.';
    }
    const content = (match[2] || '').trim();
    if (!content || content.length > 4000) return 'متن پاسخ باید ۱ تا ۴۰۰۰ نویسه باشد.';
    await cw.reply(id, content, command === 'note');
    return (command === 'note' ? 'یادداشت ثبت شد: #' : 'پاسخ ارسال شد: #') + id;
  }
  return 'دستور نامعتبر یا خارج از سطح دسترسی. /help';
}
async function incomingTelegram(payload) {
  const event = payload.message || payload.edited_message || payload.callback_query?.message || payload.business_message;
  const userId = payload.callback_query?.from?.id || payload.message?.from?.id ||
    payload.edited_message?.from?.id || payload.business_message?.from?.id;
  const chat = event?.chat;
  const staff = chat?.type === 'private' ? await ensureStaff(userId) : null;
  if (!staff) {
    const text = payload.message?.text?.trim();
    if (chat?.type === 'private' && /^\/start(?:@\w+)?$/.test(text || '')) {
      await send(chat.id, 'سلام! پیام خود را ارسال کنید تا تیم پشتیبانی پاسخ دهد.');
      return null;
    }
    return cw.forwardTelegramUpdate(payload);
  }
  if (payload.callback_query) {
    const callbackId = payload.callback_query.id;
    await telegram('answerCallbackQuery', { callback_query_id: callbackId });
    const action = payload.callback_query.data;
    if (action === 'menu:inbox' || (action === 'menu:stats' && staff.role === 'owner')) {
      await send(chat.id, await performStaffAction(staff, '/' + action.slice(5)));
    }
    return null;
  }
  if (!payload.message?.text) {
    await send(chat.id, 'فرمان‌های مدیریتی متنی هستند. /help');
    return null;
  }
  const result = await performStaffAction(staff, payload.message.text);
  await send(chat.id, result, /^\/start|^\/help/.test(payload.message.text) ? keyboard() : undefined);
  return null;
}
function respond(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
  });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data);
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      const error = Error('Payload too large');
      error.status = 413;
      throw error;
    }
  }
  try { return JSON.parse(body || '{}'); } catch {
    const error = Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}
function authFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('tma ')) return null;
  const user = verifyTelegramInitData(header.slice(4), config.token);
  return user ? staffFor(user.id, config.owners, config.agents) : null;
}
async function api(req, res, url) {
  const staff = authFromRequest(req);
  if (!staff || !(await ensureStaff(staff.telegramId))) return respond(res, 403, { error: 'Access denied' });
  if (url.pathname === '/api/me' && req.method === 'GET') return respond(res, 200, staff);
  const page = Math.max(1, Math.min(5, Number(url.searchParams.get('page')) || 1));
  if (url.pathname === '/api/conversations' && req.method === 'GET') {
    const status = ['open', 'resolved', 'pending', 'all'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'open';
    return respond(res, 200, await listConversations(staff, page, status));
  }
  if (url.pathname === '/api/agents' && req.method === 'GET' && staff.role === 'owner') return respond(res, 200, await cw.agents());
  if (url.pathname === '/api/contacts' && req.method === 'GET' && staff.role === 'owner') return respond(res, 200, await cw.contacts(page));
  const match = url.pathname.match(/^\/api\/conversations\/(\d+)(?:\/(messages|reply|note|close|open|assign))?$/);
  if (match) {
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id < 1) return respond(res, 400, { error: 'Invalid conversation ID' });
    const conversation = await conversationFor(staff, id);
    const action = match[2] || '';
    if (req.method === 'GET' && action === '') return respond(res, 200, conversation);
    if (req.method === 'GET' && action === 'messages') return respond(res, 200, await cw.messages(id));
    if (req.method === 'POST' && ['reply', 'note', 'close', 'open', 'assign'].includes(action)) {
      if (action === 'close' || action === 'open') return respond(res, 200, await cw.setStatus(id, action === 'close' ? 'resolved' : 'open'));
      const input = await readJson(req);
      if (action === 'assign') {
        if (staff.role !== 'owner') return respond(res, 403, { error: 'Owner only' });
        const agentId = Number(input.agentId);
        const value = await cw.agents();
        const records = Array.isArray(value) ? value : value.payload || [];
        if (!Number.isSafeInteger(agentId) || !records.some(x => Number(x.id) === agentId)) {
          return respond(res, 400, { error: 'Invalid agent' });
        }
        return respond(res, 200, await cw.assign(id, agentId));
      }
      const content = input?.content;
      if (typeof content !== 'string' || !content.trim() || content.length > 4000) {
        return respond(res, 400, { error: 'Content must be 1–4000 characters' });
      }
      return respond(res, 200, await cw.reply(id, content.trim(), action === 'note'));
    }
  }
  return respond(res, 404, { error: 'Not found' });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz' && req.method === 'GET') return respond(res, 200, { ok: true });
    if (url.pathname === '/telegram/webhook' && req.method === 'POST') {
      if (!secureEquals(req.headers['x-telegram-bot-api-secret-token'], config.webhookSecret)) {
        return respond(res, 403, { error: 'Forbidden' });
      }
      const result = await incomingTelegram(await readJson(req));
      return respond(res, 200, result || { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method === 'GET' && (url.pathname === '/app' || url.pathname === '/')) {
      return respond(res, 200, await readFile(join(here, '../public/index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/app.js') {
      return respond(res, 200, await readFile(join(here, '../public/app.js'), 'utf8'), 'application/javascript; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/app.css') {
      return respond(res, 200, await readFile(join(here, '../public/app.css'), 'utf8'), 'text/css; charset=utf-8');
    }
    return respond(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = [400, 403, 404, 413].includes(error.status) ? error.status : 503;
    // Avoid leaking upstream response bodies, bot token, and credentials to clients/logs.
    console.error('Request failed:', error.message.replaceAll(config.token, '[redacted]'));
    return respond(res, status, { error: status === 503 ? 'Service unavailable' : error.message });
  }
});
server.listen(config.port, '0.0.0.0', async () => {
  console.log('Unified Telegram adapter listening on port', config.port);
  if (config.register) {
    try {
      await telegram('setWebhook', {
        url: config.publicUrl + '/telegram/webhook',
        secret_token: config.webhookSecret,
        allowed_updates: ['message', 'edited_message', 'callback_query', 'business_message', 'edited_business_message']
      });
      console.log('Telegram webhook registered');
    } catch (error) {
      console.error('Webhook registration failed:', error.message.replaceAll(config.token, '[redacted]'));
    }
  }
});
