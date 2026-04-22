// ── 所有 API 调用走本地服务器（app.js 代理）──────────────────
async function apiSearch(q, source = 'all') {
  const params = new URLSearchParams({ q, limit: 20 });
  if (source !== 'all') params.set('source', source);
  const r = await fetch(`/api/search?${params}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function apiSongUrl(id, source, name, artist) {
  const params = new URLSearchParams({ id, source: source || 'qq' });
  if (name) params.set('name', name);
  if (artist) params.set('artist', artist);
  const r = await fetch(`/api/song/url?${params}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
