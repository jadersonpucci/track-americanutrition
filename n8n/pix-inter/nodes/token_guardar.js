const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const body = r.body || {};
const prep = $('Token: Checar cache').first().json;
if (st >= 200 && st < 300 && body.access_token) {
  const sd = $getWorkflowStaticData('global');
  sd.inter_tokens = sd.inter_tokens || {};
  sd.inter_tokens[prep.escopo] = { token: body.access_token, exp: Date.now() + (Number(body.expires_in || 3600) * 1000), base: prep.base };
  return [{ json: { ok: true, precisa: false, escopo: prep.escopo, token: body.access_token, base: prep.base } }];
}
return [{ json: { ok: false, escopo: prep.escopo, erro: 'token Inter HTTP ' + st + ' (escopo ' + prep.escopo + '): ' + JSON.stringify(body).slice(0, 300) } }];
