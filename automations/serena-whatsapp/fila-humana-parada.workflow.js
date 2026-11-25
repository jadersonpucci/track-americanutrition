// id klTuJjVCATqxxJfp
// n8n Workflow SDK — [Serena] Fila Humana Parada (cron 20 min)
// Cliente escalado para atendimento humano que fica sem resposta. Nao existia alerta nenhum:
// em 01/10 havia 13 clientes esperando, um deles ha 528 horas (22 dias) desde 09/09.
// 01/10/2026 (decisao do Jaderson): alem de avisar, agora DEVOLVE a conversa para a Serena
// quando ninguem responde em fila_devolver_horas (padrao 2h). Ela retoma em modo reprocessar,
// com ferramentas, pedindo desculpa pela demora.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 20 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 20 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// 1) DEVOLVER: espera acima de fila_devolver_horas (2h) e abaixo de fila_devolver_max_horas (24h),
// 8h-20h BRT, no maximo 5 por rodada, um contato so volta a ser devolvido depois do cooldown (24h).
// Libera a pausa do WhatsApp e o ia_pausada aqui, senao o Core recusa a conversa.
const liberar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar e Liberar', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'fila_devolver'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'fila_devolver_horas'), '2')::numeric as horas, coalesce((select valor from serena_config where chave = 'fila_devolver_max_horas'), '24')::numeric as max_horas, coalesce((select valor from serena_config where chave = 'fila_devolver_hora_ini'), '8')::int as h_ini, coalesce((select valor from serena_config where chave = 'fila_devolver_hora_fim'), '20')::int as h_fim, coalesce((select valor from serena_config where chave = 'fila_devolver_cooldown_horas'), '24')::numeric as cooldown_h, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), abertas as (select a.contato_id, a.motivo, a.atribuido_em, c.nome, serena_tel_canon(coalesce(c.telefone, '')) as telefone, (select max(m.criado_em) from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'cliente') as ult_cliente, (select max(m.criado_em) from serena_mensagens m where m.contato_id = a.contato_id and m.papel in ('serena', 'humano')) as ult_nossa, (select m.texto from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'cliente' order by m.criado_em desc limit 1) as ultima_msg from serena_atribuicoes a join serena_contatos c on c.id = a.contato_id, cfg where cfg.ativo = 'on' and a.status = 'aberto' and cfg.hora between cfg.h_ini and cfg.h_fim), cand as (select abertas.* from abertas, cfg where ult_cliente > coalesce(ult_nossa, '2000-01-01'::timestamptz) and ult_cliente < now() - (cfg.horas * interval '1 hour') and ult_cliente > now() - (cfg.max_horas * interval '1 hour') and length(telefone) between 10 and 15 and coalesce(btrim(ultima_msg), '') <> '' and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = abertas.telefone) and not exists (select 1 from serena_fatos f where f.contato_id = abertas.contato_id and f.chave = 'atendimento devolvido' and f.atualizado_em > now() - (cfg.cooldown_h * interval '1 hour')) order by ult_cliente limit 5), liberar_pausa as (delete from serena_wpp_pausas p using cand where p.telefone = cand.telefone returning 1), liberar_ia as (update serena_conversas v set ia_pausada = false from cand where v.contato_id = cand.contato_id and v.ia_pausada returning 1) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(jsonb_build_object('contato_id', contato_id::text, 'nome', nome, 'telefone', telefone, 'motivo', motivo, 'ultima_msg', left(coalesce(ultima_msg, ''), 400), 'horas', round(extract(epoch from (now() - ult_cliente)) / 3600, 1))) from cand), '[]'::jsonb) as lista",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', horas: 2, max_horas: 24, h_ini: 8, h_fim: 20, cooldown_h: 24, hora: 10 }, lista: [] }] });

const devolver = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Devolver para Serena', parameters: { jsCode: `// Ninguem da equipe respondeu: a conversa volta para a Serena em modo reprocessar (com ferramentas),
// ela pede desculpa pela demora e responde o que ficou pendente. A pausa e o ia_pausada ja foram liberados no no anterior.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const NL = String.fromCharCode(10);
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const ARQUIVO = 'https://n8n.americanutrition.com/webhook/serena-samuel-arquivo';
const API = 'https://n8n.americanutrition.com/webhook/painel-serena-api';
const TOKEN = 'an-serena-9Kx4Lm2Q';
const self = this;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const corta = (s, n) => { const t = String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '...' : t; };
if (String(cfg.ativo || 'on') !== 'on' || !lista.length) { return [{ json: { payload: '[]', devolvidos: 0, falhas: 0 } }]; }

const okFechar = [];
const linhas = [];
let devolvidos = 0, falhas = 0;
for (const it of lista) {
  let r = null;
  try {
    r = await self.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 180000,
      body: { canal: 'whatsapp', telefone: it.telefone, nome: it.nome || '', contato_id: it.contato_id, modo: 'reprocessar', texto: String(it.ultima_msg || '').slice(0, 500) } });
  } catch (e) { r = { erro: String(e.message || e) }; }
  const texto = (r && r.resposta) ? String(r.resposta).trim() : '';
  let enviado = false, detalhe = (r && (r.erro || (r.pausada ? 'conversa pausada no painel' : ''))) || 'Serena nao devolveu texto';
  if (texto) {
    try {
      const s = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: it.telefone, text: texto, delay: 2500 } });
      enviado = !!(s && s.ok);
      if (!enviado) detalhe = 'envio falhou: ' + JSON.stringify(s || {}).slice(0, 160);
    } catch (e) { detalhe = 'envio falhou: ' + String(e.message || e); }
  }
  if (enviado && r && r.arquivo && r.arquivo.url) {
    try { await self.helpers.httpRequest({ method: 'POST', url: ARQUIVO, json: true, timeout: 120000,
      body: { number: it.telefone, url: r.arquivo.url, tipo: r.arquivo.tipo || 'document', nome: r.arquivo.nome || 'arquivo', legenda: r.arquivo.legenda || '', delay: 1500 } }); } catch (e) {}
  }
  const quando = new Date(Date.now() - 10800000).toISOString().slice(0, 16).replace('T', ' ');
  const nota = enviado
    ? ('Ninguem da equipe respondeu em ' + it.horas + 'h: a conversa voltou para a Serena, que pediu desculpa pela demora e respondeu em ' + quando + ' (horario de Brasilia).' + (r && r.handoff ? ' Ela encaminhou de novo para a equipe.' : ''))
    : ('Tentativa de devolver a conversa para a Serena em ' + quando + ' nao deu certo (' + corta(detalhe, 120) + '). Responder pelo Inbox.');
  try { await self.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000,
    body: { t: TOKEN, acao: 'nota', contato_id: it.contato_id, chave: 'atendimento devolvido', texto: nota, autor: 'serena' } }); } catch (e) {}
  if (enviado) {
    devolvidos++;
    // se a Serena encaminhou de novo, a atribuicao foi reaberta por ela: nao fechar
    if (!(r && r.handoff)) okFechar.push(it.contato_id);
    linhas.push('\\u2705 <b>' + esc(it.nome || 'Cliente') + '</b> (+' + esc(it.telefone) + ') esperava <b>' + esc(it.horas) + 'h</b>' + NL +
      '   cliente: \"' + esc(corta(it.ultima_msg, 110)) + '\"' + NL +
      '   Serena: \"' + esc(corta(texto, 220)) + '\"' + (r && r.handoff ? NL + '   <i>ela encaminhou de novo para a equipe</i>' : ''));
  } else {
    falhas++;
    linhas.push('\\u26A0\\uFE0F <b>' + esc(it.nome || 'Cliente') + '</b> (+' + esc(it.telefone) + ') esperava <b>' + esc(it.horas) + 'h</b> e a devolucao falhou' + NL +
      '   <i>' + esc(corta(detalhe, 160)) + '</i>');
  }
  await new Promise(res => setTimeout(res, 12000 + Math.floor(Math.random() * 6000)));
}

if (linhas.length) {
  const txt = '\\u{1F504} <b>Fila humana: ' + lista.length + ' conversa(s) devolvida(s) para a Serena</b>' + NL +
    '<i>Ninguem da equipe respondeu em mais de ' + esc(cfg.horas) + 'h, entao ela retomou pedindo desculpa pela demora.</i>' + NL + NL +
    linhas.join(NL + NL);
  try {
    await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 20000,
      body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true } });
  } catch (e) {}
}
return [{ json: { payload: JSON.stringify(okFechar), devolvidos: devolvidos, falhas: falhas } }];` } },
  output: [{ payload: '[]', devolvidos: 0, falhas: 0 }] });

const fechar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Fechar Devolvidos', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_atribuicoes a set status = 'resolvido', atualizado_em = now() from p, jsonb_array_elements_text(p.j) x where a.contato_id = x::uuid and a.status = 'aberto' returning a.contato_id",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ contato_id: '' }] });

// 2) AVISAR: quem sobra na fila (nao devolvido, ou devolucao que falhou) vira aviso no Telegram
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Fila Parada', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'fila_alerta'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'fila_alerta_min'), '20')::int as min_espera, coalesce((select valor from serena_config where chave = 'fila_realerta_horas'), '4')::int as realerta_h, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), abertas as (select a.contato_id, a.agente, a.atribuido_em, a.motivo, a.alertado_em, c.nome, regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as telefone, (select max(m.criado_em) from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'cliente') as ult_cliente, (select max(m.criado_em) from serena_mensagens m where m.contato_id = a.contato_id and m.papel in ('serena', 'humano')) as ult_nossa, (select m.texto from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'cliente' order by m.criado_em desc limit 1) as ultima_msg from serena_atribuicoes a join serena_contatos c on c.id = a.contato_id where a.status = 'aberto'), lista as (select contato_id::text as contato_id, nome, telefone, motivo, atribuido_em, ult_cliente, left(coalesce(ultima_msg, ''), 120) as ultima_msg, round(extract(epoch from (now() - ult_cliente)) / 3600, 1) as horas from abertas, cfg where ult_cliente > coalesce(ult_nossa, '2000-01-01'::timestamptz) and ult_cliente < now() - (cfg.min_espera * interval '1 minute') and (alertado_em is null or alertado_em < now() - (cfg.realerta_h * interval '1 hour')) and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = abertas.telefone) order by ult_cliente limit 25) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(row_to_json(lista)) from lista), '[]'::jsonb) as lista, (select count(*) from abertas where ult_cliente > coalesce(ult_nossa, '2000-01-01'::timestamptz)) as total_esperando",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', min_espera: 20, realerta_h: 4, hora: 10 }, lista: [], total_esperando: 0 }] });

const avisar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisar Telegram', parameters: { jsCode: `// Um aviso por rodada com todo mundo que esta esperando, do que espera ha mais tempo para o mais novo.
// Cada contato so volta a aparecer depois de fila_realerta_horas, para a equipe nao receber a mesma lista de 20 em 20 min.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const NL = String.fromCharCode(10);
const TOKEN = 'an-serena-9Kx4Lm2Q';
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=' + TOKEN;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
if (String(cfg.ativo || 'on') !== 'on' || !lista.length) { return [{ json: { payload: '[]', avisados: 0 } }]; }
const tempo = h => { const n = Number(h) || 0; if (n < 1) return Math.round(n * 60) + ' min'; if (n < 48) return n.toFixed(1).replace('.0', '') + 'h'; return Math.round(n / 24) + ' dias'; };
const linhas = lista.map(function (x) {
  return '\\u2022 <b>' + esc(x.nome || 'Cliente') + '</b> (+' + esc(x.telefone) + ') esperando <b>' + tempo(x.horas) + '</b>' + NL +
    '   \"' + esc(String(x.ultima_msg || '').replace(/\\s+/g, ' ')) + '\"' + NL +
    '   <a href=\"' + INBOX + '&c=' + x.contato_id + '\">abrir no Inbox</a>';
});
const total = Number(d.total_esperando) || lista.length;
const txt = '\\u{1F6A8} <b>Fila humana parada: ' + lista.length + ' cliente(s) sem resposta</b>' + NL +
  (total > lista.length ? '<i>' + total + ' na fila ao todo; os demais ja foram avisados nas ultimas horas.</i>' + NL : '') + NL +
  linhas.join(NL + NL) + NL + NL + '<i>A Serena esta pausada nessas conversas por causa do encaminhamento: quem responde agora e a equipe.</i>';
try {
  await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 20000,
    body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true } });
} catch (e) { return [{ json: { payload: '[]', avisados: 0, erro: String(e.message) } }]; }
return [{ json: { payload: JSON.stringify(lista.map(function (x) { return x.contato_id; })), avisados: lista.length } }];` } },
  output: [{ payload: '[]', avisados: 0 }] });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Alertado', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_atribuicoes a set alertado_em = now() from p, jsonb_array_elements_text(p.j) x where a.contato_id = x::uuid and a.status = 'aberto' returning a.contato_id",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ contato_id: '' }] });

const nota = sticky('## Fila humana parada\n\n**1) Devolver para a Serena** (01/10/2026, decisao do Jaderson): cliente encaminhado para humano que ficou mais de `fila_devolver_horas` (padrao 2h) sem resposta volta para a Serena. O no Buscar e Liberar apaga a pausa do WhatsApp e o ia_pausada, a Serena responde em modo *reprocessar* (com ferramentas, pedindo desculpa pela demora) e a atribuicao e fechada. So entre 8h e 20h BRT, so se o cliente falou nas ultimas `fila_devolver_max_horas` (24h), maximo 5 por rodada, um contato so e devolvido de novo depois de `fila_devolver_cooldown_horas` (24h). Se a Serena encaminhar de novo, a atribuicao fica aberta. Fica uma nota no contato (`atendimento devolvido`).\n\n**2) Avisar a equipe**: quem sobra na fila (espera acima de `fila_alerta_min`, padrao 20 min) vai no Telegram (topico 289) com tempo de espera, ultima frase do cliente e link do Inbox. Cada contato so reaparece depois de `fila_realerta_horas` (padrao 4h).\n\nPula bloqueados. Kill switches: `fila_devolver = off`, `fila_alerta = off`.\n\nNasceu em 01/10/2026: a Serena pausava 12h ao encaminhar e ninguem era avisado; havia 13 clientes esperando, um deles ha 22 dias.', { color: 3, width: 620, height: 420 });

export default workflow('serena-fila-parada', '[Serena] Fila Humana Parada', { settings: { executionOrder: 'v1' } })
  .add(cron).to(liberar).to(devolver).to(fechar).to(buscar).to(avisar).to(marcar).add(nota);
