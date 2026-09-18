const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const body = r.body || {};
const prep = $('Token: Checar cache').first().json;
if (st >= 200 && st < 300 && body.access_token) {
  const sd = $getWorkflowStaticData('global');
  sd.inter_token = body.access_token;
  sd.inter_token_exp = Date.now() + (Number(body.expires_in || 3600) * 1000);
  sd.inter_token_base = prep.base;
  return [{ json: { ok: true, precisa: false, token: body.access_token, base: prep.base } }];
}
return [{ json: { ok: false, erro: 'token Inter HTTP ' + st + ': ' + JSON.stringify(body).slice(0, 300) } }];
