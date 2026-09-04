// id: 1CfkoWCCfClLVId4
// n8n Workflow SDK — [Serena] Aprovar Proposta da Base (GET /webhook/serena-base-proposta)
// Botoes do Telegram abrem este link: ?t=TOKEN&id=N&acao=ver|aplicar|descartar[&item=n].
// aplicar: anexa o(s) adendo(s) em serena_config.system_prompt, marca lacunas como resolvidas e avisa no Telegram.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Link do Telegram', parameters: { httpMethod: 'GET', path: 'serena-base-proposta', responseMode: 'responseNode', options: {} } }, output: [{ query: { t: 'x', id: '1', acao: 'ver' } }] });

const agir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Aplicar ou Mostrar', parameters: { jsCode: `const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
const SB = 'https://supabase.americanutrition.com/pg/query';
const TG = 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage';
const APROVAR = 'https://n8n.americanutrition.com/webhook/serena-base-proposta';
const self = this;
const NL = String.fromCharCode(10);
async function sql(q) { const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 }); if (r && r.error) throw new Error(String(r.error).slice(0, 300)); return r; }
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const q = $input.first().json.query || {};
const pagina = (titulo, corpo) => '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b1b1b;line-height:1.45}h1{font-size:20px}.it{border:1px solid #ddd;border-radius:10px;padding:12px 14px;margin:12px 0}.tipo{font-size:12px;color:#555}.texto{white-space:pre-wrap;background:#f6f7f9;border-radius:8px;padding:10px;margin:8px 0}.ok{color:#1a7f37}.btn{display:inline-block;background:#1a7f37;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;margin:4px 6px 4px 0}.btn.cinza{background:#666}.btn.verm{background:#b42318}.status{font-weight:600}</style></head><body>' + corpo + '</body></html>';
const id = Number(q.id || 0);
const acao = String(q.acao || 'ver');
const item = q.item ? Number(q.item) : null;
if (!id) return [{ json: { html: pagina('Proposta', '<h1>Faltou o id da proposta.</h1>') } }];
const rows = await sql('select id, criado_em, periodo_ini, periodo_fim, resumo, itens, status, token from serena_base_propostas where id = ' + id);
const p = rows && rows[0];
if (!p) return [{ json: { html: pagina('Proposta', '<h1>Proposta ' + id + ' n\\u00e3o encontrada.</h1>') } }];
if (String(q.t || '') !== String(p.token || '')) return [{ json: { html: pagina('Proposta', '<h1>Link inv\\u00e1lido.</h1><p>O token n\\u00e3o confere com esta proposta.</p>') } }];
let itens = Array.isArray(p.itens) ? p.itens : JSON.parse(p.itens || '[]');
const link = (a, n) => APROVAR + '?t=' + encodeURIComponent(p.token) + '&id=' + p.id + '&acao=' + a + (n ? '&item=' + n : '');
const dataBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

let aviso = '';
if (acao === 'descartar' && p.status === 'pendente') {
  await sql('update serena_base_propostas set status = ' + E('descartada') + ' where id = ' + p.id);
  p.status = 'descartada';
  aviso = '<p class="status">Proposta descartada. Nada entrou na base.</p>';
} else if (acao === 'aplicar') {
  const alvo = itens.filter(it => it.status !== 'aplicado' && (!item || it.n === item));
  if (!alvo.length) {
    aviso = '<p class="status">Nada a aplicar: ' + (item ? 'o item ' + item + ' j\\u00e1 foi aplicado ou n\\u00e3o existe.' : 'todos os itens j\\u00e1 foram aplicados.') + '</p>';
  } else {
    const bloco = alvo.map(it => '### Adendo aprovado em ' + dataBR + ' \\u00b7 ' + it.titulo + (it.secao ? ' (' + it.secao + ')' : '') + NL + it.texto).join(NL + NL);
    const atual = (await sql("select coalesce((select valor from serena_config where chave='system_prompt'),'') as v"))[0].v;
    const cab = atual.indexOf('ADENDOS APROVADOS') >= 0 ? '' : 'ADENDOS APROVADOS PELA EQUIPE (complementam a base de treinamento; em caso de conflito, o adendo mais recente vale):' + NL + NL;
    const novo = (atual ? atual + NL + NL : '') + cab + bloco;
    await sql('insert into serena_config (chave, valor) values (' + E('system_prompt') + ', ' + E(novo) + ') on conflict (chave) do update set valor = excluded.valor');
    itens = itens.map(it => alvo.find(a => a.n === it.n) ? Object.assign({}, it, { status: 'aplicado', aplicado_em: new Date().toISOString() }) : it);
    const todos = itens.every(it => it.status === 'aplicado');
    await sql('update serena_base_propostas set itens = ' + E(JSON.stringify(itens)) + '::jsonb, status = ' + E(todos ? 'aplicada' : 'parcial') + ', aplicado_em = now() where id = ' + p.id);
    p.status = todos ? 'aplicada' : 'parcial';
    const lac = alvo.flatMap(it => it.lacunas || []).map(Number).filter(Boolean);
    if (lac.length) { try { await sql('update serena_lacunas set status = ' + E('resolvida') + ', resolvido_por = ' + E('adendo') + ', atualizado_em = now() where id in (' + lac.join(',') + ')'); } catch (e) {} }
    try { await self.helpers.httpRequest({ method: 'POST', url: TG, json: true, timeout: 15000, body: { chat_id: '-1003766435449', message_thread_id: 289, parse_mode: 'HTML', disable_web_page_preview: true, text: '\\u2705 <b>Adendo' + (alvo.length > 1 ? 's' : '') + ' aplicado' + (alvo.length > 1 ? 's' : '') + ' \\u00e0 base (proposta ' + p.id + ')</b>' + NL + alvo.map(it => '\\u2022 ' + esc(it.titulo)).join(NL) + NL + NL + 'A Serena j\\u00e1 usa a partir da pr\\u00f3xima mensagem. Copie para o documento da base quando puder.' } }); } catch (e) {}
    aviso = '<p class="status ok">Aplicado: ' + alvo.map(it => esc(it.titulo)).join('; ') + '. A Serena j\\u00e1 usa a partir da pr\\u00f3xima mensagem.</p>';
  }
}

let corpo = '<h1>Proposta ' + p.id + ' \\u00b7 ' + esc(p.periodo_ini) + ' a ' + esc(p.periodo_fim) + '</h1><p class="status">Status: ' + esc(p.status) + '</p>' + aviso + '<p>' + esc(p.resumo || '') + '</p>';
if (p.status === 'pendente' || p.status === 'parcial') corpo += '<p><a class="btn" href="' + link('aplicar') + '">\\u2705 Aplicar todos os pendentes</a> <a class="btn verm" href="' + link('descartar') + '">\\u274C Descartar</a></p>';
for (const it of itens) {
  corpo += '<div class="it"><b>' + it.n + '. ' + esc(it.titulo) + '</b> <span class="tipo">' + esc(it.tipo) + (it.secao ? ' \\u00b7 ' + esc(it.secao) : '') + '</span>' + (it.status === 'aplicado' ? ' <span class="ok">\\u2713 aplicado</span>' : '') + '<div class="texto">' + esc(it.texto) + '</div><div class="tipo">Motivo: ' + esc(it.motivo) + (it.lacunas && it.lacunas.length ? ' \\u00b7 lacunas ' + it.lacunas.join(', ') : '') + '</div>' + (it.status !== 'aplicado' && p.status !== 'descartada' ? '<p><a class="btn" href="' + link('aplicar', it.n) + '">\\u2705 Aplicar s\\u00f3 este</a></p>' : '') + '</div>';
}
return [{ json: { html: pagina('Proposta ' + p.id, corpo) } }];` } }, output: [{ html: '<html></html>' }] });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Pagina', parameters: { respondWith: 'text', responseBody: '={{ $json.html }}', options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } } } } });

const nota = sticky('## Aprovar proposta da base\n\nGET /webhook/serena-base-proposta?t=TOKEN&id=N&acao=ver|aplicar|descartar[&item=n]. Os botoes do Telegram apontam para ca. Aplicar anexa o adendo em serena_config.system_prompt (a Serena usa na mensagem seguinte), marca as lacunas cobertas como resolvidas e avisa no Telegram. Ver mostra a proposta completa com botoes por item.', [entrada, agir], { color: 6 });

export default workflow('serena-aprovar-proposta-base', '[Serena] Aprovar Proposta da Base', { settings: { executionOrder: 'v1' } })
  .add(entrada).to(agir).to(responder).add(nota);
