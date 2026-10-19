// No 'Resumo Sync' do workflow [Serena] Sync Base de Treinamento (D71uJKMi3u442bL0). <TOKEN_ALERTAS> fica so no n8n.
const e = $('Extrair Texto').first().json;
const s = $input.first().json || {};
const mudou = s.mudou === true;
const bloqueado = s.bloqueado === true;
const r = { ok: true, mudou: mudou, bloqueado: bloqueado, versao: e.versao, versao_serena: s.versao_banco || null, caracteres: e.tamanho, hash: e.hash, forcado: !!e.force, verificado_em: new Date().toISOString() };
// bloqueado = o site mudou, mas a versao dele nao e maior que a da Serena (protege contra voltar para uma base antiga)
let texto = '';
if (mudou) texto = '🧠 <b>Base da Serena atualizada</b>\nVersao ' + e.versao + ' · ' + e.tamanho + ' caracteres' + (e.force ? ' (forcado)' : '') + '\nA Serena ja esta usando o novo treinamento em todos os canais (site e WhatsApp).';
else if (bloqueado) texto = '⚠️ <b>Base do site NAO aplicada na Serena</b>\nO site serena.americanutrition.com mudou, mas esta na versao ' + e.versao + ' e a Serena ja usa a ' + (s.versao_banco || '?') + '.\nPara aplicar, suba o site com uma versao maior (ex.: ' + (s.versao_banco || '7.65') + ' → proxima) ou force pelo webhook serena-sync-base com {"force": true}.';
if (texto) {
  try {
    await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 15000,
      body: { chat_id: '-1003766435449', message_thread_id: 289, parse_mode: 'HTML', disable_web_page_preview: true, text: texto } });
  } catch (err) { r.aviso_telegram = String(err.message); }
}
return [{ json: r }];
