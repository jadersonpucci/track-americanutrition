// Arquivo (PDF, imagem) que a Serena marcou com [[ARQUIVO: chave]]: vai depois do texto, pelo webhook serena-samuel-arquivo.
let alvo = null;
try { alvo = $('Fatiar Resposta').all().map(i => i.json).find(j => j && j.arquivo && j.arquivo.url); } catch (e) { alvo = null; }
if (!alvo) return [{ json: { arquivo_enviado: false } }];
const a = alvo.arquivo;
let r = null;
try {
  r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-samuel-arquivo', json: true, timeout: 120000,
    body: { number: alvo.number, url: a.url, tipo: a.tipo || 'document', nome: a.nome || 'arquivo', legenda: a.legenda || '', delay: 1500 } });
} catch (e) { r = { ok: false, erro: String(e.message || e) }; }
// Se o envio do arquivo falhar, manda o link para o cliente nao ficar sem o documento.
if (!r || r.ok !== true) {
  try { await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar', json: true, timeout: 60000,
    body: { number: alvo.number, text: 'Segue o arquivo: ' + a.url, delay: 900 } }); } catch (e) {}
}
return [{ json: { arquivo_enviado: !!(r && r.ok === true), chave: a.chave || null, detalhe: r } }];
