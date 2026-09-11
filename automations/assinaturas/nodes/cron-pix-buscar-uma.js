// Node "Buscar Uma" do workflow "AN - Assinaturas Cron PIX" (n8n VxyloA6hZtppGEja).
// Chaves reais so no n8n.
//
// GERACAO SOB DEMANDA (11/09/2026). O cron das 10h so olha assinaturas 'ativa' ou 'inadimplente'.
// Quem esta 'pausada' nunca recebe Pix - e exatamente quem liga pedindo para renovar. Este caminho
// cobre esse caso: gera o Pix de UMA assinatura, sem tocar em nenhuma outra.
//
// POST /webhook/assinatura-pix-avulso
//   { t: TOKEN, assinatura_id: uuid, reativar: true, ciclo_hoje: true }
//
// reativar   -> devolve a assinatura para 'ativa' (quem pediu renovacao quer voltar a receber)
// ciclo_hoje -> realinha proximo_ciclo para hoje, para o proximo ciclo contar do pagamento e nao
//               de uma data vencida ha semanas (senao o cliente pagaria hoje e seria cobrado em dias)
//
// Daqui para frente o cron cuida normalmente: lembrete no vencimento, lembrete em +2 dias e pausa
// em +5 dias sem pagamento. Se ele nao pagar, a assinatura volta a pausar sozinha.
const TOKEN = 'an-assin-7Wq3Xv';
const SK = 'SUPABASE_SERVICE_KEY';
const self = this;
const sql = async (q) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 });
  return Array.isArray(r) ? r : [];
};
const b = ($json.body || $json) || {};
if (String(b.t || '') !== TOKEN) return [{ json: { erro: 'token invalido' } }];
const id = String(b.assinatura_id || '').trim();
if (!/^[0-9a-fA-F-]{36}$/.test(id)) return [{ json: { erro: 'assinatura_id invalido' } }];
const reativar = String(b.reativar == null ? '1' : b.reativar) !== 'false' && String(b.reativar) !== '0';
const cicloHoje = String(b.ciclo_hoje == null ? '1' : b.ciclo_hoje) !== 'false' && String(b.ciclo_hoje) !== '0';

// Trava global de assinaturas: se estiver ligada, nem o avulso passa.
const trava = await sql('select 1 as x from assinatura_config where pausar_todas = true limit 1');
if (trava.length) return [{ json: { erro: 'assinatura_config.pausar_todas esta ligado' } }];

const base = await sql("select id::text as id, nome, status, metodo, coalesce(cancelar_no_fim,false) as cancelar_no_fim, to_char(proximo_ciclo,'YYYY-MM-DD') as ciclo, pagarme_customer_id from assinaturas where id = '" + id + "'::uuid");
if (!base.length) return [{ json: { erro: 'assinatura nao encontrada' } }];
const a0 = base[0];
if (String(a0.metodo || '') !== 'pix') return [{ json: { erro: 'assinatura nao e pix, e ' + a0.metodo } }];
if (!a0.pagarme_customer_id) return [{ json: { erro: 'assinatura sem pagarme_customer_id' } }];

// Nunca refaz uma cobranca que ja foi paga.
const cicloAlvo = cicloHoje ? null : a0.ciclo;
const jaPago = await sql("select 1 as x from assinatura_cobrancas where assinatura_id = '" + id + "'::uuid and ciclo_ref = " + (cicloAlvo ? ("'" + cicloAlvo + "'") : "to_char(current_date,'YYYY-MM-DD')") + " and status = 'pago' limit 1");
if (jaPago.length) return [{ json: { erro: 'ja existe cobranca paga para este ciclo' } }];

const mudancas = [];
if (cicloHoje) mudancas.push('proximo_ciclo = current_date');
if (reativar) mudancas.push("status = 'ativa'");
if (mudancas.length) {
  await sql('update assinaturas set ' + mudancas.join(', ') + ', atualizado_em = now() where id = ' + "'" + id + "'::uuid");
}

// Mesma consulta do cron (mesmos campos, mesmo calculo de premio e de valor), mas para um id so
// e sem o filtro de status.
const rows = await sql(
  "select a.id, a.nome, a.whatsapp, a.pagarme_customer_id, a.shipping, a.freight, a.shopify_items, a.valor_centavos, coalesce(a.renovacoes,0) as renovacoes, a.desconto_proxima_pct, " +
  "((coalesce(a.renovacoes,0)+2) % 6 = 0 and coalesce(a.valor_cheio_centavos,0) > 0 and a.desconto_proxima_pct is null) as mes_premio, " +
  "case " +
  " when a.desconto_proxima_pct is not null and coalesce(a.valor_cheio_centavos,0) > 0 then round(a.valor_cheio_centavos * (100 - a.desconto_proxima_pct) / 100.0)::int " +
  " when (coalesce(a.renovacoes,0)+2) % 6 = 0 and coalesce(a.valor_cheio_centavos,0) > 0 then round(a.valor_cheio_centavos * 0.70)::int " +
  " else a.valor_centavos end as cobrar_centavos, " +
  "to_char(a.proximo_ciclo,'YYYY-MM-DD') as ciclo_ref, to_char(a.proximo_ciclo,'DD/MM') as venc_fmt, to_char(a.proximo_ciclo + 5,'DD/MM') as limite_fmt " +
  "from assinaturas a where a.id = '" + id + "'::uuid"
);
if (!rows.length) return [{ json: { erro: 'assinatura desapareceu no meio do caminho' } }];
const r = rows[0];
r.acao = 'gerar';
r.avulso = true;
return [{ json: r }];
