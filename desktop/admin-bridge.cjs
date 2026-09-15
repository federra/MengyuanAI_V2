// oxlint-disable typescript/no-require-imports
async function adminCommand(auth, authorize, action, input = {}) {
  const user = await authorize();
  if (user.role !== 'super_admin') throw Error('FORBIDDEN');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('INVALID_INPUT');
  const routes = {
    overview: '/admin/overview',
    users: '/admin/users',
    logs: '/admin/audit-logs',
  };
  if (Object.hasOwn(routes, action)) {
    const query = new URLSearchParams();
    for (const key of [
      'q',
      'status',
      'action',
      'from',
      'to',
      'page',
      'pageSize',
      'snapshot',
    ]) {
      if (
        input[key] !== undefined &&
        typeof input[key] !== 'string' &&
        typeof input[key] !== 'number'
      )
        throw Error('INVALID_INPUT');
      if (input[key] !== undefined && input[key] !== '')
        query.set(key, String(input[key]));
    }
    return auth.call(routes[action] + '?' + query);
  }
  if (action === 'create')
    return auth.call('/admin/users', {
      account: input.account,
      key: input.key,
      note: input.note,
      expires_at: input.expires_at,
      reason: input.reason,
    });
  if (
    !['usage', 'expiry', 'ban', 'restore'].includes(action) ||
    typeof input.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(input.id)
  )
    throw Error('INVALID_INPUT');
  const path = '/admin/users/' + input.id;
  if (action === 'usage') {
    const query = new URLSearchParams();
    for (const key of ['from', 'to', 'page', 'pageSize'])
      if (input[key] !== undefined && input[key] !== '')
        query.set(key, String(input[key]));
    return auth.call(path + '/usage?' + query);
  }
  return auth.call(
    path + '/' + (action === 'expiry' ? 'authorization' : action),
    {
      revision: input.revision,
      reason: input.reason,
      ...(action === 'expiry' ? { expires_at: input.expires_at } : {}),
    },
  );
}
module.exports = { adminCommand };
