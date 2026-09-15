// Only a disposable loopback bootstrap page can ask for automatic pairing.
if (location.protocol === 'http:' && location.hostname === '127.0.0.1' && location.pathname === '/__director_connect') {
  const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
  const status = document.getElementById('director-connect-status');
  if (ticket && /^[a-f0-9]{64}$/.test(ticket)) {
    chrome.runtime.sendMessage({type: 'autoConnect', ticket}).then(result => {
      history.replaceState(null, '', location.pathname);
      if (status) status.textContent = result?.ok ? '已连接，正在打开豆包…' : result?.error || '连接失败，请返回工作台再次打开登录。';
    }).catch(() => {if (status) status.textContent = '插件连接中断，请返回工作台再次打开登录。';});
  } else if (status) status.textContent = '请从工作台点击“打开登录”，自动连接对应账号。';
}
