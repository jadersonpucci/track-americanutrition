// Trecho do no 'Marcar Recuperados' do workflow 'AN - Marcar Pedidos Recuperados' (5Dli6Wo8Qp8ECFtp), cron 15 min.
// ETAPA B (set/2026): rede de seguranca da tag WPP. O no completo carrega a chave do Supabase e fica so no n8n.

// 2b) ETAPA B (set/2026): tag de canal WPP. A Confirmacao Pago ja aplica WPP/SERENA-IG/SERENA-MSG pelo ref do link;
// aqui e a rede de seguranca: pedido com aff_ref SERENA (link da Serena) ou whatsapp (link manual) sem nenhuma tag de canal ganha WPP.
const TAGS_CANAL = ['wpp', 'serena-ig', 'serena-msg'];
let marcadosB = 0;
orders.forEach(function (o) {
  const na = Array.isArray(o.note_attributes) ? o.note_attributes : [];
  const aff = na.filter(function (a) { return a && String(a.name) === 'aff_ref'; }).map(function (a) { return norm(a.value); })[0] || '';
  if (aff !== 'serena' && aff !== 'whatsapp') { return; }
  if (TAGS_CANAL.some(function (t) { return temTag(o, t); })) { return; }
  addTag(o.id, 'WPP');
  marcadosB++;
});
