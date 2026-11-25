// Menu clicavel (lista nativa do WhatsApp) depois do texto, quando a Serena marcou [[LISTA: ...]].
// Vai pelo webhook de envio do Samuel ({ number, lista }). Se falhar, manda as opcoes em texto para nao perder a pergunta.
// OBS (03/09): o sendList da Evolution atual falha ("this.isZero is not a function"); o Core esta com LISTA_NATIVA = false
// e manda as opcoes numeradas no proprio texto, entao este no nao recebe lista ate a Evolution ser atualizada.
let alvo = null;
try { alvo = $('Fatiar Resposta').all().map(i => i.json).find(j => j && j.lista && Array.isArray(j.lista.opcoes) && j.lista.opcoes.length); } catch (e) { alvo = null; }
if (!alvo) return [{ json: { lista_enviada: false } }];
const l = alvo.lista;
let r = null;
try {
  r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar', json: true, timeout: 60000, body: { number: alvo.number, lista: { titulo: l.titulo, opcoes: l.opcoes, descricao: 'Toque no botão e escolha', botao: 'Ver opções' }, delay: 900 } });
} catch (e) { r = { ok: false, erro: String(e.message || e) }; }
if (!r || r.ok !== true) {
  try { await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar', json: true, timeout: 60000, body: { number: alvo.number, text: l.titulo + '\n' + l.opcoes.map((o, i) => (i + 1) + '. ' + o).join('\n'), delay: 900 } }); } catch (e) {}
}
return [{ json: { lista_enviada: !!(r && r.ok === true), detalhe: r } }];
