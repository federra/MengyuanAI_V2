// Chrome's local pipe transport: no listening debug port and no HTTP credentials.
class ChromePipe {
  constructor(child, timeout = 15000) {
    this.child = child; this.timeout = timeout; this.pending = new Map(); this.sequence = 0; this.buffer = ''; this.closed = false;
    const fail = () => this.disconnect(new Error('账号浏览器已关闭或被旧窗口占用，请关闭该账号的旧窗口后重新打开登录。'));
    child.once('error', fail); child.once('exit', fail);
    child.stdio[3].on('error', fail); child.stdio[4].on('error', fail); child.stdio[4].once('end', fail);
    child.stdio[4].setEncoding('utf8');
    child.stdio[4].on('data', chunk => {
      this.buffer += chunk;
      let end;
      while ((end = this.buffer.indexOf('\0')) !== -1) {
        const raw = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        let message; try { message = JSON.parse(raw); } catch { continue; }
        const request = this.pending.get(message.id); if (!request) continue;
        this.pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message || 'Chrome 操作失败'));
        else request.resolve(message.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('账号浏览器连接已断开，请重新打开登录。'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Chrome 响应超时，请关闭该账号的旧窗口后重试；不会关闭其他账号窗口。')); }, this.timeout);
      this.pending.set(id, {resolve, reject, timer});
      this.child.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + '\0', error => { if (error) this.disconnect(error); });
    });
  }
  disconnect(error = new Error('浏览器连接已断开')) {
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }
}
module.exports = {ChromePipe};
