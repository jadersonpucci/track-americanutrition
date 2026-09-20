// Node "Checar Estoque" do workflow "Pagar.me — Criar Pedido (Fluxo A)" (n8n DHeud8c0Qkb0EDwS). Chaves reais so no n8n.
// AN-RATE-GUARD v3.7 (antifraude card testing) + AN-ESTOQUE-GUARD
// v3.7 (19/09/2026, chargeback AN-15104): blocklist por ENDERECO (cliente_blocklist tipo 'endereco' = cep|rua normalizada)
//   e regras de JANELA LONGA para cartao: mesmo telefone com 3+ CPFs em 7 dias, ou CPF/email com 6+ recusas de cartao em 7 dias.
//   O fraudador de Osorio passou pelas regras de 30min voltando em dias e IPs diferentes com identidades novas.
// v3.6: verificacao Cloudflare TURNSTILE (antifraude_config: turnstile_mode off|log|enforce, turnstile_secret)
// v3.5: regras ANTI-CARDING por identidades distintas: CPFs distintos no mesmo IP (30min) e na mesma faixa /24 (60min)
// v3.4: BLOCKLIST DE CLIENTE (tabela cliente_blocklist: cpf/cnpj/email/telefone) — vale para TODOS os metodos
// v3.3: blocklist de ENDERECO (tabela endereco_blocklist, por CEP)
// v3.2: key30 de >2 para >4 (cliente real retenta cartao recusado; alinhado ao limite de CPF)
// FAIL-OPEN em erro de infra: nunca derruba venda real por bug.
const b = $('Checkout Recebido').first().json.body || $('Checkout Recebido').first().json;
const hdrs = $('Checkout Recebido').first().json.headers || {};
let esgotado = false, nomes = [], bloqueado = false;

// ===== AN-CLIENTE-BLOCKLIST v1.1 (ago/2026) =====
try {
  const SKB = 'SUPABASE_SERVICE_KEY';
  const PGB = 'https://supabase.americanutrition.com/pg/query';
  const escB = s => String(s == null ? '' : s).replace(/'/g, "''");
  const dgB = s => String(s || '').replace(/[^0-9]/g, '');
  const sqlB = async q => { const r = await this.helpers.httpRequest({ method: 'POST', url: PGB, headers: { apikey: SKB, Authorization: 'Bearer ' + SKB, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 8000 }); return Array.isArray(r) ? r : []; };
  const docB = dgB(b.customer && b.customer.document);
  const emB = String((b.customer && b.customer.email) || '').toLowerCase().trim();
  const telB = dgB((b.customer && b.customer.ddd) || '') + dgB((b.customer && b.customer.phone) || '');
  const tel11 = telB.replace(/^55/, '');
  const nomeB = String((b.customer && b.customer.name) || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ipB = String(b._client_ip || hdrs['x-forwarded-for'] || hdrs['x-real-ip'] || '').split(',')[0].trim();
  // v3.7: endereco = cep (8 digitos) + '|' + rua sem acento/pontuacao, minuscula (ex.: 95520000|sidonio ramos de oliveira)
  // tipo de logradouro (r, rua, av, avenida, al, trav, estr, rod...) sai da comparacao: 'R. Sidonio' e 'Rua Sidonio' sao a mesma rua
  const normB = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(r|rua|av|avenida|al|alameda|trav|travessa|tv|estr|estrada|rod|rodovia|pc|pca|praca|lgo|largo|vl|vila|res|residencial|cond|condominio)\s+/, '');
  const cepB = dgB(b.shipping && b.shipping.zip);
  const ruaB = normB(b.shipping && b.shipping.street);
  const endB = (cepB.length === 8 && ruaB) ? (cepB + '|' + ruaB) : '';
  if (docB || emB || telB || endB) {
    const qB = "SELECT tipo, valor FROM cliente_blocklist WHERE ativo IS TRUE AND ("
      + "(tipo IN ('cpf','cnpj','documento') AND '" + escB(docB) + "'<>'' AND regexp_replace(valor,'[^0-9]','','g')='" + escB(docB) + "')"
      + " OR (tipo='email' AND '" + escB(emB) + "'<>'' AND lower(trim(valor))='" + escB(emB) + "')"
      + " OR (tipo='telefone' AND '" + escB(telB) + "'<>'' AND regexp_replace(valor,'[^0-9]','','g') IN ('" + escB(telB) + "','" + escB(tel11) + "','55" + escB(tel11) + "'))"
      + " OR (tipo='endereco' AND '" + escB(endB) + "'<>'' AND split_part(valor,'|',1)='" + escB(cepB) + "' AND position(split_part(valor,'|',2) in '" + escB(ruaB) + "') > 0)"
      + ") LIMIT 1;";
    const rB = await sqlB(qB);
    const hitB = rB[0] || null;
    if (hitB) {
      bloqueado = true;
      const metodoB = String(b.payment_method || '').slice(0, 20);
      try { await sqlB("INSERT INTO pagamento_tentativas (ip, documento, email, telefone, nome, metodo, bloqueada, idem_key) VALUES ('" + escB(ipB) + "','" + escB(docB) + "','" + escB(emB) + "','" + escB(telB) + "','" + escB(nomeB) + "','" + escB(metodoB) + "',true,'BLOCKLIST');"); } catch (_ib) {}
      try {
        const thB = await sqlB("SELECT count(*) AS n FROM pagamento_tentativas WHERE idem_key='BLOCKLIST' AND criado_em > now()-interval '10 min';");
        if (parseInt((thB[0] || {}).n || 0) <= 1) {
          await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', body: { chat_id: '-1003766435449', message_thread_id: 412, text: '\ud83d\udeab <b>BLOCKLIST</b>: pedido barrado \u2014 ' + hitB.tipo + ' ' + hitB.valor + ' (novos bloqueios silenciados por 10min)', parse_mode: 'HTML' }, json: true, timeout: 5000 });
        }
      } catch (_tb) {}
    }
  }
} catch (_cb) { /* fail-open */ }
// ===== fim AN-CLIENTE-BLOCKLIST =====

try {
  if (!bloqueado && b.payment_method === 'credit_card') {
    const SK = 'SUPABASE_SERVICE_KEY';
    const PG = 'https://supabase.americanutrition.com/pg/query';
    const esc = s => String(s==null?'':s).replace(/'/g, "''");
    const dg = s => String(s||'').replace(/[^0-9]/g,'');
    const sql = async q => { const r = await this.helpers.httpRequest({method:'POST', url:PG, headers:{apikey:SK, Authorization:'Bearer '+SK, 'Content-Type':'application/json'}, body:{query:q}, json:true, timeout:8000}); return Array.isArray(r)?r:[]; };
    const ipRaw = String(b._client_ip || hdrs['x-forwarded-for'] || hdrs['x-real-ip'] || '').split(',')[0].trim();
    const ehPrivado = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ipRaw);
    const ip = ehPrivado ? '' : ipRaw;
    const sub = /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(ip) ? ip.split('.').slice(0,3).join('.') : '';
    const doc = dg(b.customer && b.customer.document);
    const email = String((b.customer && b.customer.email)||'').toLowerCase().trim();
    const tel = dg((b.customer && b.customer.ddd)||'') + dg((b.customer && b.customer.phone)||'');
    const nomeCli = String((b.customer && b.customer.name)||'').toLowerCase().replace(/\s+/g,' ').trim();
    const idemKey = String(b.idempotency_key || '').trim();
    const cepEnv = dg((b.shipping && b.shipping.zip) || '');
    let motivo = '';

    // config + blocklists (IP e ENDERECO) + config Turnstile numa query so
    let exigirAssinatura = true, tsMode = 'off', tsSecret = '';
    try {
      const cfg = await sql("SELECT (SELECT valor FROM antifraude_config WHERE chave='exigir_assinatura') AS exigir, (SELECT valor FROM antifraude_config WHERE chave='turnstile_mode') AS ts_mode, (SELECT valor FROM antifraude_config WHERE chave='turnstile_secret') AS ts_secret, EXISTS(SELECT 1 FROM ip_blocklist WHERE ip='" + esc(ip) + "') AS banido, EXISTS(SELECT 1 FROM endereco_blocklist WHERE cep='" + esc(cepEnv) + "' AND '" + esc(cepEnv) + "' <> '') AS end_banido;");
      const c0 = cfg[0] || {};
      exigirAssinatura = String(c0.exigir || 'on') !== 'off';
      tsMode = String(c0.ts_mode || 'off');
      tsSecret = String(c0.ts_secret || '');
      if (ip && c0.banido) { motivo = 'IP banido ' + ip; }
      else if (c0.end_banido) { motivo = 'endere\u00e7o banido CEP ' + cepEnv; }
    } catch(_c) {}

    // REGRA ASSINATURA (desligavel p/ testes): checkout real SEMPRE envia idempotency_key; bot nao
    if (!motivo && exigirAssinatura && !idemKey) { motivo = 'sem assinatura do checkout (bot)'; }

    // ===== AN-TURNSTILE v1 (Cloudflare) =====
    // modo 'off' = desligado | 'log' = so registra | 'enforce' = bloqueia
    // Sem secret configurado nunca bloqueia. Erro de rede = fail-open.
    if (!motivo && tsMode !== 'off' && tsSecret) {
      const tok = String(b.turnstile_token || '').trim();
      let okTs = false, motTs = '';
      if (!tok) { motTs = 'sem token'; }
      else {
        try {
          const vr = await this.helpers.httpRequest({ method: 'POST', url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify', body: { secret: tsSecret, response: tok, remoteip: ip || undefined }, json: true, timeout: 6000 });
          okTs = !!(vr && vr.success);
          if (!okTs) { motTs = 'token invalido ' + JSON.stringify((vr && vr['error-codes']) || []); }
        } catch (_tv) { okTs = true; motTs = 'erro de rede (fail-open)'; }
      }
      try { await sql("INSERT INTO turnstile_log (ip, documento, email, sucesso, motivo, modo) VALUES ('"+esc(ip)+"','"+esc(doc)+"','"+esc(email)+"',"+(okTs?'true':'false')+",'"+esc(motTs)+"','"+esc(tsMode)+"');"); } catch(_tl) {}
      if (!okTs && tsMode === 'enforce') { motivo = 'Turnstile: ' + motTs; }
    }
    // ===== fim AN-TURNSTILE =====

    // registra a tentativa (bloqueadas ficam marcadas e FORA das contagens — nao travam a loja)
    const jaBloq = motivo ? 'true' : 'false';
    await sql("INSERT INTO pagamento_tentativas (ip, documento, email, telefone, nome, metodo, bloqueada, idem_key) VALUES ('"+esc(ip)+"','"+esc(doc)+"','"+esc(email)+"','"+esc(tel)+"','"+esc(nomeCli)+"','credit_card',"+jaBloq+",'"+esc(idemKey)+"');");

    // limites por velocidade — contam SO tentativas legitimas (bloqueada=false)
    if (!motivo) {
      const r = await sql(
        "SELECT " +
        "count(*) FILTER (WHERE criado_em > now()-interval '10 min') AS global10, " +
        "count(*) FILTER (WHERE ip='"+esc(ip)+"' AND ip<>'' AND criado_em > now()-interval '30 min') AS ip30, " +
        "count(*) FILTER (WHERE ip='"+esc(ip)+"' AND ip<>'' AND criado_em > now()-interval '24 hours') AS ip24, " +
        "count(DISTINCT documento) FILTER (WHERE ip='"+esc(ip)+"' AND ip<>'' AND documento<>'' AND criado_em > now()-interval '30 min') AS docsip30, " +
        "count(DISTINCT documento) FILTER (WHERE '"+esc(sub)+"'<>'' AND ip LIKE '"+esc(sub)+".%' AND documento<>'' AND criado_em > now()-interval '60 min') AS docssub60, " +
        "count(*) FILTER (WHERE documento='"+esc(doc)+"' AND documento<>'' AND criado_em > now()-interval '30 min') AS doc30, " +
        "count(*) FILTER (WHERE email='"+esc(email)+"' AND email<>'' AND criado_em > now()-interval '30 min') AS em30, " +
        "count(*) FILTER (WHERE telefone='"+esc(tel)+"' AND telefone<>'' AND criado_em > now()-interval '30 min') AS tel30, " +
        "count(*) FILTER (WHERE nome='"+esc(nomeCli)+"' AND nome<>'' AND criado_em > now()-interval '30 min') AS nome30, " +
        "count(*) FILTER (WHERE idem_key='"+esc(idemKey)+"' AND idem_key<>'' AND criado_em > now()-interval '30 min') AS key30 " +
        "FROM pagamento_tentativas WHERE bloqueada IS NOT TRUE;"
      );
      const c = r[0] || {};
      const N = x => parseInt(x||0)||0;
      // ANTI-CARDING: identidades distintas na mesma origem = bot rodando lista de cartoes
      if (ip && N(c.docsip30) > 2) { motivo = 'CARDING: IP ' + ip + ' com ' + N(c.docsip30) + ' CPFs distintos/30min'; }
      else if (sub && N(c.docssub60) > 3) { motivo = 'CARDING: faixa ' + sub + '.x com ' + N(c.docssub60) + ' CPFs distintos/60min'; }
      else if (N(c.global10) > 8) { motivo = 'GLOBAL: ' + N(c.global10) + ' tentativas leg\u00edtimas de cart\u00e3o em 10min'; }
      else if (ip && N(c.ip30) > 6) { motivo = 'IP ' + ip + ' (' + N(c.ip30) + '/30min)'; }
      else if (ip && N(c.ip24) > 15) { motivo = 'IP ' + ip + ' (' + N(c.ip24) + '/24h)'; }
      else if (N(c.doc30) > 4) { motivo = 'CPF ' + doc + ' (' + N(c.doc30) + '/30min)'; }
      else if (N(c.em30) > 4) { motivo = 'email ' + email + ' (' + N(c.em30) + '/30min)'; }
      else if (N(c.tel30) > 4) { motivo = 'telefone ' + tel + ' (' + N(c.tel30) + '/30min)'; }
      else if (N(c.nome30) > 8) { motivo = 'nome \"' + nomeCli + '\" (' + N(c.nome30) + '/30min)'; }
      else if (N(c.key30) > 4) { motivo = 'chave repetida (' + N(c.key30) + '/30min)'; }
      // v3.7: JANELA LONGA. Fraude paciente volta em outro dia, outro IP e outra identidade,
      // mas mantem telefone e endereco. Regras: (a) mesmo telefone com 3+ CPFs distintos em 7 dias;
      // (b) mesmo CPF ou email com 6+ recusas do emissor (pagarme_orders.status failed) em 7 dias.
      if (!motivo && (tel || doc || email)) {
        try {
          const r7 = await sql(
            "SELECT " +
            "(SELECT count(DISTINCT documento) FROM pagamento_tentativas WHERE '"+esc(tel)+"'<>'' AND telefone='"+esc(tel)+"' AND documento<>'' AND criado_em > now()-interval '7 days') AS docs_tel7, " +
            "(SELECT count(*) FROM pagarme_orders WHERE payment_method='credit_card' AND status IN ('failed','not_authorized','refused','with_error') AND created_at > now()-interval '7 days' AND (('"+esc(doc)+"'<>'' AND regexp_replace(coalesce(customer_document,''),'[^0-9]','','g')='"+esc(doc)+"') OR ('"+esc(email)+"'<>'' AND lower(trim(coalesce(customer_email,'')))='"+esc(email)+"'))) AS fail7;"
          );
          const c7 = r7[0] || {};
          if (tel && N(c7.docs_tel7) > 2) { motivo = 'telefone ' + tel + ' com ' + N(c7.docs_tel7) + ' CPFs distintos/7d'; }
          else if (N(c7.fail7) > 5) { motivo = 'CPF/email com ' + N(c7.fail7) + ' recusas de cartao/7d'; }
        } catch (_l7) {}
      }
      if (motivo) { await sql("UPDATE pagamento_tentativas SET bloqueada=true WHERE id=(SELECT max(id) FROM pagamento_tentativas WHERE metodo='credit_card');"); }
    }

    if (motivo) {
      bloqueado = true;
      // AUTO-BAN: IP com 5+ tentativas bloqueadas em 24h vira ban permanente
      if (ip) {
        try {
          const ab = await sql("SELECT count(*) AS n FROM pagamento_tentativas WHERE ip='"+esc(ip)+"' AND bloqueada IS TRUE AND criado_em > now()-interval '24 hours';");
          if (parseInt((ab[0]||{}).n||0) >= 5) { await sql("INSERT INTO ip_blocklist (ip, motivo) VALUES ('"+esc(ip)+"','auto-ban: 5+ bloqueios/24h') ON CONFLICT DO NOTHING;"); }
        } catch(_a){}
      }
      // ALERTA com throttle: 1 alerta a cada 10 min no maximo
      try {
        const th = await sql("SELECT count(*) AS n FROM pagamento_tentativas WHERE bloqueada IS TRUE AND criado_em > now()-interval '10 min';");
        if (parseInt((th[0]||{}).n||0) <= 1) {
          await this.helpers.httpRequest({ method:'POST', url:'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', body:{ chat_id:'-1003766435449', message_thread_id:412, text:'\ud83d\udea8 <b>ANTIFRAUDE</b>: bloqueando tentativas de cart\u00e3o \u2014 ' + motivo + ' (novos bloqueios silenciados por 10min)', parse_mode:'HTML' }, json:true, timeout:5000 });
        }
      } catch(_t){}
    }
  }
} catch (e) { /* fail-open */ }

// ---------- ESTOQUE-GUARD (so roda se nao bloqueou) ----------
if (!bloqueado) {
  try {
    const sitems = Array.isArray(b.shopify_items) ? b.shopify_items : [];
    const ids = [...new Set(sitems.map(it => String(it.variant_id || it.code || '').replace(/[^0-9]/g,'')).filter(v => v.length >= 8))];
    if (ids.length) {
      const gids = ids.map(id => '\"gid://shopify/ProductVariant/' + id + '\"').join(',');
      const query = '{ nodes(ids: [' + gids + ']) { ... on ProductVariant { id title availableForSale product { title } } } }';
      const resp = await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://n8n.americanutrition.com/webhook/shopify-admin',
        body: { acao: 'atualizar_pedido', endpoint: 'graphql.json', metodo: 'POST', payload: { query: query } },
        json: true,
        timeout: 10000
      });
      const nodes = resp && resp.dados && resp.dados.data && resp.dados.data.nodes ? resp.dados.data.nodes : null;
      if (Array.isArray(nodes)) {
        for (const n of nodes) {
          if (n && n.availableForSale === false) {
            esgotado = true;
            const nome = (n.product && n.product.title) ? n.product.title : ('produto ' + String(n.id||'').split('/').pop());
            if (nomes.indexOf(nome) === -1) nomes.push(nome);
          }
        }
      }
    }
  } catch (e) { esgotado = false; nomes = []; }
}
return [{ json: { esgotado: esgotado, nomes: nomes, bloqueado: bloqueado } }];