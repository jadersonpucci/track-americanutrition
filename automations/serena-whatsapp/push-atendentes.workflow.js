// n8n Workflow SDK — [Serena WhatsApp] Push -> Atendentes (id TBjkNpRT6iYJvsSC)
// POST /webhook/serena-push { titulo, corpo, url, tag, agente? } -> Web Push nativo (RFC 8291 + VAPID RFC 8292)
// A implementacao de criptografia e a mesma de webpush-referencia.js (validada com o vetor da RFC 8291).
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook Push', parameters: { httpMethod: 'POST', path: 'serena-push', responseMode: 'responseNode', options: {} } },
  output: [{ body: { titulo: 'Cliente aguardando', corpo: 'Maria entrou na fila', url: 'https://n8n.americanutrition.com/webhook/serena-inbox?t=x', tag: 'fila' } }] });

const carregar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Carregar Subs + VAPID', parameters: { operation: 'executeQuery',
  query: "select coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'agente', s.agente)) from serena_push_subs s where s.ativo), '[]'::jsonb) as subs, coalesce((select valor from serena_config where chave = 'push_vapid_public'), '') as vapid_public, coalesce((select valor from serena_config where chave = 'push_vapid_private'), '') as vapid_private",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ subs: [], vapid_public: '', vapid_private: '' }] });

// Ver o jsCode completo no n8n (Enviar Push): gera VAPID se faltar, cifra o payload por inscricao e faz POST no endpoint
// com headers Content-Encoding: aes128gcm, TTL, Urgency e Authorization: vapid t=<jwt>, k=<pub>.
const enviar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Enviar Push', parameters: { jsCode: "// ver webpush-referencia.js" } },
  output: [{ gerou_vapid: false, vapid_public: 'x', vapid_private: 'y', enviados: 0, total: 0, resultados: [], payload: '{}' }] });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar Resultado', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), vp as (insert into serena_config (chave, valor, atualizado_em) select v.c, v.v, now() from p, (values ('push_vapid_public', (select j->>'pub' from p)), ('push_vapid_private', (select j->>'priv' from p))) as v(c, v) where (p.j->>'gerou')::boolean is true on conflict (chave) do update set valor = excluded.valor, atualizado_em = now() returning 1), r as (select x->>'endpoint' as endpoint, (x->>'status')::int as status, (x->>'morto')::boolean as morto from p, jsonb_array_elements(coalesce(p.j->'resultados', '[]'::jsonb)) x), up as (update serena_push_subs s set falhas = case when r.status between 200 and 299 then 0 else s.falhas + 1 end, ativo = case when r.morto or s.falhas + 1 >= 5 and not (r.status between 200 and 299) then false else s.ativo end, atualizado_em = now() from r where s.endpoint = r.endpoint returning 1) select (select count(*) from vp)::int as vapid_salvo, (select count(*) from up)::int as atualizados",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ vapid_salvo: 0, atualizados: 0 }] });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr("{{ JSON.stringify({ ok: true, enviados: $('Enviar Push').first().json.enviados, total: $('Enviar Push').first().json.total, vapid_public: $('Enviar Push').first().json.vapid_public, resultados: $('Enviar Push').first().json.resultados }) }}"), options: {} } }, output: [{}] });

const nota = sticky('## Push para os atendentes (Web Push nativo)', [carregar, enviar], { color: 5 });

export default workflow('serena-push', '[Serena WhatsApp] Push -> Atendentes')
  .add(entrada).to(carregar).to(enviar).to(registrar).to(responder).add(nota);
