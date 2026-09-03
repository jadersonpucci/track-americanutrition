// n8n Workflow SDK — [Serena Tool] Troca e Devolucao (id VujldCtkPDLPLxzL)
// n8n Workflow SDK — [Serena Tool] Troca e Devolucao (POST /webhook/serena-troca)
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook Troca', parameters: { httpMethod: 'POST', path: 'serena-troca', responseMode: 'responseNode', options: {} } },
  output: [{ body: { tipo: 'troca', numero_pedido: '#1234', produtos: '1x ImunoFosfo', motivo: 'chegou danificado', detalhes: '', fotos: '', contato_id: '', telefone: '5511999999999', nome: 'Maria', canal: 'whatsapp' } }] });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `const b = $input.first().json.body || $input.first().json;
const tipo = ['troca', 'devolucao', 'reembolso'].indexOf(String(b.tipo || '').toLowerCase()) >= 0 ? String(b.tipo).toLowerCase() : 'troca';
const tel = String(b.telefone || '').replace(/\\D/g, '');
const cid = /^[0-9a-f-]{36}$/i.test(String(b.contato_id || '')) ? String(b.contato_id).toLowerCase() : '';
const pedido = String(b.numero_pedido || b.pedido || '').trim().slice(0, 40);
const produtos = String(b.produtos || b.produto || '').trim().slice(0, 500);
const motivo = String(b.motivo || '').trim().slice(0, 1000);
if (!motivo && !produtos) throw new Error('motivo ou produtos obrigatorios');
return [{ json: { payload: JSON.stringify({ contato_id: cid || null, telefone: tel || null, nome: String(b.nome || b.nome_cliente || '').trim().slice(0, 80), canal: String(b.canal || '').toLowerCase().slice(0, 20), tipo: tipo, pedido: pedido, produtos: produtos, motivo: motivo, detalhes: String(b.detalhes || '').trim().slice(0, 2000), fotos: String(b.fotos || '').trim().slice(0, 2000) }) } }];` } }, output: [{ payload: '{}' }] });

// Grava o caso; se ja ha caso aberto igual (mesmo contato/pedido, ultimas 48h) reaproveita o protocolo.
const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Caso', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), ex as (select t.id from serena_trocas t, p where t.status in ('aberta','em_analise') and t.criado_em > now() - interval '48 hours' and ((nullif(p.j->>'contato_id','') is not null and t.contato_id = (p.j->>'contato_id')::uuid) or (nullif(p.j->>'telefone','') is not null and t.telefone = p.j->>'telefone')) and coalesce(t.pedido,'') = coalesce(p.j->>'pedido','') order by t.criado_em desc limit 1), ins as (insert into serena_trocas (contato_id, telefone, nome, canal, tipo, pedido, produtos, motivo, detalhes, fotos) select nullif(p.j->>'contato_id','')::uuid, nullif(p.j->>'telefone',''), nullif(p.j->>'nome',''), nullif(p.j->>'canal',''), p.j->>'tipo', nullif(p.j->>'pedido',''), nullif(p.j->>'produtos',''), nullif(p.j->>'motivo',''), nullif(p.j->>'detalhes',''), nullif(p.j->>'fotos','') from p where not exists (select 1 from ex) returning id), at as (insert into serena_atribuicoes (contato_id, status, motivo) select (p.j->>'contato_id')::uuid, 'aberto', 'troca' from p where nullif(p.j->>'contato_id','') is not null on conflict (contato_id) do update set status = 'aberto', motivo = 'troca', atualizado_em = now() returning 1), et as (insert into serena_etiquetas (contato_id, etiqueta, origem) select (p.j->>'contato_id')::uuid, 'troca', 'auto' from p where nullif(p.j->>'contato_id','') is not null on conflict do nothing returning 1) select coalesce((select id from ins), (select id from ex)) as id, exists(select 1 from ex) as reaproveitado, p.j as dados from p",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ id: 1, reaproveitado: false, dados: {} }] });

const avisar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisar Equipe', parameters: { jsCode: `const r = $input.first().json || {};
const d = r.dados || {};
const id = r.id;
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const NL = String.fromCharCode(10);
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=an-serena-9Kx4Lm2Q';
const link = d.contato_id ? INBOX + '&c=' + encodeURIComponent(d.contato_id) : INBOX + '&fila=humano';
const tipoTxt = { troca: 'TROCA', devolucao: 'DEVOLUCAO', reembolso: 'REEMBOLSO' }[d.tipo] || 'TROCA';
let msg = '\\u{1F501} <b>PEDIDO DE ' + tipoTxt + ' #' + id + '</b>' + (r.reaproveitado ? ' (caso ja aberto, atualizado)' : '') + NL + NL;
msg += '\\u{1F464} <b>Cliente:</b> ' + esc(d.nome || 'Sem nome') + (d.telefone ? ' (+' + esc(d.telefone) + ')' : '') + NL;
if (d.pedido) msg += '\\u{1F4E6} <b>Pedido:</b> <code>' + esc(d.pedido) + '</code>' + NL;
if (d.produtos) msg += '\\u{1F9EA} <b>Produto(s):</b> ' + esc(d.produtos) + NL;
msg += NL + '\\u{1F4DD} <b>Motivo:</b>' + NL + esc(d.motivo || '-') + NL;
if (d.detalhes) msg += NL + '<b>Detalhes:</b> ' + esc(d.detalhes) + NL;
if (d.fotos) msg += NL + '\\u{1F4F7} <b>Fotos (descricao):</b> ' + esc(d.fotos) + NL;
msg += NL + 'A Serena ja coletou tudo e avisou o cliente que a equipe responde em ate 1 dia util.' + NL;
msg += '<a href="' + link + '">\\u{1F5A5} Abrir no Inbox e decidir</a>';
let tg = null, push = null;
if (!r.reaproveitado) {
  try { tg = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage', json: true, timeout: 20000, body: { chat_id: '-1003766435449', message_thread_id: 94, text: msg, parse_mode: 'HTML', disable_web_page_preview: true } }); } catch (e) { tg = { erro: String(e.message) }; }
  try { push = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-push', json: true, timeout: 20000, body: { titulo: '\\u{1F501} ' + tipoTxt.toLowerCase() + ': ' + (d.nome || 'cliente'), corpo: String(d.motivo || '').slice(0, 160), url: link, tag: 'troca-' + id } }); } catch (e) { push = { erro: String(e.message) }; }
}
return [{ json: { sucesso: true, protocolo: '#' + id, id: id, reaproveitado: !!r.reaproveitado, resultado: 'Caso de ' + tipoTxt.toLowerCase() + ' registrado com protocolo #' + id + '. Informe o protocolo ao cliente e diga que a equipe analisa e responde por aqui em ate 1 dia util.', telegram_ok: !!(tg && tg.ok), push: push } }];` } }, output: [{ sucesso: true, protocolo: '#1', resultado: 'ok' }] });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr("{{ JSON.stringify($json) }}"), options: {} } }, output: [{}] });

export default workflow('serena-troca', '[Serena Tool] Troca e Devolucao', { settings: { executionOrder: 'v1' } })
  .add(entrada).to(preparar).to(gravar).to(avisar).to(responder);
