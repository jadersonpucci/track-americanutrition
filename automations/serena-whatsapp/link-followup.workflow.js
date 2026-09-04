// id oL5sdxV2bQWGzUeC
// n8n Workflow SDK — [Serena WhatsApp] Follow-up de Link nao aberto (cron 15 min)
// Link de pagamento enviado pela Serena ha mais de N horas (config link_followup_horas, padrao 2), sem nenhum clique no
// AN Links (anl_clicks) e sem o cliente ter falado depois: manda UMA mensagem curta, uma vez por contato a cada 7 dias,
// so entre 8h e 20h BRT. Respeita fila humana, pausas, bloqueados e conversas pausadas. Registro em serena_link_followups.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 15 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const rodar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Selecionar e Enviar', parameters: { jsCode: `const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
const SB = 'https://supabase.americanutrition.com/pg/query';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const self = this;
async function sql(q) { return await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 }); }
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";

// Candidatos: link da Serena (seguro.americanutrition.com/slug -> checkout) sem clique, cliente calado desde entao
const q = "with cfg as (select coalesce((select valor from serena_config where chave='link_followup'),'on') as ativo, coalesce((select valor from serena_config where chave='link_followup_horas'),'2')::numeric as horas), m as (select m.id, m.contato_id, m.criado_em, c.telefone, c.nome, (regexp_match(m.texto, 'seguro\\\\.americanutrition\\\\.com/([A-Za-z0-9]+)'))[1] as slug from serena_mensagens m join serena_contatos c on c.id = m.contato_id, cfg where cfg.ativo = 'on' and m.papel = 'serena' and m.canal = 'whatsapp' and m.texto ~ 'seguro\\\\.americanutrition\\\\.com/[A-Za-z0-9]+' and m.criado_em < now() - (cfg.horas * interval '1 hour') and m.criado_em > now() - interval '8 hours') select m.id as msg_id, m.contato_id, regexp_replace(m.telefone, '\\\\D', '', 'g') as telefone, split_part(coalesce(m.nome,''), ' ', 1) as nome, m.slug from m join anl_links l on l.slug = m.slug where l.destino ilike '%checkout.americanutrition.com%' and not exists (select 1 from anl_clicks k where k.link_id = l.id and k.ts >= m.criado_em - interval '1 minute') and not exists (select 1 from serena_mensagens x where x.contato_id = m.contato_id and x.criado_em > m.criado_em and x.papel = 'cliente') and not exists (select 1 from serena_mensagens y where y.contato_id = m.contato_id and y.criado_em > m.criado_em and y.papel = 'serena' and y.texto ~ 'seguro\\\\.americanutrition\\\\.com/') and not exists (select 1 from serena_link_followups f where f.msg_id = m.id or (f.contato_id = m.contato_id and f.enviado_em > now() - interval '7 days')) and not exists (select 1 from serena_atribuicoes a where a.contato_id = m.contato_id and a.status = 'aberto') and not exists (select 1 from serena_wpp_pausas p where p.telefone = serena_tel_canon(m.telefone) and p.ate > now()) and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = serena_tel_canon(m.telefone)) and not exists (select 1 from serena_conversas v where v.contato_id = m.contato_id and v.ia_pausada = true and v.aberta_em > now() - interval '2 days') and extract(hour from now() at time zone 'America/Sao_Paulo') between 8 and 20 order by m.criado_em limit 20";
let cands = [];
try { const r = await sql(q); if (r && r.error) throw new Error(String(r.error).slice(0, 300)); cands = Array.isArray(r) ? r : []; } catch (e) { return [{ json: { ok: false, erro: String(e.message || e) } }]; }

let enviados = 0; const erros = [];
for (const c of cands) {
  const nome = (c.nome || '').trim();
  const texto = 'Oi' + (nome ? ', ' + nome : '') + '! Vi que o link de pagamento que te mandei ainda não foi aberto 🙂 Ficou alguma dúvida, ou prefere pagar de outro jeito (PIX ou boleto)? É só me falar por aqui 💙';
  let ok = false, det = null;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: c.telefone, text: texto, delay: 1200 } });
    ok = !!(r && r.ok); det = ok ? null : JSON.stringify(r).slice(0, 200);
  } catch (e) { det = String(e.message || e); }
  try {
    await sql('insert into serena_link_followups (msg_id, contato_id, telefone, slug, resultado) values (' + Number(c.msg_id) + ',' + E(c.contato_id) + '::uuid,' + E(c.telefone) + ',' + E(c.slug) + ',' + E(ok ? 'enviado' : ('falha: ' + det)) + ') on conflict (msg_id) do nothing;'
      + (ok ? " insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) values (" + E(c.contato_id) + "::uuid, 'serena', " + E(texto) + ", 'whatsapp', 'proativo:link_followup', true, now());" : ''));
  } catch (e) { erros.push('sql ' + c.telefone + ': ' + String(e.message || e)); }
  if (ok) enviados++; else erros.push(c.telefone + ': ' + det);
  await new Promise(r => setTimeout(r, 2500));
}
return [{ json: { ok: true, candidatos: cands.length, enviados: enviados, erros: erros } }];` } }, output: [{ ok: true, candidatos: 0, enviados: 0, erros: [] }] });

const nota = sticky('## Follow-up de link nao aberto\n\nA cada 15 min: link de checkout que a Serena mandou ha mais de link_followup_horas (padrao 2h), sem clique no AN Links e sem o cliente falar depois, recebe UMA mensagem curta (uma por contato a cada 7 dias, 8h-20h BRT). Nao manda se houver fila humana, pausa, bloqueio ou conversa pausada.\n\nDesligar: serena_config link_followup = off. Registro em serena_link_followups; a mensagem entra no historico como proativo:link_followup.', [cron, rodar], { color: 5 });

export default workflow('serena-link-followup', '[Serena WhatsApp] Follow-up de Link nao aberto', { settings: { executionOrder: 'v1' } })
  .add(cron).to(rodar).add(nota);
