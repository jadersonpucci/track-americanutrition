// Node "Gerenciar" do workflow "[Serena Tool] Assinatura" (webhook POST /webhook/serena-assinatura).
// Chaves reais so no n8n.
//
// A Serena chama com acao consultar | pausar | cancelar | reativar. O Core injeta telefone, email e
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

const acao = String(body.acao || 'consultar').toLowerCase().trim();
const tel = String(body.telefone || '').replace(/\D/g, '');
const email = String(body.email || '').trim().toLowerCase();
const motivo = String(body.motivo || '').slice(0, 200);
const confirmado = body.confirmado === true || /^(true|1|sim)$/i.test(String(body.confirmado || ''));
if (['consultar', 'pausar', 'cancelar', 'reativar'].indexOf(acao) === -1) return [{ json: { sucesso: false, resultado: 'acao invalida: use consultar, pausar, cancelar ou reativar' } }];
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
try { itens = (Array.isArray(a.items) ? a.items : JSON.parse(a.items || '[]')).map((i) => (i.quantity || 1) + 'x ' + String(i.title || '').replace(' - Tradicionais', '')).join(', '); } catch (e) { itens = ''; }
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
