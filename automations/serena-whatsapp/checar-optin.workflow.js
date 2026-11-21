// n8n "[Transacional] Checar opt-in WhatsApp", 21/11/2026, pedido do Jaderson (aviso de restricao no numero da Serena).
// Cron 1 min. Decide se pedido pago / enviado / entregue retido pelo gatilho de optin-transacional.sql sai pelo WhatsApp:
//   - atributo do pedido "WhatsApp opt-in" = sim                       -> libera
//   - = nao, mas a pessoa escreveu para a Serena (WhatsApp) em 24h      -> libera
//   - = nao                                                            -> sem_optin (so e-mail)
//   - sem o atributo (draft order, checkout-us) e ja escreveu alguma vez -> libera
//   - sem o atributo e nunca escreveu                                  -> sem_optin (so e-mail)
//   - Shopify fora do ar: espera; depois de 30 min libera ('sem_consulta'), como era antes.
// Liberar = status 'pendente' + template_params.optin_ok = motivo (o gatilho deixa passar). Nenhuma chave no codigo.
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 1 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } } });

// telefone comparado pelos 8 ultimos digitos + DDD (com e sem o 9, com e sem o 55): fone_nat() em optin-transacional.sql
const retidos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Retidos', credentials: PG, parameters: { operation: 'executeQuery',
  query: "select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'pedido', replace(coalesce(s.template_params->'custom_fields'->>'order_name', ''), '#', ''), 'minutos', round(extract(epoch from now() - s.created_at) / 60), 'escreveu_24h', coalesce(f.w24, false), 'escreveu', coalesce(f.wall, false))), '[]'::jsonb) as lista "
    + "from (select id, phone, template_params, created_at from scheduled_messages where status = 'checar_optin' order by created_at limit 40) s "
    + "left join lateral (select bool_or(m.criado_em > now() - interval '24 hours') as w24, count(*) > 0 as wall from serena_contatos c join serena_mensagens m on m.contato_id = c.id and m.papel = 'cliente' and m.canal = 'whatsapp' "
    + "where length(fone_nat(s.phone)) >= 10 and right(fone_nat(c.telefone), 8) = right(fone_nat(s.phone), 8) and left(fone_nat(c.telefone), 2) = left(fone_nat(s.phone), 2)) f on true",
  options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar consulta', parameters: { jsCode: `let lista = $input.first().json.lista || [];
if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
if (!lista.length) return [];
const nomes = [...new Set(lista.map(x => String(x.pedido || '').trim()).filter(n => /^[A-Za-z0-9-]{3,30}$/.test(n)))];
const q = nomes.length ? nomes.map(n => 'name:' + n).join(' OR ') : 'name:__nenhum__';
return [{ json: { lista, q, n: Math.max(nomes.length, 1) } }];` } } });

const shopify = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Opt-in na Shopify', credentials: SHOP, onError: 'continueRegularOutput', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String,$n:Int){ orders(first:$n, query:$q){ nodes{ name customAttributes{ key value } } } }', variables: { q: $json.q, n: $json.n } }) }}"),
  options: { timeout: 30000 } } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: `const lista = $('Montar consulta').first().json.lista || [];
const r = $input.first().json || {};
const ok = !!(r.data && r.data.orders && Array.isArray(r.data.orders.nodes));
const optin = {};
if (ok) for (const o of r.data.orders.nodes) {
  const a = (o.customAttributes || []).find(x => String(x.key || '').trim().toLowerCase() === 'whatsapp opt-in');
  optin[String(o.name || '').replace('#', '')] = a ? String(a.value || '').trim().toLowerCase() : '';
}
const saida = []; const resumo = { retidos: lista.length, liberados: 0, sem_optin: 0, esperando: 0, shopify_ok: ok };
for (const it of lista) {
  let acao = null, motivo = '';
  if (!ok) { if (Number(it.minutos) >= 30) { acao = 'liberar'; motivo = 'sem_consulta'; } }
  else {
    const v = optin[it.pedido] || '';
    if (v === 'sim') { acao = 'liberar'; motivo = 'optin_sim'; }
    else if (v === 'nao') { if (it.escreveu_24h) { acao = 'liberar'; motivo = 'optin_nao_conversa_24h'; } else { acao = 'bloquear'; motivo = 'optin_nao'; } }
    else if (it.escreveu) { acao = 'liberar'; motivo = 'sem_atributo_ja_conversou'; }
    else { acao = 'bloquear'; motivo = 'sem_atributo_nunca_conversou'; }
  }
  if (!acao) { resumo.esperando++; continue; }
  if (acao === 'liberar') resumo.liberados++; else resumo.sem_optin++;
  saida.push({ id: it.id, acao, motivo });
}
return [{ json: Object.assign({ payload: JSON.stringify(saida) }, resumo) }];` } } });

const aplicar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Aplicar', credentials: PG, parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), l as (select (x->>'id')::uuid as id, x->>'acao' as acao, x->>'motivo' as motivo from p, jsonb_array_elements(p.j) x) "
    + "update scheduled_messages m set template_params = jsonb_set(coalesce(m.template_params, '{}'::jsonb), '{optin_ok}', to_jsonb(l.motivo), true), "
    + "status = case when l.acao = 'liberar' then 'pendente' else 'sem_optin' end, "
    + "erro = case when l.acao = 'liberar' then m.erro else 'whatsapp_sem_optin: ' || l.motivo end "
    + "from l where m.id = l.id and m.status = 'checar_optin' returning m.id, m.status",
  options: { queryReplacement: '={{ [$json.payload] }}' } } } });

export default workflow('transacional-checar-optin', '[Transacional] Checar opt-in WhatsApp')
  .add(cron).to(retidos).to(montar).to(shopify).to(decidir).to(aplicar);
