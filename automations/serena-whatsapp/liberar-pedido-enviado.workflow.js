// n8n "[Transacional] Liberar Pedido Enviado (postagem)", 18/11/2026, pedido do Jaderson. Cron 15 min.
// O aviso "pedido enviado" saia quando a etiqueta era gerada (fulfillment da Shopify), antes de os Correios receberem
// o pacote: a cliente lia "foi postado" e o rastreio mostrava "Preparando". Agora o "[Transacional] Pedido Enviado"
// grava o aviso com status 'aguardando_postagem' e este robo consulta o motor de rastreio:
//   - postado (postado_em ou status_chave de transporte) -> status 'pendente', send_at agora: o Dispatcher Samuel v3 manda
//     o texto de sempre ("foi postado e ja esta com a transportadora");
//   - 48h sem postagem -> libera com custom_fields.sem_postagem = true: o Dispatcher manda o texto aprovado "ja foi
//     embalado e etiquetado para os Correios..." (nodes/dispatcher-montar-mensagem.js).
// Nenhuma chave no codigo (Postgres pela credencial do n8n; o motor de rastreio e publico).
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 15 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } } });

const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Aguardando postagem', parameters: { operation: 'executeQuery',
  query: "select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', template_params->'custom_fields'->>'tracking_number', 'horas', round(extract(epoch from now() - created_at) / 3600, 1)) order by created_at), '[]'::jsonb) as lista from (select id, template_params, created_at from scheduled_messages where template_name = 'pedido_enviado' and status = 'aguardando_postagem' order by created_at limit 60) s",
  options: {} }, credentials: PG } });

const consultar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Consultar rastreio', parameters: { jsCode: `const RASTREIO = 'https://n8n.americanutrition.com/webhook/rastreio/buscar';
const EM_TRANSPORTE = ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'];
let lista = $input.first().json.lista || [];
if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch (e) { lista = []; } }
const liberar = [];
const resumo = { verificados: 0, postados: 0, sem_postagem_48h: 0, esperando: 0 };
for (const it of lista) {
  resumo.verificados++;
  if (Number(it.horas) >= 48) { liberar.push({ id: it.id, fallback: true }); resumo.sem_postagem_48h++; continue; }
  let R = null;
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: RASTREIO, json: true, timeout: 40000, body: { modo: 'codigo', codigo: it.codigo } });
    R = (r && r.rastreio) || null;
  } catch (e) { R = null; }
  const postado = !!(R && (R.postado_em || EM_TRANSPORTE.indexOf(String(R.status_chave || '')) >= 0));
  if (postado) { liberar.push({ id: it.id, fallback: false }); resumo.postados++; } else { resumo.esperando++; }
}
return [{ json: Object.assign({ payload: JSON.stringify(liberar) }, resumo) }];` } } });

const liberar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Liberar para o Dispatcher', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), l as (select (x->>'id')::uuid as id, coalesce((x->>'fallback')::boolean, false) as fb from p, jsonb_array_elements(p.j) x) update scheduled_messages m set status = 'pendente', send_at = now(), template_params = case when l.fb then jsonb_set(coalesce(m.template_params, '{}'::jsonb), '{custom_fields,sem_postagem}', 'true'::jsonb, true) else m.template_params end from l where m.id = l.id and m.status = 'aguardando_postagem' returning m.id",
  options: { queryReplacement: '={{ [$json.payload] }}' } }, credentials: PG } });

export default workflow('transacional-liberar-pedido-enviado', '[Transacional] Liberar Pedido Enviado (postagem)')
  .add(cron).to(buscar).to(consultar).to(liberar);
