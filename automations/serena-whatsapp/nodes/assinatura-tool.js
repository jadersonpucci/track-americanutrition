// Node "Gerenciar" do workflow "[Serena Tool] Assinatura" (webhook POST /webhook/serena-assinatura).
// Chaves reais so no n8n.
//
// A Serena chama com acao consultar | pausar | cancelar | reativar | trocar. O Core injeta telefone, email e
// contato_id: a ferramenta acha a assinatura sozinha, a Serena nunca pede dado ao cliente para isso.
// Pausar e cancelar exigem confirmado=true: e a segunda confirmacao que o Jaderson pediu em 13/09/2026
// (caso Carlos M., renovacao de assinatura que ele nao lembrava de ter feito). Sem confirmado, a
// ferramenta devolve erro pedindo a confirmacao explicita, e nada muda no banco.
const body = $input.first().json.body || $input.first().json;
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const TG = 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage';
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (q) => { const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); return Array.isArray(r) ? r : []; };
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 500) + "'");
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brlc = (c) => 'R$ ' + (Number(c || 0) / 100).toFixed(2).replace('.', ',');
const dt = (v) => { const s = String(v || '').slice(0, 10); return s ? s.split('-').reverse().join('/') : ''; };

// TROCAR (15/09/2026): troca ou upgrade do item da assinatura, mantendo o desconto de assinante. Caso Luzia
// (14 99650-5597): queria passar do 90 caps para o Plus 180 e a Serena so sabia cancelar; cancelou e perdeu o
// desconto. Agora a Serena chama {acao:'trocar', variant_id|itens_str, confirmado}. Sem confirmado a
// ferramenta devolve a proposta (itens novos, valor novo com o desconto, proximo ciclo) para a Serena
// apresentar; com confirmado troca items/shopify_items/valores e, se estava cancelada ou pausada, reativa.
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const cacheVar = {};
async function variante(vid) {
  vid = String(vid || '').replace(/\D/g, '');
  if (!vid) return null;
  if (cacheVar[vid]) return cacheVar[vid];
  const r = await req({ method: 'POST', url: SHOP, json: true, timeout: 20000, body: { acao: 'consultar', endpoint: 'variants/' + vid + '.json' } });
  const v = r && r.ok && r.dados && r.dados.variant;
  if (!v) return null;
  const p = await req({ method: 'POST', url: SHOP, json: true, timeout: 20000, body: { acao: 'consultar', endpoint: 'products/' + v.product_id + '.json', params: { fields: 'id,title,status' } } });
  const prod = p && p.ok && p.dados && p.dados.product;
  const vt = String(v.title || '').replace(/^Tradicionais \/ /, '');
  const titulo = String((prod && prod.title) || 'Produto') + (vt && vt !== 'Default Title' ? ' ' + vt : '');
  const semEstoque = String(v.inventory_management || '') === 'shopify' && String(v.inventory_policy || 'deny') === 'deny' && Number(v.inventory_quantity || 0) <= 0;
  const out = { variant_id: String(v.id), titulo: titulo, preco: Number(v.price || 0), estoque: Number(v.inventory_quantity || 0), sem_estoque: semEstoque, ativo: !prod || String(prod.status || 'active') === 'active' };
  cacheVar[vid] = out;
  return out;
}
const parseItens = () => {
  let lista = [];
  if (Array.isArray(body.itens)) lista = body.itens.map((i) => ({ variant_id: String(i.variant_id || '').replace(/\D/g, ''), quantity: Math.max(1, parseInt(i.quantity || i.quantidade || 1, 10) || 1) }));
  else if (body.itens_str) lista = String(body.itens_str).split(',').map((par) => { const [vid, q] = par.split(':'); return { variant_id: String(vid || '').replace(/\D/g, ''), quantity: Math.max(1, parseInt(q || '1', 10) || 1) }; });
  else if (body.variant_id) lista = [{ variant_id: String(body.variant_id).replace(/\D/g, ''), quantity: Math.max(1, parseInt(body.quantidade || body.quantity || 1, 10) || 1) }];
  return lista.filter((i) => i.variant_id);
};

const acao = String(body.acao || 'consultar').toLowerCase().trim();
const tel = String(body.telefone || '').replace(/\D/g, '');
const email = String(body.email || '').trim().toLowerCase();
const motivo = String(body.motivo || '').slice(0, 200);
const confirmado = body.confirmado === true || /^(true|1|sim)$/i.test(String(body.confirmado || ''));
if (['consultar', 'pausar', 'cancelar', 'reativar', 'trocar'].indexOf(acao) === -1) return [{ json: { sucesso: false, resultado: 'acao invalida: use consultar, pausar, cancelar, reativar ou trocar' } }];
if (!tel && !email) return [{ json: { sucesso: false, resultado: 'Nao identifiquei o cliente (sem telefone nem email).' } }];

// telefone tolerante: DDD + ultimos 8 digitos, com ou sem o 55 e com ou sem o 9
const semPais = (d) => (d.length >= 12 && d.slice(0, 2) === '55') ? d.slice(2) : d;
const chave = (d) => { const x = semPais(String(d || '').replace(/\D/g, '')); return x.length >= 10 ? (x.slice(0, 2) + x.slice(-8)) : ''; };
const kTel = chave(tel);
const conds = [];
if (kTel) conds.push("right(regexp_replace(coalesce(whatsapp,''), '\\D', '', 'g'), 8) = " + E(kTel.slice(-8)));
if (email) conds.push('lower(email) = ' + E(email));
const rows = await sql("select id, nome, whatsapp, email, status, metodo, items, valor_centavos, valor_cheio_centavos, desconto_pct, ciclo_dias, proximo_ciclo, renovacoes, card_brand, card_last4, criado_em, cancelar_no_fim, atualizado_em, (select jsonb_agg(jsonb_build_object('ciclo', c.ciclo_ref, 'status', c.status, 'valor_centavos', c.valor_centavos) order by c.ciclo_ref desc) from (select * from assinatura_cobrancas cc where cc.assinatura_id = a.id order by cc.ciclo_ref desc limit 4) c) as cobrancas from assinaturas a where " + conds.join(' or ') + " order by (status = 'ativa') desc, (status in ('pausada','inadimplente')) desc, atualizado_em desc limit 5");
const cand = rows.filter((r) => !kTel || chave(r.whatsapp) === kTel || (email && String(r.email || '').toLowerCase() === email));
const a = cand[0] || null;
if (!a) return [{ json: { sucesso: false, encontrado: false, resultado: 'Nenhuma assinatura encontrada para este cliente.', nota_serena: 'Este cliente NAO tem assinatura recorrente. Se ele fala de cobranca repetida, verifique os pedidos e escale para a equipe.' } }];

let itens = '';
let itensAtuais = [];
try { itensAtuais = Array.isArray(a.items) ? a.items : JSON.parse(a.items || '[]'); } catch (e) { itensAtuais = []; }
// items gravados pelo checkout nao tem title (so price, quantity, variant_id): busca o nome na Shopify
const partes = [];
for (const i of itensAtuais.slice(0, 6)) {
  let nome = String(i.title || '').replace(' - Tradicionais', '');
  if (!nome) { const v = await variante(i.variant_id); nome = v ? v.titulo : ('item ' + i.variant_id); }
  partes.push((i.quantity || 1) + 'x ' + nome);
}
itens = partes.join(', ');
const cobr = (Array.isArray(a.cobrancas) ? a.cobrancas : []).map((c) => dt(c.ciclo) + ' ' + c.status + ' ' + brlc(c.valor_centavos)).join('; ');
const pagamento = a.metodo === 'pix' ? 'por PIX' : ('no cartao ' + String(a.card_brand || '').toUpperCase() + ' final ' + (a.card_last4 || ''));
const resumo = (t) => ({ id: a.id, status: t || a.status, itens: itens, valor: brlc(a.valor_centavos), valor_cheio: a.valor_cheio_centavos ? brlc(a.valor_cheio_centavos) : null, desconto_pct: a.desconto_pct, ciclo_dias: a.ciclo_dias, proximo_ciclo: dt(a.proximo_ciclo), renovacoes: a.renovacoes, pagamento: pagamento, criada_em: dt(a.criado_em), cobrancas: cobr });

async function telegram(titulo, extra) {
  await req({ method: 'POST', url: TG, json: true, timeout: 15000, body: { chat_id: '-1003766435449', message_thread_id: 98, parse_mode: 'HTML', disable_web_page_preview: true,
    text: titulo + '\n\n\u{1F464} ' + esc(a.nome || '') + (a.whatsapp ? ' · wa.me/' + esc(String(a.whatsapp).replace(/\D/g, '').replace(/^(?!55)/, '55')) : '') + '\n\u{1F4E6} ' + esc(itens) + ' · ' + esc(brlc(a.valor_centavos)) + ' a cada ' + (a.ciclo_dias || 30) + ' dias ' + esc(pagamento) + '\n\u{1F5D3} Proximo ciclo era ' + esc(dt(a.proximo_ciclo)) + ' · renovacoes: ' + (a.renovacoes || 0) + (motivo ? '\n\u{1F4DD} ' + esc(motivo) : '') + (extra ? '\n\n' + extra : '') } });
}

if (acao === 'consultar') {
  return [{ json: { sucesso: true, encontrado: true, assinatura: resumo(), resultado: 'Assinatura ' + a.status + ': ' + itens + ', ' + brlc(a.valor_centavos) + ' a cada ' + (a.ciclo_dias || 30) + ' dias ' + pagamento + ', feita em ' + dt(a.criado_em) + (a.status === 'ativa' ? ', proxima renovacao ' + dt(a.proximo_ciclo) : '') + '. Cobrancas: ' + (cobr || 'nenhuma') + '.' } }];
}
if (acao === 'trocar') {
  const pedidos = parseItens();
  if (!pedidos.length) return [{ json: { sucesso: false, resultado: 'Informe o item novo: variant_id (e quantidade) ou itens_str no formato "variant_id:qtd,variant_id:qtd".' } }];
  const novos = [];
  for (const it of pedidos) {
    const v = await variante(it.variant_id);
    if (!v) return [{ json: { sucesso: false, resultado: 'Nao encontrei o produto ' + it.variant_id + ' na loja. Confira o variant_id com consultar_produto.' } }];
    if (!v.ativo) return [{ json: { sucesso: false, resultado: v.titulo + ' nao esta mais a venda.', nota_serena: 'Ofereca outra versao ou tamanho equivalente.' } }];
    if (v.sem_estoque) return [{ json: { sucesso: false, sem_estoque: true, item: v.titulo, resultado: v.titulo + ' esta sem estoque agora; nao da para colocar na assinatura.', nota_serena: 'Diga que esse tamanho esta sem estoque no momento e ofereca montar a assinatura com a quantidade equivalente de outro tamanho (ex.: 2x 90 capsulas no lugar do 180), mantendo o desconto. Nao cancele a assinatura por causa disso.' } }];
    novos.push({ price: v.preco, quantity: it.quantity, variant_id: v.variant_id, titulo: v.titulo });
  }
  const desc = Number(a.desconto_pct || 10) || 10;
  const cheio = Math.round(novos.reduce((t, i) => t + i.price * i.quantity, 0) * 100);
  const novo = Math.round(cheio * (100 - desc) / 100);
  const itensNovos = novos.map((i) => i.quantity + 'x ' + i.titulo).join(', ');
  const reativa = a.status !== 'ativa' || a.cancelar_no_fim === true;
  const proposta = { itens_novos: itensNovos, valor_novo: brlc(novo), valor_cheio_novo: brlc(cheio), valor_atual: brlc(a.valor_centavos), desconto_pct: desc, proximo_ciclo: dt(a.proximo_ciclo), reativa: reativa, frete: cheio >= 25000 ? 'gratis' : 'cobrado na renovacao' };
  if (!confirmado) {
    return [{ json: { sucesso: false, precisa_confirmacao: true, assinatura: resumo(), proposta: proposta, resultado: 'Proposta de troca: a assinatura passaria de ' + itens + ' (' + brlc(a.valor_centavos) + ') para ' + itensNovos + ' por ' + brlc(novo) + ' a cada ' + (a.ciclo_dias || 30) + ' dias (de ' + brlc(cheio) + ', ' + desc + '% de assinante)' + (reativa ? ', e a assinatura voltaria a ficar ativa' : '') + '. Explique isso ao cliente e pergunte se confirma. Repita com confirmado=true SOMENTE depois de um sim explicito.' } }];
  }
  const EJ = (o) => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  const gravar = novos.map((i) => ({ price: i.price, quantity: i.quantity, variant_id: i.variant_id }));
  await sql('update assinaturas set items = ' + EJ(gravar) + ', shopify_items = ' + EJ(gravar) + ', valor_cheio_centavos = ' + cheio + ', valor_centavos = ' + novo + (reativa ? ", status = 'ativa', cancelar_no_fim = false, tentativas = 0, proximo_ciclo = greatest(coalesce(proximo_ciclo, current_date), current_date + 1)" : '') + ', atualizado_em = now() where id = ' + E(a.id));
  const r3 = await sql('select proximo_ciclo from assinaturas where id = ' + E(a.id));
  const prox3 = r3[0] ? dt(r3[0].proximo_ciclo) : dt(a.proximo_ciclo);
  await telegram('\u{1F501} <b>ASSINATURA TROCADA pela Serena</b>', 'Novo plano: ' + esc(itensNovos) + ' \u00b7 ' + esc(brlc(novo)) + ' (de ' + esc(brlc(cheio)) + ', -' + desc + '%)' + (reativa ? '\nReativada. ' : '\n') + 'Proximo ciclo: ' + esc(prox3));
  return [{ json: { sucesso: true, assinatura: Object.assign(resumo('ativa'), { itens: itensNovos, valor: brlc(novo), valor_cheio: brlc(cheio), proximo_ciclo: prox3 }), resultado: 'Assinatura trocada para ' + itensNovos + ': ' + brlc(novo) + ' a cada ' + (a.ciclo_dias || 30) + ' dias (' + desc + '% de assinante ja aplicado)' + (reativa ? ', reativada' : '') + '. Proxima renovacao: ' + prox3 + '.', nota_serena: 'Confirme ao cliente o novo item, o valor com desconto e a data da proxima renovacao. Se ele quiser o item novo ja agora, gere PIX ou boleto com desconto_pct=' + desc + ' e cupom ASSINANTE.' } }];
}
if (!confirmado) {
  return [{ json: { sucesso: false, precisa_confirmacao: true, assinatura: resumo(), resultado: 'Antes de ' + acao + ', explique ao cliente o que muda e pergunte se ele confirma. Repita a chamada com confirmado=true SOMENTE depois de um sim explicito.' } }];
}
if (acao === 'cancelar') {
  if (a.status === 'cancelada') return [{ json: { sucesso: true, assinatura: resumo(), resultado: 'A assinatura ja estava cancelada.' } }];
  await sql("update assinaturas set status = 'cancelada', cancelar_no_fim = true, atualizado_em = now() where id = " + E(a.id));
  await telegram('\u{1F6D1} <b>ASSINATURA CANCELADA pela Serena</b>', 'Se a ultima renovacao foi paga e o cliente contestou, o estorno e manual: pedido na Shopify (tag ASSINATURA) e POST /webhook/pagarme-estorno.');
  return [{ json: { sucesso: true, assinatura: resumo('cancelada'), resultado: 'Assinatura cancelada. Nenhuma renovacao sera cobrada daqui em diante.', nota_serena: 'Confirme ao cliente que a assinatura foi cancelada e que nada mais sera cobrado. Ele perde o desconto de assinante nas proximas compras. Se ele contestou uma renovacao JA PAGA, chame escalar_humano com motivo "estorno de renovacao de assinatura, pedido <numero>" e diga que a equipe confirma o estorno por aqui.' } }];
}
if (acao === 'pausar') {
  if (a.status === 'pausada') return [{ json: { sucesso: true, assinatura: resumo(), resultado: 'A assinatura ja estava pausada.' } }];
  await sql("update assinaturas set status = 'pausada', atualizado_em = now() where id = " + E(a.id));
  await telegram('\u{23F8} <b>ASSINATURA PAUSADA pela Serena</b>', '');
  return [{ json: { sucesso: true, assinatura: resumo('pausada'), resultado: 'Assinatura pausada. Nada sera cobrado ate o cliente pedir para reativar.', nota_serena: 'Diga ao cliente que a assinatura esta pausada, que nada sera cobrado e que e so avisar por aqui para reativar (o desconto de assinante continua valendo).' } }];
}
// reativar
if (a.status === 'ativa' && !a.cancelar_no_fim) return [{ json: { sucesso: true, assinatura: resumo(), resultado: 'A assinatura ja esta ativa.' } }];
await sql("update assinaturas set status = 'ativa', cancelar_no_fim = false, tentativas = 0, proximo_ciclo = greatest(coalesce(proximo_ciclo, current_date), current_date + 1), atualizado_em = now() where id = " + E(a.id));
const r2 = await sql('select proximo_ciclo from assinaturas where id = ' + E(a.id));
const prox = r2[0] ? dt(r2[0].proximo_ciclo) : '';
await telegram('\u{25B6} <b>ASSINATURA REATIVADA pela Serena</b>', prox ? 'Proximo ciclo: ' + esc(prox) : '');
return [{ json: { sucesso: true, assinatura: Object.assign(resumo('ativa'), { proximo_ciclo: prox }), resultado: 'Assinatura reativada. Proxima renovacao: ' + prox + '.', nota_serena: 'Diga ao cliente que a assinatura voltou a valer e a data da proxima renovacao.' } }];
