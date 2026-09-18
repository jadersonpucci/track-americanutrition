// Node "Reconferir e Responder" do workflow "Grupos | Samuel Responde" (n8n 0OwXSCNKh3zpvyFG).
// Chaves reais so no n8n.
//
// Roda 3 minutos depois da pergunta. Antes de falar, reconfere duas coisas: alguem da equipe ja
// respondeu nesse meio tempo? e as travas continuam dentro do limite? So entao monta a resposta,
// na voz do Samuel (primeira pessoa, curta, sem assinar como robo), cita a mensagem da pessoa e
// posta. Pedido que nao chegou vai em duas partes: no grupo o status sem dado pessoal, no privado
// o rastreio. Tudo fica em grupo_bot_log e a equipe ve no Telegram o que ele disse.
const d = $input.first().json || {};
const c = d.ctx || {};
const SK = 'SUPABASE_SERVICE_KEY';
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
const TG = 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage';
const TG_GRUPO = '-1003766435449';
const TG_TOPICO = 289;
const EQUIPE = ['5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555'];
const TETO_GRUPO_HORA = 2, TETO_GRUPO_DIA = 8, TETO_GERAL_DIA = 20;
const NL = String.fromCharCode(10);
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (q) => { const r = await req({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 25000 }); return Array.isArray(r) ? r : []; };
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 900) + "'");
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const encurtar = async (url) => { try { const s = await req({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/encurtar-url', headers: { 'Content-Type': 'application/json' }, body: { url: url }, json: true, timeout: 12000 }); return (s && s.shortLink && !s.error) ? s.shortLink : url; } catch (e) { return url; } };
const autor = d.autor || c.telefone || String(c.participant || '').split('@')[0];
const nome = String(c.push_name || '').trim().split(' ')[0].replace(/^~\s*/, '') || '';
const oi = nome ? ('Oi, ' + nome + '! ') : 'Oi! ';

async function log(acao, detalhe) {
  await sql('insert into grupo_bot_log (grupo_jid, autor, push_name, msg_id, texto, intencao, produto, acao, detalhe) values (' + E(c.jid) + ',' + E(autor) + ',' + E(c.push_name) + ',' + E(c.msg_id) + ',' + E(c.texto) + ',' + E(d.intencao) + ',' + E(d.produto) + ',' + E(acao) + ',' + E(detalhe) + ')');
}
async function telegram(t) { await req({ method: 'POST', url: TG, json: true, timeout: 15000, body: { chat_id: TG_GRUPO, message_thread_id: TG_TOPICO, parse_mode: 'HTML', disable_web_page_preview: true, text: t } }); }

// 1) A equipe respondeu nesses 3 minutos? (a) mensagem NOSSA no grupo depois da pergunta;
//    (b) mensagem de outro numero da equipe/admin gravada pelo Radar.
let equipeRespondeu = false;
try {
  const r = await req({ method: 'POST', url: EVO + '/chat/findMessages/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { where: {}, page: 1, offset: 100 }, json: true, timeout: 30000 });
  const recs = (r && r.messages && r.messages.records) || [];
  for (const m of recs) {
    const k = m.key || {};
    if (k.remoteJid !== c.jid) continue;
    if (Number(m.messageTimestamp || 0) <= Number(c.ts || 0)) continue;
    if (k.fromMe === true) { equipeRespondeu = true; break; }
    const ph = String(k.participantAlt || k.senderPn || '').split('@')[0].replace(/\D/g, '');
    if (ph && EQUIPE.indexOf(ph) !== -1) { equipeRespondeu = true; break; }
  }
} catch (e) { }
if (!equipeRespondeu) {
  const g = await sql("select 1 as x from grupo_mensagens where grupo_jid = " + E(c.jid) + " and criado_em > to_timestamp(" + Number(c.ts || 0) + ") and regexp_replace(coalesce(autor,''), '[^0-9]', '', 'g') in (" + EQUIPE.map((n) => "'" + n + "'").join(',') + ") limit 1");
  if (g.length) equipeRespondeu = true;
}
if (equipeRespondeu) { await log('bloqueada', 'equipe respondeu antes'); return [{ json: { ok: true, acao: 'bloqueada', motivo: 'equipe respondeu antes' } }]; }

// 2) Travas de novo: duas perguntas na mesma janela podem ter passado juntas pelo Decidir.
const t = await sql(
  "select (select count(*) from grupo_bot_log where grupo_jid = " + E(c.jid) + " and acao in ('respondida','reagida') and criado_em > now() - interval '1 hour')::int as gh, " +
  "(select count(*) from grupo_bot_log where grupo_jid = " + E(c.jid) + " and acao in ('respondida','reagida') and criado_em > now() - interval '24 hours')::int as gd, " +
  "(select count(*) from grupo_bot_log where acao in ('respondida','reagida') and criado_em > now() - interval '24 hours')::int as td"
);
const q = (t && t[0]) || {};
if (Number(q.gh || 0) >= TETO_GRUPO_HORA || Number(q.gd || 0) >= TETO_GRUPO_DIA || Number(q.td || 0) >= TETO_GERAL_DIA) { await log('bloqueada', 'teto atingido na reconferencia'); return [{ json: { ok: true, acao: 'bloqueada', motivo: 'teto' } }]; }

// chave da mensagem citada: telefone resolve melhor que @lid (licao de 11/09 com a revogacao)
const quotedKey = { id: c.msg_id, remoteJid: c.jid, fromMe: false, participant: (c.telefone ? (c.telefone + '@s.whatsapp.net') : c.participant) };

// 3) Reagir em vez de repetir
if (d.modo === 'reagir') {
  const r = await req({ method: 'POST', url: EVO + '/message/sendReaction/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { key: quotedKey, reaction: '\u{1F44D}' }, json: true, timeout: 30000 });
  await log(r ? 'reagida' : 'falha_ao_reagir', 'mesma duvida respondida ha pouco no grupo');
  return [{ json: { ok: !!r, acao: 'reagida' } }];
}

// 4) Montar a resposta
const CAT = {
  imunofosfo_90: { nome: 'ImunoFosfo 90 cápsulas', vid: '44436756234412', tipo: 'caps' },
  imunofosfo_180: { nome: 'ImunoFosfo Plus 180 cápsulas', vid: '46173112041644', tipo: 'caps' },
  imunofosfo_60: { nome: 'ImunoFosfo 60 cápsulas', vid: '44511284920492', tipo: 'caps' },
  imunofosfo_42: { nome: 'ImunoFosfo 42 cápsulas', vid: '45198538277036', tipo: 'caps' },
  imunofosfo_vegano: { nome: 'ImunoFosfo Vegano 90 cápsulas', vid: '44436756267180', tipo: 'caps' },
  imunofosfo_liquid: { nome: 'ImunoFosfo Liquid', vid: '45522481643692', tipo: 'liquid' },
  imunofosfo_kids: { nome: 'ImunoFosfo Kids', vid: '43736522653868', tipo: 'kids' },
  imunofosfo_diabetes: { nome: 'ImunoFosfo Diabetes', vid: '45117829218476', tipo: 'caps' },
  imunopet: { nome: 'ImunoPet Líquido', vid: '45211644625068', tipo: 'pet' },
  healing: { nome: 'ImunoFosfo Healing (spray)', vid: '43671038656684', tipo: 'spray' },
  omega3: { nome: 'Ômega 3 Ultra Pure', vid: '43843399712940', tipo: 'omega' }
};
const prod = CAT[d.produto] || CAT.imunofosfo_90;
async function preco(vid) {
  const p = await sql("select price from catalogo_precos where variant_id = " + E(vid) + " limit 1");
  if (p && p[0] && p[0].price != null) return Number(p[0].price);
  const p2 = await sql("select preco from produtos where variant_id = " + E(vid) + " limit 1");
  return (p2 && p2[0] && p2[0].preco != null) ? Number(p2[0].preco) : null;
}
async function link(vid) { return await encurtar('https://checkout.americanutrition.com/?items=' + vid + ':1&ref=grupo'); }
const PRIVADO = 'Qualquer dúvida mais específica, me chama no privado que eu te ajudo.';

let grupoTxt = '';
let privadoTxt = '';
let detalhe = d.intencao + '/' + d.produto;
const cat = d.intencao;

if (cat === 'link_compra') {
  const l = await link(prod.vid);
  grupoTxt = oi + 'Claro. O link oficial do *' + prod.nome + '* é este:' + NL + l + NL + NL + PRIVADO;
} else if (cat === 'preco_promocao') {
  const v = await preco(prod.vid);
  const l = await link(prod.vid);
  grupoTxt = oi + 'O *' + prod.nome + '* está ' + (v != null ? ('*' + brl(v) + '*') : 'no valor que aparece no link') + '.';
  if (d.produto === 'imunofosfo_liquid') grupoTxt += ' Em kit sai mais em conta: 3 unidades R$ 329, 6 unidades R$ 617, 9 unidades R$ 864.';
  grupoTxt += NL + 'Link oficial: ' + l + NL + NL + 'Se quiser parcelar ou ver outra opção, me chama no privado.';
} else if (cat === 'como_tomar') {
  if (prod.tipo === 'liquid') grupoTxt = oi + 'O *ImunoFosfo Liquid* é assim:' + NL + '• Uso padrão: 20 gotas, 3 vezes ao dia, depois das refeições principais' + NL + '• Uso preventivo: 40 gotas por dia, em 2 doses de 20' + NL + '• Sempre com intervalo mínimo de 3 horas entre as doses' + NL + '• O frasco dura uns 10 dias no uso padrão';
  else if (prod.tipo === 'kids') grupoTxt = oi + 'O *ImunoFosfo Kids* é simples: 10 gotas de manhã e 10 gotas à noite, a partir de 3 anos.';
  else if (prod.tipo === 'pet') grupoTxt = oi + 'O *ImunoPet* vai pelo peso: 1 gota por kg do animal, no máximo 15 gotas por dose. Nos 7 primeiros dias, 3 vezes ao dia; depois, 1 vez ao dia.';
  else if (prod.tipo === 'spray') grupoTxt = oi + 'O *Healing* é de uso tópico: borrifa na pele limpa, na região que precisa, 2 a 3 vezes ao dia.';
  else if (prod.tipo === 'omega') grupoTxt = oi + 'O *Ômega 3* são 2 cápsulas por dia, de preferência junto com o ImunoFosfo da manhã e da noite, que ele ajuda na absorção.';
  else grupoTxt = oi + 'O *' + prod.nome + '* é assim:' + NL + '• Uso preventivo: 2 cápsulas por dia' + NL + '• Com diagnóstico: 3 cápsulas por dia' + NL + '• Sempre com intervalo mínimo de 3 horas entre uma e outra' + NL + '• Absorve melhor junto com uma gordura boa, tipo azeite ou ômega 3';
  grupoTxt += NL + NL + 'Se você está em tratamento, alinha com quem te acompanha, tá? ' + PRIVADO;
} else if (cat === 'versao_produto') {
  grupoTxt = oi + 'Hoje o ImunoFosfo tem estas versões:' + NL + '• Cápsulas: 42, 60, 90 e Plus 180' + NL + '• Vegano, 90 cápsulas' + NL + '• Liquid, em gotas' + NL + '• Kids, em gotas, a partir de 3 anos' + NL + '• Diabetes' + NL + '• ImunoPet, para os bichinhos' + NL + NL + 'Me diz qual te interessa que eu mando o link certo.';
} else if (cat === 'depoimentos') {
  grupoTxt = oi + 'Os depoimentos ficam na página do produto, na parte de avaliações:' + NL + 'https://americanutrition.com/products/imunofosfo#avaliacoes' + NL + NL + 'E aqui no grupo mesmo tem muita gente que usa, é só perguntar.';
} else if (cat === 'pedido_nao_chegou') {
  // no grupo: status sem dado pessoal. No privado: rastreio completo.
  let achou = null;
  if (c.telefone) {
    const cs = await req({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 30000, headers: { 'Content-Type': 'application/json' }, body: { acao: 'consultar', endpoint: 'customers/search.json', params: { query: 'phone:' + c.telefone, fields: 'id' } } });
    const cid = cs && cs.dados && cs.dados.customers && cs.dados.customers[0] && cs.dados.customers[0].id;
    if (cid) {
      const os = await req({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 30000, headers: { 'Content-Type': 'application/json' }, body: { acao: 'consultar', endpoint: 'customers/' + cid + '/orders.json', params: { status: 'any', limit: 3 } } });
      const ords = (os && os.dados && os.dados.orders) || [];
      achou = ords.find((o) => String(o.financial_status) === 'paid') || ords[0] || null;
    }
  }
  if (!achou) {
    grupoTxt = oi + 'Vou olhar isso agora. Me chama no privado com o número do pedido ou o CPF que eu te passo o rastreio na hora.';
    detalhe += ' | pedido nao localizado pelo telefone';
  } else {
    const f = (achou.fulfillments || [])[0] || null;
    const numero = String(achou.name || '');
    const item = ((achou.line_items || [])[0] || {}).title || 'seu pedido';
    const dataPedido = String(achou.created_at || '').slice(0, 10).split('-').reverse().slice(0, 2).join('/');
    if (!f || !f.tracking_number) {
      grupoTxt = oi + 'Olhei aqui: seu pedido do *' + item + '*, feito em ' + dataPedido + ', está pago e em separação. A gente posta até as 12h dos dias úteis, e assim que sair você recebe o rastreio no privado.';
      privadoTxt = oi + 'Aqui é o Samuel, da America Nutrition. Seu pedido *' + numero + '* está pago e em separação. Assim que for postado eu te mando o código de rastreio por aqui.';
      detalhe += ' | ' + numero + ' sem postagem';
    } else {
      const cod = String(f.tracking_number);
      const rr = await req({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/rastreio/buscar', json: true, timeout: 30000, headers: { 'Content-Type': 'application/json' }, body: { modo: 'codigo', codigo: cod } });
      const x = (rr && rr.sucesso && rr.rastreio) || null;
      const evs = (x && Array.isArray(x.eventos) ? x.eventos : []).filter((e) => !e.eh_importacao);
      const ultimo = evs[0] || null;
      const entregue = !!(x && (x.status_chave === 'delivered' || /entreg/i.test(x.status_atual || '')));
      const previsao = x && x.previsao_entrega ? String(x.previsao_entrega).split('-').reverse().slice(0, 2).join('/') : '';
      const onde = ultimo ? String(ultimo.status || '').replace(/\[[^\]]*\]/g, '').replace(/Se você tiver qualquer problema.*$/i, '').replace(/\s{2,}/g, ' ').trim() : '';
      const quando = ultimo && ultimo.data ? String(ultimo.data).slice(0, 16).replace('T', ' às ').split('-').reverse().join('/').replace(/^(\d{2}:\d{2}) às (\d{2})\/(\d{2})\/(\d{4})$/, '$3/$2 às $1') : '';
      if (entregue) {
        grupoTxt = oi + 'Olhei aqui e o rastreio marca *entregue*' + (quando ? ' em ' + quando : '') + '. Se não chegou na sua mão, me chama no privado que eu abro a reclamação com a transportadora agora.';
      } else {
        grupoTxt = oi + 'Olhei aqui: seu pedido *não está perdido*' + (x && x.atrasado ? ', mas está atrasado na transportadora' : ' e está dentro do prazo') + '.' + NL + '• Postado em ' + (x && x.postado_em ? String(x.postado_em).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : dataPedido) + (onde ? NL + '• Último registro' + (quando ? ' (' + quando + ')' : '') + ': ' + onde : '') + (previsao ? NL + '• Previsão: até ' + previsao : '') + NL + NL + 'Te mandei o link de rastreio no privado. Se passar da previsão, me avisa que eu abro a reclamação com a transportadora.';
      }
      privadoTxt = oi + 'Aqui é o Samuel, da America Nutrition. Vi sua mensagem no grupo e conferi o pedido *' + numero + '*.' + NL + NL + '\u{1F4E6} ' + item + NL + '\u{1F69A} ' + (x && x.transportadora ? String(x.transportadora).replace('jtexpress', 'J&T Express') : 'transportadora') + ', código ' + cod + (previsao ? NL + '\u{1F5D3} Previsão: até ' + previsao : '') + NL + NL + 'Acompanhe aqui, atualiza sozinho:' + NL + 'https://track.americanutrition.com/' + cod;
      detalhe += ' | ' + numero + ' ' + cod + ' ' + String((x && x.status_chave) || '');
    }
  }
}
if (!grupoTxt) { await log('bloqueada', 'sem texto para a intencao ' + cat); return [{ json: { ok: false, acao: 'bloqueada', motivo: 'sem texto' } }]; }

// 5) Enviar no grupo (citando a pergunta), depois no privado se houver
const env = await req({ method: 'POST', url: EVO + '/message/sendText/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, json: true, timeout: 40000, body: { number: c.jid, text: grupoTxt, delay: 2500, quoted: { key: quotedKey, message: { conversation: String(c.texto).slice(0, 200) } } } });
const okGrupo = !!(env && env.key && env.key.id);
if (!okGrupo) { await log('falha_ao_enviar', detalhe); return [{ json: { ok: false, acao: 'falha_ao_enviar' } }]; }
let okPrivado = null;
if (privadoTxt && c.telefone) {
  const pv = await req({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/wpp-avulso', headers: { 'Content-Type': 'application/json' }, json: true, timeout: 40000, body: { number: c.telefone, text: privadoTxt } });
  okPrivado = !!pv;
}
await log('respondida', detalhe + (okPrivado === null ? '' : (okPrivado ? ' | privado ok' : ' | privado falhou')));
await telegram('\u{1F916} <b>Samuel respondeu no grupo</b>' + NL + '<b>' + esc(c.grupo_nome) + '</b> · ' + esc(d.intencao) + (d.produto && d.produto !== 'nenhum' ? ' · ' + esc(d.produto) : '') + (okPrivado !== null ? ' · privado ' + (okPrivado ? 'ok' : 'falhou') : '') + NL + NL + '<b>Pergunta</b> (' + esc(c.push_name || 'sem nome') + '): ' + esc(String(c.texto).slice(0, 220)) + NL + NL + '<b>Resposta:</b> ' + esc(grupoTxt.slice(0, 700)));
return [{ json: { ok: true, acao: 'respondida', intencao: d.intencao, produto: d.produto, grupo: c.grupo_nome, privado: okPrivado } }];
