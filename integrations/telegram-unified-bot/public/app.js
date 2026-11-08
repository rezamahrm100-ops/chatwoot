const tg = window.Telegram?.WebApp;
const state = { tab: 'conversations', conversationId: null, role: null };
const el = id => document.getElementById(id);
const notice = message => { el('notice').textContent = message; };
const create = (tag, text, className = '') => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
function button(label, handler, className = '') {
  const b = create('button', label, className);
  b.addEventListener('click', handler);
  return b;
}
const initData = tg?.initData || '';
async function api(path, method = 'GET', body) {
  if (!initData) throw Error('لطفاً داشبورد را از داخل ربات تلگرام باز کنید.');
  const res = await fetch('/api' + path, {
    method,
    headers: { Authorization: 'tma ' + initData, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'خطا در ارتباط با سرور');
  return data;
}
async function task(work) {
  try { notice(''); await work(); } catch (error) { notice(error.message); }
}
function empty(message) {
  el('items').replaceChildren(create('p', message, 'meta'));
}
function conversationTitle(c) {
  return '#' + c.id + ' — ' + (c.meta?.sender?.name || c.meta?.sender?.phone_number || 'مشتری');
}
async function loadConversations() {
  const data = await api('/conversations?status=' + encodeURIComponent(el('status').value));
  el('items').replaceChildren();
  if (!data.conversations.length) return empty('گفتگویی در این صفحه یافت نشد.');
  for (const c of data.conversations) {
    const card = create('article', undefined, 'card');
    card.append(create('h3', conversationTitle(c)));
    card.append(create('div', 'وضعیت: ' + (c.status || '—') + ' | پشتیبان: ' + (c.meta?.assignee?.name || 'تعیین نشده'), 'meta'));
    const preview = c.messages?.at(-1)?.content;
    if (preview) card.append(create('p', preview.slice(0, 160)));
    card.append(button('بازکردن گفتگو', () => task(() => openConversation(c.id)), 'primary'));
    el('items').append(card);
  }
}
async function openConversation(id) {
  const c = await api('/conversations/' + id);
  state.conversationId = id;
  el('detail').hidden = false;
  const detail = el('detail');
  detail.replaceChildren(create('h2', conversationTitle(c)));
  const messages = await api('/conversations/' + id + '/messages');
  const list = Array.isArray(messages?.payload) ? messages.payload : (Array.isArray(messages) ? messages : []);
  const log = create('div');
  for (const m of list.slice(-30)) {
    const role = m.private ? 'private' : (m.message_type === 1 || m.message_type === 'outgoing' ? 'mine' : '');
    log.append(create('div', (m.private ? '[یادداشت داخلی] ' : '') + (m.content || '[فایل/پیوست]'), 'message ' + role));
  }
  detail.append(log);
  const input = create('textarea');
  input.placeholder = 'متن پاسخ یا یادداشت داخلی';
  input.maxLength = 4000;
  detail.append(input);
  const actions = create('div', undefined, 'actions');
  actions.append(button('ارسال پاسخ', () => task(async () => {
    await api('/conversations/' + id + '/reply', 'POST', { content: input.value });
    input.value = '';
    await openConversation(id);
  }), 'primary'));
  actions.append(button('ثبت یادداشت', () => task(async () => {
    await api('/conversations/' + id + '/note', 'POST', { content: input.value });
    input.value = '';
    await openConversation(id);
  })));
  actions.append(button(c.status === 'resolved' ? 'بازگشایی' : 'حل‌شده', () => task(async () => {
    await api('/conversations/' + id + (c.status === 'resolved' ? '/open' : '/close'), 'POST');
    await openConversation(id);
    await loadConversations();
  })));
  if (state.role === 'owner') {
    const agentId = create('input');
    agentId.type = 'number';
    agentId.min = '1';
    agentId.placeholder = 'شناسهٔ پشتیبان';
    actions.append(agentId);
    actions.append(button('ارجاع', () => task(async () => {
      await api('/conversations/' + id + '/assign', 'POST', { agentId: Number(agentId.value) });
      await openConversation(id);
    })));
  }
  actions.append(button('بستن پنجره', () => { detail.hidden = true; state.conversationId = null; }));
  detail.append(actions);
  detail.scrollIntoView({ behavior: 'smooth' });
}
async function loadCustomers() {
  const data = await api('/contacts');
  const items = data.payload || data.data?.payload || [];
  el('items').replaceChildren();
  for (const item of items) {
    const card = create('article', undefined, 'card');
    card.append(create('h3', (item.name || 'مشتری') + ' #' + item.id));
    card.append(create('p', item.email || item.phone_number || 'اطلاعات تماس ثبت نشده'));
    el('items').append(card);
  }
  if (!items.length) empty('موردی در صفحهٔ نخست یافت نشد.');
}
async function loadTeam() {
  const response = await api('/agents');
  const agents = Array.isArray(response) ? response : response.payload || [];
  el('items').replaceChildren();
  for (const item of agents) {
    const card = create('article', undefined, 'card');
    card.append(create('h3', item.name || 'پشتیبان'));
    card.append(create('p', 'شناسه: ' + item.id + ' | ' + (item.role || 'agent'), 'meta'));
    el('items').append(card);
  }
  if (!agents.length) empty('پشتیبانی ثبت نشده است.');
}
async function loadTab() {
  el('detail').hidden = true;
  el('toolbar').hidden = state.tab !== 'conversations';
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.tab === state.tab));
  }
  if (state.tab === 'conversations') return loadConversations();
  if (state.tab === 'customers') return loadCustomers();
  return loadTeam();
}
async function initialize() {
  tg?.ready();
  tg?.expand();
  if (!initData) return notice('این صفحه باید از داخل تلگرام و از طریق دکمهٔ ربات باز شود.');
  await task(async () => {
    const me = await api('/me');
    state.role = me.role;
    el('who').textContent = me.role === 'owner' ? 'دسترسی مالک' : 'دسترسی پشتیبان — گفتگوهای ارجاع‌شده';
    if (me.role !== 'owner') {
      for (const tab of document.querySelectorAll('[data-tab]:not([data-tab="conversations"])')) tab.hidden = true;
    }
    await loadTab();
  });
}
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => task(async () => { state.tab = tab.dataset.tab; await loadTab(); }));
}
el('reload').addEventListener('click', () => task(loadTab));
el('status').addEventListener('change', () => task(loadConversations));
initialize();
