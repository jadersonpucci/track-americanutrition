const o = $('Triagem').first().json;
const r = $input.first().json || {};
const b64 = r.base64 || r.media || (r.data && r.data.base64) || '';
const mime = String(r.mimetype || o.mimetype || 'image/jpeg').split(';')[0];
const ehPdf = o.documento === true || mime === 'application/pdf';
let desc = '';
if (b64) {
  try {
    const bloco = ehPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
    const c = await this.helpers.httpRequest({
      method: 'POST', url: 'https://n8n.americanutrition.com/webhook/claude-call', json: true, timeout: 90000,
      body: {
        model: 'claude-haiku-4-5-20251001', max_tokens: ehPdf ? 700 : 400,
        system: 'Voce analisa imagens e PDFs enviados por clientes da America Nutrition no WhatsApp. Descreva de forma objetiva e curta o que ha no arquivo. Se for um comprovante de pagamento (PIX, transferencia, boleto, cartao), extraia: valor, data, horario, nome do pagador, nome do recebedor, banco e identificador da transacao se visivel. Se for receita medica ou pedido de exame, liste medicamentos/suplementos e dosagens prescritas. Se for resultado de exame, liste apenas os itens relevantes com valor e referencia, sem interpretar clinicamente. Se for nota fiscal ou pedido, extraia numero, itens e valor. Se for foto de um produto, identifique o produto e qualquer defeito ou problema visivel. Se for outra coisa, descreva brevemente. Responda apenas com a descricao, sem saudacoes. IMPORTANTE: voce apenas descreve o que ve, nunca confirme que um pagamento foi efetivado, pois comprovantes podem ser forjados.',
        messages: [{ role: 'user', content: [
          bloco,
          { type: 'text', text: 'Legenda enviada pelo cliente: ' + (o.texto || '(sem legenda)') + '. Descreva este ' + (ehPdf ? 'PDF' : 'imagem') + '.' }
        ] }]
      }
    });
    desc = (c.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n').trim();
  } catch (e) { desc = ''; }
}
const rotulo = ehPdf ? ('um PDF' + (o.arquivo ? ' (' + o.arquivo + ')' : '')) : 'uma imagem';
const texto = '[Cliente enviou ' + rotulo + (desc ? ': ' + desc : ' que nao foi possivel analisar') + ']' + (o.texto ? '\nLegenda do cliente: ' + o.texto : '');
return [{ json: { telefone: o.telefone, lid: o.lid, nome: o.nome, msg_id: o.msg_id, tipo: 'imagem', texto: texto } }];
