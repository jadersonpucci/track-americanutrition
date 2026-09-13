// Node "Parse Webhook Meta" do workflow "[Serena Social] Comentarios IG FB" (n8n 9KXACZ6PK3Vr7kHZ).
// Validacao e parsing do webhook da Meta. Aceita tambem o payload sintetico da fila
// ([Serena Social] Fila e Resumo), que reenvia comentarios do banco no mesmo formato com _origem='banco'.
const body = $input.item.json.body;
if (!body || !body.entry || !body.entry[0]) { return []; }
const entry = body.entry[0];
const origem = body._origem === 'banco' ? 'banco' : 'webhook';
if (body.object === 'page' && entry.changes) {
  const change = entry.changes[0];
  if (change.field === 'feed' && change.value && change.value.item === 'comment' && change.value.verb === 'add') {
    const post = change.value.post || {};
    const parent = String(change.value.parent_id || '');
    return [{ json: {
      plataforma: 'facebook',
      comment_id: change.value.comment_id,
      post_id: change.value.post_id,
      // parent_id igual ao post = comentario de primeiro nivel; diferente = resposta a outro comentario
      parent_id: (parent && parent !== String(change.value.post_id || '')) ? parent : '',
      from_id: change.value.from && change.value.from.id ? change.value.from.id : '',
      from_name: change.value.from && change.value.from.name ? change.value.from.name : 'usuario',
      message: (change.value.message || '').substring(0, 500),
      timestamp: change.value.created_time,
      is_published: (typeof post.is_published === 'boolean') ? post.is_published : null,
      permalink_url: post.permalink_url || '',
      origem: origem
    }}];
  }
}
if (body.object === 'instagram' && entry.changes) {
  const change = entry.changes[0];
  if (change.field === 'comments' && change.value) {
    return [{ json: {
      plataforma: 'instagram',
      comment_id: change.value.id,
      post_id: change.value.media && change.value.media.id ? change.value.media.id : '',
      media_id: change.value.media && change.value.media.id ? change.value.media.id : '',
      parent_id: String(change.value.parent_id || ''),
      from_id: change.value.from && change.value.from.id ? change.value.from.id : '',
      from_name: change.value.from && change.value.from.username ? change.value.from.username : 'usuario',
      message: (change.value.text || '').substring(0, 500),
      timestamp: change.value.created_time || new Date().toISOString(),
      is_published: null,
      permalink_url: '',
      origem: origem
    }}];
  }
}
return [];
