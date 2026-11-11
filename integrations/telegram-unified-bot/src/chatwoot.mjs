export class Chatwoot {
  constructor(baseUrl, accountId, apiToken, botToken) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.prefix = '/api/v1/accounts/' + encodeURIComponent(accountId);
    this.v2Prefix = '/api/v2/accounts/' + encodeURIComponent(accountId);
    this.apiToken = apiToken;
    this.botToken = botToken;
  }

  async request(method, path, data) {
    const response = await fetch(this.baseUrl + (path.startsWith('/api/') ? path : this.prefix + path), {
      method,
      headers: { api_access_token: this.apiToken, ...(data ? { 'content-type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(12000)
    });
    const body = await response.text();
    let parsed;
    try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { error: 'Invalid upstream JSON' }; }
    if (!response.ok) {
      const error = new Error('Chatwoot API returned ' + response.status);
      error.status = response.status;
      throw error;
    }
    return parsed;
  }

  conversations(page = 1, status = 'open') {
    return this.request('GET', '/conversations?assignee_type=all&status=' + encodeURIComponent(status) + '&page=' + page);
  }
  conversation(id) { return this.request('GET', '/conversations/' + Number(id)); }
  messages(id) { return this.request('GET', '/conversations/' + Number(id) + '/messages'); }
  reply(id, content, isPrivate = false) {
    return this.request('POST', '/conversations/' + Number(id) + '/messages',
      { content, message_type: 'outgoing', private: isPrivate });
  }
  setStatus(id, status) {
    return this.request('POST', '/conversations/' + Number(id) + '/toggle_status', { status });
  }
  assign(id, agentId) {
    return this.request('POST', '/conversations/' + Number(id) + '/assignments', { assignee_id: Number(agentId) });
  }
  agents() { return this.request('GET', '/agents'); }
  profile() { return this.request('GET', '/api/v1/profile'); }
  contacts(page = 1) { return this.request('GET', '/contacts?page=' + page); }
  reportWindow(days = 30) {
    const until = Math.floor(Date.now() / 1000);
    return { since: until - days * 86400, until };
  }
  reportSummary(days = 30) {
    const { since, until } = this.reportWindow(days);
    return this.request('GET', this.v2Prefix + '/reports/summary?type=account&since=' + since + '&until=' + until);
  }
  agentSummary(days = 30) {
    const { since, until } = this.reportWindow(days);
    return this.request('GET', this.v2Prefix + '/summary_reports/agent?since=' + since + '&until=' + until);
  }

  async forwardTelegramUpdate(payload) {
    // Chatwoot owns Telegram message ingestion and outgoing messages. No duplicate CRM state is created here.
    const response = await fetch(this.baseUrl + '/webhooks/telegram/' + encodeURIComponent(this.botToken), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Chatwoot Telegram webhook failed: ' + response.status);
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : null;
  }
}
