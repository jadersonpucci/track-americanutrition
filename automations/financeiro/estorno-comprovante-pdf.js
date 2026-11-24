// Gerador do PDF do comprovante de devolucao Pix (usado no no "Montar comprovantes" do workflow
// "[Financeiro] Estorno Pix -> comprovante no pedido"). 24/11/2026, pedido do Jaderson: o estorno feito na Shopify
// sai na hora pelo Banco Inter (AN - Estorno Automatico); o comprovante tem que ficar anexado no pedido.
// A API do Inter nao entrega o PDF oficial do app; o extrato completo (/banking/v2/extrato/completo) traz todos os
// campos do comprovante oficial ("Pix recebido devolvido", data, horario, ID, quem recebeu, agencia, conta,
// instituicao, quem pagou). O PDF repete esse conteudo e esse formato, sem a marca do banco, e diz de onde vieram
// os dados.
// PDF escrito a mao (sem biblioteca): Helvetica/Helvetica-Bold com WinAnsiEncoding (acentos em latin1).
function comprovantePdf(t, logo) {
  // logo (opcional): { jpg: Buffer JPEG, w, h } -> logo do Inter no topo (pedido do Jaderson, 24/11)
  // t: { titulo, valor, dataHora (Date em BRT ja ajustada como texto), dia, hora, id, rec: {nome, doc, agencia, conta, inst},
  //      pag: {nome, doc, inst}, pedido, gerado }
  const W = 420, H = 760;
  const esc = (s) => String(s == null ? '' : s).replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\xff]/g, '');
  const ops = [];
  const txt = (x, y, size, bold, s, rgb) => {
    ops.push((rgb || '0.13 0.13 0.13') + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x + ' ' + y + ' Td (' + esc(s) + ') Tj ET');
  };
  // larguras das fontes padrao (AFM, em 1/1000 em) para alinhar a direita
  const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LO = 'abcdefghijklmnopqrstuvwxyz';
  const WN = { up: [667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611],
    lo: [556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500] };
  const WB = { up: [722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611],
    lo: [556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500] };
  const OUT = { ' ': 278, '.': 278, ',': 278, '-': 333, '*': 389, '/': 278, ':': 278, '(': 333, ')': 333, '$': 556 };
  const larg = (s, size, bold) => {
    const tb = bold ? WB : WN; let w = 0;
    for (const ch of String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
      const iu = UP.indexOf(ch), il = LO.indexOf(ch);
      w += iu >= 0 ? tb.up[iu] : il >= 0 ? tb.lo[il] : /[0-9]/.test(ch) ? 556 : (OUT[ch] || 556);
    }
    return w * size / 1000;
  };
  const dir = (y, size, bold, s) => txt(Math.max(150, W - 36 - larg(s, size, bold)), y, size, bold, s);
  const centro = (y, size, bold, s, rgb) => txt(Math.max(20, (W - larg(s, size, bold)) / 2), y, size, bold, s, rgb);
  const tracejado = (y) => ops.push('0.75 0.75 0.75 RG 0.8 w [3 3] 0 d 36 ' + y + ' m ' + (W - 36) + ' ' + y + ' l S [] 0 d');
  const linha = (y, rot, val) => { txt(36, y, 10, false, rot, '0.42 0.42 0.42'); dir(y, 10, true, val); };

  if (logo && logo.jpg) {
    // logo do Inter no topo, 110 pt de largura, centralizado
    const lw = 110, lh = Math.round(110 * logo.h / logo.w * 100) / 100;
    ops.push('q ' + lw + ' 0 0 ' + lh + ' ' + ((W - lw) / 2) + ' ' + (H - 30 - lh) + ' cm /Im1 Do Q');
    centro(H - 76, 8, false, 'Comprovante de devolução Pix', '0.45 0.45 0.45');
  } else {
    centro(H - 52, 11, true, 'America Nutrition', '0.03 0.22 0.56');
    centro(H - 66, 8, false, 'Comprovante de devolução Pix', '0.45 0.45 0.45');
  }
  // circulo verde com check
  const cx = W / 2, cy = H - 120, r = 28, k = 0.5523 * r;
  ops.push('0.11 0.69 0.32 rg ' + (cx + r) + ' ' + cy + ' m ' + (cx + r) + ' ' + (cy + k) + ' ' + (cx + k) + ' ' + (cy + r) + ' ' + cx + ' ' + (cy + r) + ' c '
    + (cx - k) + ' ' + (cy + r) + ' ' + (cx - r) + ' ' + (cy + k) + ' ' + (cx - r) + ' ' + cy + ' c ' + (cx - r) + ' ' + (cy - k) + ' ' + (cx - k) + ' ' + (cy - r) + ' ' + cx + ' ' + (cy - r) + ' c '
    + (cx + k) + ' ' + (cy - r) + ' ' + (cx + r) + ' ' + (cy - k) + ' ' + (cx + r) + ' ' + cy + ' c f');
  ops.push('1 1 1 RG 3.2 w 1 J 1 j ' + (cx - 11) + ' ' + cy + ' m ' + (cx - 3) + ' ' + (cy - 8) + ' l ' + (cx + 12) + ' ' + (cy + 9) + ' l S');
  centro(H - 186, 17, true, t.titulo);
  centro(H - 208, 17, true, t.valor);

  let y = H - 258;
  txt(36, y, 12, true, 'Sobre a transação'); y -= 24;
  linha(y, 'Data da transação', t.dia); y -= 20;
  linha(y, 'Horário', t.hora); y -= 20;
  txt(36, y, 10, false, 'ID da transação', '0.42 0.42 0.42'); y -= 14;
  txt(36, y, 9, true, t.id); y -= 18;
  tracejado(y); y -= 28;
  txt(36, y, 12, true, 'Quem recebeu'); y -= 24;
  linha(y, 'Nome', t.rec.nome); y -= 20;
  linha(y, 'CPF/CNPJ', t.rec.doc); y -= 20;
  if (t.rec.agencia) { linha(y, 'Agência', t.rec.agencia); y -= 20; }
  if (t.rec.conta) { linha(y, 'Número conta', t.rec.conta); y -= 20; }
  linha(y, 'Instituição', t.rec.inst); y -= 18;
  tracejado(y); y -= 28;
  txt(36, y, 12, true, 'Quem pagou'); y -= 24;
  linha(y, 'Nome', t.pag.nome); y -= 20;
  linha(y, 'CPF/CNPJ', t.pag.doc); y -= 20;
  linha(y, 'Instituição', t.pag.inst); y -= 18;
  tracejado(y); y -= 26;
  linha(y, 'Pedido', t.pedido); y -= 26;
  txt(36, y, 7.5, false, 'Emitido pela America Nutrition com dados do extrato oficial do Banco Inter (API do banco).', '0.5 0.5 0.5'); y -= 11;
  txt(36, y, 7.5, false, 'Documento gerado automaticamente em ' + t.gerado + '.', '0.5 0.5 0.5');

  const conteudo = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>'
      + (logo && logo.jpg ? ' /XObject << /Im1 7 0 R >>' : '') + ' >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(conteudo, 'latin1') + ' >>\nstream\n' + conteudo + '\nendstream'
  ];
  if (logo && logo.jpg) objs.push('<< /Type /XObject /Subtype /Image /Width ' + logo.w + ' /Height ' + logo.h
    + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + logo.jpg.length + ' >>\nstream\n'
    + logo.jpg.toString('latin1') + '\nendstream');
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf, 'latin1')); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}

// dados do lancamento do extrato -> campos do comprovante
function camposDoExtrato(tx, pedido) {
  const d = tx.detalhes || {};
  const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const [dt, hr] = String(tx.dataInclusao || tx.dataTransacao || '').split(' ');
  const [a, m, dd] = String(dt).split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, dd)).getUTCDay();
  const mascara = (doc) => { const s = String(doc || '').replace(/\D/g, '');
    if (s.length === 11) return '***.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-**';
    if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return s; };
  const agora = new Date(Date.now() - 3 * 3600e3);
  return {
    titulo: tx.titulo || 'Pix recebido devolvido',
    valor: brl(tx.valor),
    dia: dias[dow] + ', ' + String(dd).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + a,
    hora: String(hr || '').slice(0, 5).replace(':', 'h'),
    id: d.endToEndId || '',
    rec: { nome: d.nomeRecebedor || tx.descricao || '', doc: mascara(d.cpfCnpjRecebedor), agencia: d.agenciaRecebedor || '', conta: d.contaBancariaRecebedor || '', inst: d.nomeEmpresaRecebedor || '' },
    pag: { nome: d.nomePagador || 'AMERICA NUTRITION COMERCIAL LTDA', doc: mascara(d.cpfCnpjPagador || '11298909000194'), inst: d.nomeEmpresaPagador || 'BANCO INTER' },
    pedido: pedido || '',
    gerado: agora.toISOString().slice(8, 10) + '/' + agora.toISOString().slice(5, 7) + '/' + agora.toISOString().slice(0, 4) + ' ' + agora.toISOString().slice(11, 16)
  };
}

if (typeof module !== 'undefined') module.exports = { comprovantePdf, camposDoExtrato };
