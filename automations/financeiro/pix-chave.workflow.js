// [Financeiro] Pix na chave -> aviso + pedido (10/11/2026)
// Cliente paga Pix direto na chave de e-mail (portada da Stone para o Inter). A cada 2 min esta rotina lista os Pix
// recebidos no extrato completo do Inter (aplicacao so de extrato), separa os feitos na chave (sem txid, chave =
// checkout_config.pix_chave_manual), grava em pix_chave_recebidos e avisa a Cris no WhatsApp (Samuel) com o link da
// Venda Manual ja preenchida (?pix=<token>). Ela escolhe os produtos e confirma: o pedido nasce pago na Shopify
// (acao pix_criar da Venda Manual). Ninguem paga QR Code.
// Config em checkout_config: pix_chave_ativo (on/off), pix_chave_manual (a chave de e-mail, minusculas),
// pix_chave_aviso_fone (WhatsApp de quem recebe o aviso), pix_chave_aviso_token (token de agente que vai no link),
// pix_chave_desde (ignora Pix anteriores a ligacao). n8n: 0QcbRYOFIVnAvfyC.
// Teste manual: POST /webhook/pix-chave-varrer {k: pix_admin_token, teste: true, dias: 2} so lista (mascarado), nao grava nem avisa.
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const agendado = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 2 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });
const manual = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Manual', parameters: { httpMethod: 'POST', path: 'pix-chave-varrer', responseMode: 'lastNode', responseData: 'firstEntryJson' } } });

const SSL = { httpSslAuth: { id: '674iB1lirHt8T7gy', name: 'Inter Extrato' } };

const config = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config', credentials: PG, parameters: { operation: 'executeQuery', query: "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from checkout_config", options: {} } } });

// Fonte: extrato completo do Inter pela aplicacao so de extrato (inter_ext_*), a mesma do "Financeiro · Extrato Inter".
// A API de Pix (pix/v2/pix) nao traz nome nem CPF do pagador; o extrato traz (detalhes.nomePagador / cpfCnpjPagador).
const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `
const cfg = ($input.first().json || {}).cfg || {};
let corpo = {};
try { const w = $('Manual').first().json; corpo = (w && (w.body || w)) || {}; } catch (e) {}
const ehManual = corpo && Object.keys(corpo).length > 0;
// execucao pelo editor/MCP ($execution.mode = test) dispensa a chave; pelo webhook de producao exige k = pix_admin_token
if (ehManual && $execution.mode !== 'test' && String(corpo.k || '') !== String(cfg.pix_admin_token || '')) return [];
const teste = ehManual && corpo.teste === true;
const ativo = String(cfg.pix_chave_ativo || 'off') === 'on';
const chave = String(cfg.pix_chave_manual || '').trim().toLowerCase();
if (!teste && (!ativo || !chave)) return [];
if (!cfg.inter_ext_client_id || !cfg.inter_ext_client_secret) throw new Error('inter_ext_client_id/secret nao configurados');
const base = String(cfg.inter_ambiente || 'producao') === 'sandbox' ? 'https://cdpj-sandbox.partners.uatinter.co' : 'https://cdpj.partners.bancointer.com.br';
const dia = (ms) => new Date(Date.now() - 3 * 3600e3 - ms).toISOString().slice(0, 10);
const dias = teste ? Math.min(30, Number(corpo.dias) || 2) : 1;
return [{ json: { teste, chave, base, client_id: String(cfg.inter_ext_client_id).trim(), client_secret: String(cfg.inter_ext_client_secret).trim(),
  conta: String(cfg.inter_ext_conta_corrente || cfg.inter_conta_corrente || '').trim(), dataInicio: dia(dias * 86400e3), dataFim: dia(0),
  desde: cfg.pix_chave_desde || '' } }];
` } } });

const token = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Token (extrato)', credentials: SSL, parameters: { method: 'POST', url: '={{ $json.base }}/oauth/v2/token', provideSslCertificates: true, sendBody: true, contentType: 'form-urlencoded',
  bodyParameters: { parameters: [{ name: 'client_id', value: '={{ $json.client_id }}' }, { name: 'client_secret', value: '={{ $json.client_secret }}' }, { name: 'grant_type', value: 'client_credentials' }, { name: 'scope', value: 'extrato.read' }] },
  options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar consulta', parameters: { jsCode: `
const r = $input.first().json || {}; const p = $('Preparar').first().json;
const st = Number(r.statusCode || 0); const b = r.body || {};
if (!(st >= 200 && st < 300) || !b.access_token) throw new Error('Inter nao autorizou o extrato (HTTP ' + st + ')');
const headers = { Authorization: 'Bearer ' + b.access_token, 'Content-Type': 'application/json' };
if (p.conta) headers['x-conta-corrente'] = p.conta;
return [{ json: { headers: JSON.stringify(headers), url: p.base + '/banking/v2/extrato/completo?dataInicio=' + p.dataInicio + '&dataFim=' + p.dataFim + '&pagina=0&tamanhoPagina=1000' } }];
` } } });

const extrato = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Extrato completo', credentials: SSL, parameters: { url: '={{ $json.url }}', provideSslCertificates: true, sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={{ $json.headers }}',
  options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } } } });

const buscar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Separar Pix na chave', parameters: { jsCode: `
const r = $input.first().json || {}; const p = $('Preparar').first().json;
const st = Number(r.statusCode || 0); const b = r.body || {};
if (!(st >= 200 && st < 300)) throw new Error('Extrato Inter HTTP ' + st + ': ' + JSON.stringify(b).slice(0, 200));
const trans = Array.isArray(b.transacoes) ? b.transacoes : [];
const PROPRIO = '11298909000194';
const desde = p.desde ? new Date(p.desde) : null;
const cands = [];
for (const t of trans) {
  if (String(t.tipoOperacao || '').toUpperCase() !== 'C') continue;
  const det = (t.detalhes && typeof t.detalhes === 'object') ? t.detalhes : {};
  const e2e = String(det.endToEndId || '').trim(); if (!e2e) continue;          // so Pix
  if (String(det.txId || det.txid || '').trim()) continue;                      // cobranca nossa: ja tem fluxo proprio
  const ch = String(det.chavePixRecebedor || det.chaveRecebedor || det.chave || '').trim().toLowerCase();
  if (!p.teste && ch !== p.chave) continue;
  const valor = Math.abs(Number(String(t.valor || '0').replace(',', '.'))); if (!(valor > 0)) continue;
  const doc = String(det.cpfCnpjPagador || det.cpfPagador || det.cnpjPagador || '').replace(/\\D/g, '');
  const nome = String(det.nomePagador || det.nomeEmpresaPagador || det.nomeRemetente || '').trim();
  if (doc === PROPRIO || /america\\s*nutri/i.test(nome)) continue;               // transferencia entre contas da empresa
  const horario = t.dataInclusao || det.dataHoraMovimento || t.dataTransacao || null;
  if (!p.teste && desde && horario && /T/.test(String(horario)) && new Date(horario) < desde) continue;
  if (!p.teste && desde && String(t.dataTransacao || '') < desde.toISOString().slice(0, 10)) continue;
  cands.push({ e2e, valor, horario, nome, doc, info: String(det.descricaoPix || t.descricao || '').slice(0, 200), chave: ch, bruto: t });
}
if (p.teste) {
  const mask = (v) => { if (v == null) return v; const s = String(v); if (/^[\\d.\\-\\/]{11,18}$/.test(s)) return s.slice(0, 3) + '***'; if (s.includes('@')) return s.slice(0, 3) + '***' + s.slice(s.indexOf('@')); if (s.length > 8) return s.slice(0, 5) + '...(' + s.length + ')'; return s; };
  const pixC = trans.filter((t) => String(t.tipoOperacao) === 'C' && t.detalhes && t.detalhes.endToEndId);
  const ex = pixC.find((t) => !(t.detalhes.txId || t.detalhes.txid)) || pixC[0] || {};
  return [{ json: { teste: true, transacoes: trans.length, pix_credito: pixC.length, sem_txid: pixC.filter((t) => !(t.detalhes.txId || t.detalhes.txid)).length,
    campos: Object.keys(ex), detalhes: Object.fromEntries(Object.entries(ex.detalhes || {}).map(([k, v]) => [k, mask(v)])),
    exemplo: Object.fromEntries(Object.entries(ex).filter(([k]) => k !== 'detalhes').map(([k, v]) => [k, mask(v)])),
    candidatos: cands.slice(0, 8).map((c) => ({ valor: c.valor, horario: c.horario, nome: c.nome ? c.nome.split(' ')[0] + ' ...' : '', doc: mask(c.doc), chave: mask(c.chave) })),
    query: 'select 1 as nada where false' } }];
}
const lit = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const ts = (h) => (h && /\\d{4}-\\d{2}-\\d{2}/.test(String(h))) ? lit(h) + '::timestamptz' : 'now()';
const sel = "select e2e, token, valor, horario, pagador_nome, pagador_doc from pix_chave_recebidos r where r.status = 'novo' and (r.avisado_em is null or r.avisado_em < now() - interval '15 min')";
let query;
if (cands.length) {
  const vals = cands.map((c) => '(' + [lit(c.e2e), c.valor, ts(c.horario), lit(c.nome), lit(c.doc), lit(c.info), lit(c.chave), lit(JSON.stringify(c.bruto)) + '::jsonb'].join(', ') + ')');
  query = 'with ins as (insert into pix_chave_recebidos (e2e, valor, horario, pagador_nome, pagador_doc, info, chave, bruto) values ' + vals.join(', ') +
    ' on conflict (e2e) do nothing returning e2e, token, valor, horario, pagador_nome, pagador_doc) select * from ins union all ' + sel + ' and r.e2e not in (select e2e from ins) order by horario limit 10';
} else {
  query = sel + ' order by horario limit 10';
}
return [{ json: { transacoes: trans.length, candidatos: cands.length, query } }];
` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar e listar pendentes', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisar no WhatsApp', parameters: { jsCode: `
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($('Config').first().json || {}).cfg || {};
const fone = String(cfg.pix_chave_aviso_fone || '').replace(/\\D/g, '');
const ag = String(cfg.pix_chave_aviso_token || '').trim();   // token de agente (serena_agentes) da Cris: libera a lista de Pix na tela
const rows = $input.all().map((i) => i.json).filter((r) => r && r.e2e);
if (!rows.length) return [];
const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
const quando = (h) => { if (!h) return ''; const d = new Date(new Date(h).getTime() - 3 * 3600e3); const z = (n) => String(n).padStart(2, '0'); return z(d.getUTCDate()) + '/' + z(d.getUTCMonth() + 1) + ' às ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes()); };
const doc = (s) => { s = String(s || ''); if (s.length === 11) return 'CPF ***.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-**'; if (s.length === 14) return 'CNPJ ' + s.slice(0, 2) + '.' + s.slice(2, 5) + '.' + s.slice(5, 8) + '/' + s.slice(8, 12) + '-' + s.slice(12); return ''; };
const lit = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const res = [];
for (const r of rows) {
  const link = BASE + '/webhook/venda-manual?pix=' + r.token + (ag ? '&a=' + encodeURIComponent(ag) : '');
  const texto = '💰 *Pix recebido na chave*\\n\\n*' + brl(r.valor) + '* de ' + (r.pagador_nome || 'pagador não identificado') + (doc(r.pagador_doc) ? '\\n' + doc(r.pagador_doc) : '') + '\\n' + quando(r.horario) +
    '\\n\\nPara criar o pedido (já pago), toque aqui e escolha os produtos:\\n' + link + '\\n\\nSe não for venda, abra o link e toque em *Não é venda*.';
  let ok = false;
  if (fone) {
    try { const s = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/serena-samuel-enviar', json: true, timeout: 30000, body: { number: fone, text: texto } }); ok = !!(s && s.ok); } catch (e) { ok = false; }
  }
  res.push({ e2e: r.e2e, ok });
}
const query = res.map((x) => 'update pix_chave_recebidos set avisado_em = now(), aviso_ok = ' + x.ok + ', status = ' + (x.ok ? "'avisado'" : "'novo'") + ', atualizado_em = now() where e2e = ' + lit(x.e2e) + " and status = 'novo'").join('; ') + '; select ' + res.filter((x) => x.ok).length + ' as avisados, ' + res.length + ' as total';
return [{ json: { query, avisos: res.length, enviados: res.filter((x) => x.ok).length } }];
` } } });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar avisados', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

export default workflow('pix-chave', '[Financeiro] Pix na chave -> aviso + pedido')
  .add(agendado).to(config)
  .add(manual).to(config)
  .add(config).to(preparar).to(token).to(montar).to(extrato).to(buscar).to(gravar).to(avisar).to(marcar);
