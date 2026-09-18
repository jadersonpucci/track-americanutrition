const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const p = $('Setup: Preparar registro').first().json;
const ok = st >= 200 && st < 300;
return [{ json: { ok: ok, http: st, chave: p.chave, webhookUrl: p.webhookUrl, resposta_inter: r.body || null, dica: ok ? 'Webhook registrado. O Inter passa a avisar cada PIX recebido nessa URL.' : 'Falhou. Confira certificado mTLS, client_id/secret, escopo webhook.write e a chave PIX.' } }];
