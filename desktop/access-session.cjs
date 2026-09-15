const BASE = 'https://121.199.40.214/access';
class AccessSession {
  constructor({ request = fetch, onState = () => {} } = {}) {
    this.request = request;
    this.onState = onState;
    this.token = '';
    this.state = { authorized: false, code: 'UNAUTHENTICATED' };
    this.generation = 0;
    this.pending = null;
  }
  snapshot() {
    return { ...this.state };
  }
  publish(state) {
    this.state = state;
    this.onState(this.snapshot());
  }
  async call(route, body, token = this.token) {
    try {
      const response = await this.request(BASE + route, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(Error(data.error?.code || 'SERVICE_UNAVAILABLE'), {
          accessCode: data.error?.code || 'SERVICE_UNAVAILABLE',
        });
      return data;
    } catch (error) {
      throw Error(error.accessCode || 'CONNECTION_FAILED');
    }
  }
  async login(account, key, expectedUserId) {
    if (this.loggingIn) throw Error('BUSY');
    this.loggingIn = true;
    const epoch = ++this.generation;
    this.pending = null;
    try {
      const data = await this.call(
        '/auth/login',
        { account, key, client_type: 'desktop' },
        '',
      );
      if (epoch !== this.generation) {
        void this.call('/auth/logout', {}, data.token).catch(() => {});
        throw Error('UNAUTHENTICATED');
      }
      if (expectedUserId && data.user?.id !== expectedUserId) {
        await this.call('/auth/logout', {}, data.token).catch(() => {});
        throw Error('SWITCH_RESTART_REQUIRED');
      }
      this.token = data.token;
      this.accept(data);
      return this.snapshot();
    } finally {
      this.loggingIn = false;
    }
  }
  accept(data) {
    if (!data.user?.id || !['member', 'super_admin'].includes(data.user.role))
      throw Error('SERVICE_UNAVAILABLE');
    this.publish({
      authorized: true,
      user: data.user,
      serverTime: data.server_time,
      sessionExpiresAt: data.session_expires_at,
    });
  }
  async authorize() {
    if (!this.token) throw Error('UNAUTHENTICATED');
    if (this.pending) return this.pending;
    const epoch = this.generation;
    const run = (async () => {
      try {
        const data = await this.call('/auth/me');
        if (epoch !== this.generation) throw Error('UNAUTHENTICATED');
        this.accept(data);
        return data.user;
      } catch (error) {
        if (epoch === this.generation)
          this.publish({ authorized: false, code: error.message });
        throw error;
      }
    })();
    this.pending = run;
    try {
      return await run;
    } finally {
      if (this.pending === run) this.pending = null;
    }
  }
  async logout() {
    const token = this.token;
    this.token = '';
    this.generation++;
    this.pending = null;
    this.publish({ authorized: false, code: 'UNAUTHENTICATED' });
    if (token) await this.call('/auth/logout', {}, token).catch(() => {});
  }
}
module.exports = { AccessSession, BASE };
