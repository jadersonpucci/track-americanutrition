// "AN - Boleto Personalizado" (workflow YimLSOs5CJqkrPTz), node "Gerar PDF" (Code).
// GET /webhook/boleto?l=<linha>&n=<nome>&d=<cpf>&p=<pedido>&it=<itens>&end=<endereco>&pdf=1
// Mesmos parametros da pagina HTML, mas devolve um PDF de verdade, UMA folha A4 (binario "data"). O "Responder PDF"
// entrega com Content-Type application/pdf. Tudo sai da propria linha digitavel (valor, vencimento, nosso numero),
// como na pagina; o codigo de conferencia e o mesmo (mesma funcao de hash) e o boleto e registrado em boletos_emitidos.
// O gerador (gerarPdfBoleto) nao usa biblioteca nenhuma: fontes padrao do PDF, logos JPEG embutidos (marca e banco
// liquidante: Stone 197 ou Inter 077), barras I25 em retangulos. No modo Inter (bolepix) entra o QR Code PIX
// (d.pix = copia e cola; d.qrFn = qrcode-generator, embutido no no) na caixa "Como pagar".
function gerarPdfBoleto(d, logoJpg, bancoJpg) {
  const W = 595.28, H = 841.89, M = 36;
  const AZ = [0.027, 0.22, 0.557], VM = [0.678, 0.016, 0.016], VERDE = [0.055, 0.478, 0.29], TINTA = [0.043, 0.07, 0.125], CINZA = [0.42, 0.46, 0.53], LINHA = [0.85, 0.87, 0.92];
  const ops = [];
  const num = n => (Math.round(n * 100) / 100).toString();
  const lat = s => String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/[^\x00-\xFF]/g, '?');
  const esc = s => lat(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const Y = y => H - y;
  const col = (c, fill) => ops.push(c.map(num).join(' ') + (fill ? ' rg' : ' RG'));
  // largura aproximada Helvetica (AFM, /1000): so o que as caixas alinhadas a direita usam
  const HW = { ' ': 278, ',': 278, '.': 278, '/': 278, ':': 278, '-': 333, '$': 556, 'R': 722, '#': 556, 'D': 722, 'A': 722, 'N': 722, 'B': 722, 'O': 778, 'L': 611, 'E': 667, 'T': 611, 'C': 722, 'I': 278, 'P': 667, 'S': 667, 'M': 833, 'F': 611, 'H': 722, 'V': 667, 'Q': 778, 'U': 722, 'G': 778, 'K': 722, 'J': 556, 'W': 944, 'X': 667, 'Y': 667, 'Z': 611, 'a': 556, 'e': 556, 'i': 278, 'o': 611, 'r': 389, 't': 333, 'd': 611, 'm': 889, 'n': 611, 'u': 611, 's': 556, 'c': 556, 'l': 278, 'p': 611, 'v': 556, 'f': 333, 'g': 611, 'h': 611, 'b': 611, 'q': 611, 'x': 556, 'z': 500, 'k': 556, 'j': 278, 'w': 778, 'y': 556 };
  const wHelv = (s, size, bold) => lat(s).split('').reduce((a, ch) => a + (HW[ch] || (/[0-9]/.test(ch) ? 556 : (bold ? 610 : 556))), 0) / 1000 * size;
  const text = (font, size, x, y, s, c, right) => {
    if (c) col(c, true);
    let xx = x;
    if (right) xx = x - (font === 'F3' ? lat(s).length * 0.6 * size : wHelv(s, size, font === 'F2'));
    ops.push('BT /' + font + ' ' + num(size) + ' Tf ' + num(xx) + ' ' + num(Y(y)) + ' Td (' + esc(s) + ') Tj ET');
  };
  const rect = (x, y, w, h, c) => { col(c, true); ops.push(num(x) + ' ' + num(Y(y + h)) + ' ' + num(w) + ' ' + num(h) + ' re f'); };
  const box = (x, y, w, h, c, lw) => { col(c, false); ops.push(num(lw || 0.8) + ' w ' + num(x) + ' ' + num(Y(y + h)) + ' ' + num(w) + ' ' + num(h) + ' re S'); };
  const line = (x1, y1, x2, y2, c, lw, dash) => { col(c, false); ops.push((dash ? '[3 3] 0 d ' : '[] 0 d ') + num(lw || 0.8) + ' w ' + num(x1) + ' ' + num(Y(y1)) + ' m ' + num(x2) + ' ' + num(Y(y2)) + ' l S'); };
  // retangulo de cantos arredondados (Bezier, kappa 0.5523); fill e/ou stroke
  const rrect = (x, y, w, h, r, fill, stroke, lw) => {
    const k = 0.5523 * r, x2 = x + w, yb = Y(y + h), yt = Y(y);
    const path = num(x + r) + ' ' + num(yb) + ' m ' + num(x2 - r) + ' ' + num(yb) + ' l '
      + num(x2 - r + k) + ' ' + num(yb) + ' ' + num(x2) + ' ' + num(yb + r - k) + ' ' + num(x2) + ' ' + num(yb + r) + ' c '
      + num(x2) + ' ' + num(yt - r) + ' l ' + num(x2) + ' ' + num(yt - r + k) + ' ' + num(x2 - r + k) + ' ' + num(yt) + ' ' + num(x2 - r) + ' ' + num(yt) + ' c '
      + num(x + r) + ' ' + num(yt) + ' l ' + num(x + r - k) + ' ' + num(yt) + ' ' + num(x) + ' ' + num(yt - r + k) + ' ' + num(x) + ' ' + num(yt - r) + ' c '
      + num(x) + ' ' + num(yb + r) + ' l ' + num(x) + ' ' + num(yb + r - k) + ' ' + num(x + r - k) + ' ' + num(yb) + ' ' + num(x + r) + ' ' + num(yb) + ' c h';
    if (fill) col(fill, true);
    if (stroke) { col(stroke, false); ops.push(num(lw || 0.8) + ' w'); }
    ops.push(path + ' ' + (fill && stroke ? 'B' : (fill ? 'f' : 'S')));
  };
  // corta o texto para caber na largura (nada estoura a caixa)
  const larg = (s, font, size) => font === 'F3' ? lat(s).length * 0.6 * size : wHelv(s, size, font === 'F2');
  const fit = (s, font, size, maxW) => { let t = lat(s); if (larg(t, font, size) <= maxW) return t; while (t.length > 1 && larg(t + '...', font, size) > maxW) t = t.slice(0, -1); return t.trim() + '...'; };
  const img = (nome, x, y, w, h) => ops.push('q ' + num(w) + ' 0 0 ' + num(h) + ' ' + num(x) + ' ' + num(Y(y + h)) + ' cm /' + nome + ' Do Q');
  const brl = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const linha = String(d.linha || '').replace(/\D/g, '');
  const linhaFmt = linha.length === 47 ? linha.slice(0, 5) + '.' + linha.slice(5, 10) + ' ' + linha.slice(10, 15) + '.' + linha.slice(15, 21) + ' ' + linha.slice(21, 26) + '.' + linha.slice(26, 32) + ' ' + linha.slice(32, 33) + ' ' + linha.slice(33) : linha;
  const fw = W - 2 * M;

  // ---- cabecalho: logo da marca, titulo, pedido e emissao
  const logoH = 28, logoW = logoH * (d.logoW && d.logoH ? d.logoW / d.logoH : 4.776);
  if (logoJpg) img('Im1', M, 34, logoW, logoH);
  text('F2', 12.5, W - M, 46, 'BOLETO BANCÁRIO', TINTA, true);
  text('F1', 9, W - M, 60, fit('Pedido ' + (d.pedido || '-') + '   -   emitido em ' + (d.emissao || ''), 'F1', 9, fw - 170), CINZA, true);
  rect(M, 74, fw * 0.58, 2.5, AZ); rect(M + fw * 0.58, 74, fw * 0.42, 2.5, VM);

  // ---- pagador, vencimento e valor (proporcoes da pagina HTML)
  const wrap = (txt, size, maxW) => { const out = []; let cur = ''; for (const w of lat(txt).split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (wHelv(t, size) > maxW && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; };
  let y = 90;
  const wVenc = 122, wVal = 150, wPag = fw - wVenc - wVal - 20;
  const endLinhas = d.endereco ? wrap(d.endereco, 8.8, wPag - 20).slice(0, 2) : [];
  const hCx = 58 + (endLinhas.length ? 12 * endLinhas.length : 0);
  rrect(M, y, wPag, hCx, 8, null, LINHA, 0.8);
  text('F1', 7.5, M + 10, y + 15, 'PAGADOR', CINZA);
  text('F2', 11.5, M + 10, y + 31, fit(d.nome || '', 'F2', 11.5, wPag - 20), TINTA);
  text('F1', 8.8, M + 10, y + 44, fit(d.doc ? 'CPF/CNPJ ' + d.doc : '', 'F1', 8.8, wPag - 20), CINZA);
  endLinhas.forEach((l, i) => text('F1', 8.8, M + 10, y + 56 + 12 * i, fit(l, 'F1', 8.8, wPag - 20), CINZA));
  const xV = M + wPag + 10;
  rrect(xV, y, wVenc, hCx, 8, null, LINHA, 0.8);
  text('F1', 7.5, xV + 10, y + 15, 'VENCIMENTO', CINZA);
  text('F2', 15, xV + 10, y + 36, d.vencimento || '', TINTA);
  text('F1', 8.5, xV + 10, y + 49, 'pague até esta data', CINZA);
  const xVa = xV + wVenc + 10;
  rrect(xVa, y, wVal, hCx, 8, [0.945, 0.98, 0.965], VERDE, 1);
  text('F1', 7.5, xVa + 10, y + 15, 'VALOR DO DOCUMENTO', [0.09, 0.4, 0.26]);
  text('F2', larg(brl(d.valor), 'F2', 19) > wVal - 20 ? 15 : 19, xVa + 10, y + 38, brl(d.valor), VERDE);
  const itensTodos = Array.isArray(d.itens) ? d.itens : [];
  const itens = itensTodos.length > 6 ? itensTodos.slice(0, 5).concat([{ nome: 'e mais ' + (itensTodos.length - 5) + ' itens', valor: null }]) : itensTodos;
  text('F1', 8.5, xVa + 10, y + 50, fit(itensTodos.length > 1 ? itensTodos.length + ' itens' : (itensTodos[0] ? itensTodos[0].nome : ''), 'F1', 8.5, wVal - 20), CINZA);
  y += hCx + 16;

  // ---- itens do pedido
  rrect(M, y, fw, 24 + itens.length * 16 + 26, 8, null, LINHA, 0.8);
  text('F1', 7.5, M + 10, y + 15, 'ITENS DO PEDIDO', CINZA);
  let yy = y + 18;
  for (const it of itens) {
    yy += 16;
    const temValor = it.valor != null && it.valor !== '';
    text('F1', 10.5, M + 10, yy, fit(it.nome, 'F1', 10.5, fw - 20 - (temValor ? larg(brl(it.valor), 'F2', 10.5) + 14 : 0)), TINTA);
    if (temValor) text('F2', 10.5, W - M - 10, yy, brl(it.valor), TINTA, true);
    line(M + 10, yy + 4, W - M - 10, yy + 4, LINHA, 0.5, true);
  }
  yy += 19;
  text('F2', 11, M + 10, yy, 'Total do documento', TINTA);
  text('F2', 11.5, W - M - 10, yy, brl(d.valor), TINTA, true);
  y = yy + 22;

  // ---- como pagar (curto). Com PIX (bolepix do Inter): QR Code a direita e os dois jeitos de pagar
  let qrMod = null;
  if (d.pix && typeof d.qrFn === 'function') { try { const q = d.qrFn(0, 'M'); q.addData(String(d.pix), 'Byte'); q.make(); qrMod = q; } catch (e) { qrMod = null; } }
  if (qrMod) {
    const qrS = 84, boxH = 104, xq = W - M - 10 - qrS, tw = fw - 20 - qrS - 14;
    rrect(M, y, fw, boxH, 8, [0.949, 0.984, 0.98], [0.196, 0.737, 0.678], 0.8);
    text('F2', 9.5, M + 10, y + 15, 'COMO PAGAR: PIX (NA HORA) OU BOLETO', [0.106, 0.498, 0.455]);
    const l1 = wrap('PIX: no app do seu banco escolha Pix > Ler QR Code e aponte para o código ao lado. Aprovação imediata, mesmo valor do boleto.', 9.2, tw).slice(0, 2);
    const l2 = wrap('BOLETO: toque em "Pagar boleto" e leia o código de barras, ou digite a linha digitável abaixo. Compensa em até 2 dias úteis.', 9.2, tw).slice(0, 2);
    const l3 = wrap('Assim que o pagamento cair, seu pedido é separado e o rastreio chega no WhatsApp.', 9.2, tw).slice(0, 1);
    let ty = y + 29;
    for (const l of l1) { text('F1', 9.2, M + 10, ty, l, TINTA); ty += 12; }
    ty += 2;
    for (const l of l2) { text('F1', 9.2, M + 10, ty, l, TINTA); ty += 12; }
    ty += 2;
    for (const l of l3) { text('F1', 9.2, M + 10, ty, l, CINZA); ty += 12; }
    // QR em retangulos
    const n = qrMod.getModuleCount(), m = qrS / n, yq = y + (boxH - qrS) / 2;
    rect(xq - 4, yq - 4, qrS + 8, qrS + 8, [1, 1, 1]);
    col([0, 0, 0], true);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qrMod.isDark(r, c)) ops.push(num(xq + c * m) + ' ' + num(Y(yq + r * m + m)) + ' ' + num(m) + ' ' + num(m) + ' re f');
    y += boxH + 14;
  } else {
    rrect(M, y, fw, 62, 8, [0.957, 0.973, 0.996], [0.79, 0.85, 0.96], 0.8);
    text('F2', 9.5, M + 10, y + 15, 'COMO PAGAR', AZ);
    text('F1', 9.5, M + 10, y + 29, fit('1. No aplicativo do seu banco, toque em "Pagar boleto" e aponte a câmera para o código de barras, ou digite os números abaixo.', 'F1', 9.5, fw - 20), TINTA);
    text('F1', 9.5, M + 10, y + 42, fit('2. Pode pagar também em qualquer banco ou casa lotérica, até o vencimento.', 'F1', 9.5, fw - 20), TINTA);
    text('F1', 9.5, M + 10, y + 55, fit('3. Quando o banco confirmar (até 2 dias úteis), seu pedido é separado e o rastreio chega no WhatsApp.', 'F1', 9.5, fw - 20), TINTA);
    y += 62 + 14;
  }

  // ---- linha digitavel
  text('F1', 7.5, M, y, 'LINHA DIGITÁVEL (para digitar no aplicativo do banco)', CINZA); y += 5;
  rrect(M, y, fw, 30, 8, [0.97, 0.97, 0.97], LINHA, 0.8);
  text('F3', 12.4, M + (fw - linhaFmt.length * 0.6 * 12.4) / 2, y + 20, linhaFmt, TINTA); y += 30 + 14;

  // ---- corte e ficha de compensacao
  line(M, y, W - M, y, [0.6, 0.65, 0.75], 0.8, true);
  text('F1', 7.5, W - M, y - 3, 'corte aqui', CINZA, true); y += 10;
  const fx = M;
  const cab = y;
  const stH = 20, stW = stH * (d.bancoW && d.bancoH ? d.bancoW / d.bancoH : 3.59);
  let xs = fx;
  if (bancoJpg) { img('Im2', fx, cab + 2, stW, stH); xs = fx + stW + 8; }
  line(xs, cab, xs, cab + 24, TINTA, 1.2);
  const bancoDv = d.bancoDv || ((d.banco || '197') + '-1');
  text('F2', 14, xs + 6, cab + 18, bancoDv, TINTA);
  line(xs + 6 + wHelv(bancoDv, 14, true) + 6, cab, xs + 6 + wHelv(bancoDv, 14, true) + 6, cab + 24, TINTA, 1.2);
  text('F3', 9, W - M, cab + 17, linhaFmt, TINTA, true);
  line(fx, cab + 26, W - M, cab + 26, TINTA, 1.4);
  y = cab + 26;
  const rowH = 25;
  const cell = (x, yy2, w, rot, val, right, bold) => {
    box(x, yy2, w, rowH, [0.2, 0.2, 0.2], 0.5);
    text('F1', 6, x + 3, yy2 + 8, rot, [0.25, 0.25, 0.25]);
    const f = bold === false ? 'F1' : 'F2';
    text(f, 8.6, right ? x + w - 4 : x + 3, yy2 + 19, fit(val, f, 8.6, w - 7), TINTA, !!right);
  };
  const c5 = fw * 0.28;
  cell(fx, y, fw - c5, 'Local de pagamento', 'Pagável em qualquer banco, aplicativo ou casa lotérica' + (qrMod ? '  -  ou por PIX (QR Code acima)' : ''));
  cell(fx + fw - c5, y, c5, 'Vencimento', d.vencimento || '', true); y += rowH;
  cell(fx, y, fw - c5, 'Beneficiário', (d.beneficiario || '') + '  -  CNPJ ' + (d.cnpj || ''));
  cell(fx + fw - c5, y, c5, 'Agência / Código do beneficiário', d.agencia || '', true); y += rowH;
  const c1 = (fw - c5) / 4;
  cell(fx, y, c1, 'Data do documento', d.emissao || '');
  cell(fx + c1, y, c1, 'Nº do documento', d.pedido || '');
  cell(fx + 2 * c1, y, c1, 'Espécie doc.', 'DM');
  cell(fx + 3 * c1, y, c1, 'Aceite', 'N');
  cell(fx + fw - c5, y, c5, 'Nosso número', d.nossoNumero || '', true); y += rowH;
  cell(fx, y, c1, 'Uso do banco', d.codigo || '');
  cell(fx + c1, y, c1, 'Carteira', '1');
  cell(fx + 2 * c1, y, c1, 'Espécie', 'R$');
  cell(fx + 3 * c1, y, c1, 'Quantidade', '');
  cell(fx + fw - c5, y, c5, '(=) Valor do documento', Number(d.valor || 0).toFixed(2).replace('.', ','), true); y += rowH;
  // instrucoes (2 linhas) + descontos / juros
  box(fx, y, fw - c5, rowH * 2, [0.2, 0.2, 0.2], 0.5);
  text('F1', 6, fx + 3, y + 8, 'Instruções (texto de responsabilidade do beneficiário)', [0.25, 0.25, 0.25]);
  text('F1', 8.6, fx + 3, y + 21, fit('Pedido ' + (d.pedido || '') + '  -  America Nutrition' + (itensTodos.length ? '  -  ' + (itensTodos.length > 1 ? itensTodos.length + ' itens' : itensTodos[0].nome) : ''), 'F1', 8.6, fw - c5 - 7), TINTA);
  text('F1', 8.6, fx + 3, y + 34, fit('Confira este documento com o código ' + (d.codigo || '') + '. Não receber após o vencimento.', 'F1', 8.6, fw - c5 - 7), TINTA);
  if (qrMod) text('F1', 8.6, fx + 3, y + 46, fit('Aceita também pagamento por PIX (QR Code neste documento).', 'F1', 8.6, fw - c5 - 7), TINTA);
  cell(fx + fw - c5, y, c5, '(-) Descontos / Abatimentos', '', true); 
  cell(fx + fw - c5, y + rowH, c5, '(+) Juros / Multa', '', true); y += rowH * 2;
  cell(fx, y, fw - c5, 'Pagador', (d.nome || '') + (d.doc ? '  -  ' + d.doc : ''));
  cell(fx + fw - c5, y, c5, '(=) Valor cobrado', '', true); y += rowH;
  if (d.endereco) { cell(fx, y, fw, 'Endereço do pagador', d.endereco, false, false); y += rowH; }
  y += 10;

  // ---- codigo de barras I25
  const barras = String(d.barras || '').replace(/\D/g, '');
  if (barras.length === 44) {
    const P = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
    const seq = []; // [largura em modulos, preto?]
    seq.push([1, 1], [1, 0], [1, 1], [1, 0]);
    for (let i = 0; i < 44; i += 2) {
      const a = P[+barras[i]], b = P[+barras[i + 1]];
      for (let k = 0; k < 5; k++) { seq.push([a[k] === 'w' ? 3 : 1, 1]); seq.push([b[k] === 'w' ? 3 : 1, 0]); }
    }
    seq.push([3, 1], [1, 0], [1, 1]);
    const mods = seq.reduce((s, e) => s + e[0], 0);
    const bwid = Math.min(fw, 440), unit = bwid / mods, x0 = fx, bh = 54;
    let x = x0;
    col([0, 0, 0], true);
    for (const e of seq) { if (e[1]) ops.push(num(x) + ' ' + num(Y(y + bh)) + ' ' + num(e[0] * unit) + ' ' + num(bh) + ' re f'); x += e[0] * unit; }
    y += bh + 12;
  }
  text('F1', 7, fx, y, fit('Código de conferência ' + (d.codigo || '') + (d.urlConf ? '  -  confira se este boleto é nosso em ' + d.urlConf : ''), 'F1', 7, fw - 110), CINZA);
  text('F2', 7, W - M, y, 'FICHA DE COMPENSAÇÃO', TINTA, true);

  // ---- monta o PDF
  const content = Buffer.from(ops.join('\n'), 'latin1');
  const objs = [];
  const add = (s) => { objs.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1')); return objs.length; };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const xo = [];
  if (logoJpg) xo.push('/Im1 8 0 R');
  if (bancoJpg) xo.push('/Im2 ' + (logoJpg ? 9 : 8) + ' 0 R');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(W) + ' ' + num(H) + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >>' + (xo.length ? ' /XObject << ' + xo.join(' ') + ' >>' : '') + ' >> >>');
  add(Buffer.concat([Buffer.from('<< /Length ' + content.length + ' >>\nstream\n', 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  const jpeg = (buf, w, h) => Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + buf.length + ' >>\nstream\n', 'latin1'), buf, Buffer.from('\nendstream', 'latin1')]);
  if (logoJpg) add(jpeg(logoJpg, d.logoW || 1600, d.logoH || 335));
  if (bancoJpg) add(jpeg(bancoJpg, d.bancoW || 140, d.bancoH || 39));
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n', 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(b); pos += b.length;
  });
  const xref = pos;
  let x = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (const o of offsets) x += String(o).padStart(10, '0') + ' 00000 n \n';
  x += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  parts.push(Buffer.from(x, 'latin1'));
  return Buffer.concat(parts);
}
if (typeof module !== 'undefined' && module.exports) module.exports = gerarPdfBoleto;

// Parte que so roda dentro do n8n (Code node executa como funcao async; o return abaixo e valido la).
const __self = this;
async function __n8n() {
  const self = __self;
  const q = ($input.first().json.query) || {};
  const so = s => String(s == null ? '' : s);
  const dig = s => so(s).replace(/[^0-9]/g, '');
  const esq = s => so(s).replace(/'/g, "''");
  const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
  const PG = 'https://supabase.americanutrition.com/pg/query';
  const LOGO_JPG = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/logos/logo-america-nutrition-branco.jpg';
  const STONE_JPG = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/logos/banco-stone-197-branco.jpg';
  const INTER_JPG = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/logos/20260919-ife4wh99.jpg';
  const DV_BANCO = { '077': '9', '197': '1', '341': '7', '001': '9', '237': '2', '033': '7', '104': '0' };
  const BASE = 'https://n8n.americanutrition.com/webhook/boleto';
  const sql = async (texto) => { try { const r = await self.helpers.httpRequest({ method: 'POST', url: PG, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: texto }, json: true, timeout: 8000 }); return Array.isArray(r) ? r : []; } catch (e) { return []; } };

  const linha = dig(q.l || q.linha);
  if (linha.length !== 47) return [{ json: { erro: 'linha digitavel invalida' } }];
  const banco = linha.slice(0, 3);
  const c1 = linha.slice(4, 9), c2 = linha.slice(10, 20), c3 = linha.slice(21, 31);
  const dvGeral = linha[32], fator = linha.slice(33, 37), valorRaw = linha.slice(37, 47);
  const barras = banco + linha[3] + dvGeral + fator + valorRaw + c1 + c2 + c3;
  const nossoNumeroLinha = (c1 + c2 + c3).slice(-20);
  const n = parseInt(fator, 10), dia = 86400000;
  const dVenc = n >= 1000 && n < 5000 && new Date(Date.UTC(2025, 1, 22) + (n - 1000) * dia) > new Date(Date.UTC(2025, 1, 21)) ? new Date(Date.UTC(2025, 1, 22) + (n - 1000) * dia) : new Date(Date.UTC(1997, 9, 7) + n * dia);
  const iso = dVenc.toISOString().slice(0, 10);
  const vencimento = iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const valorNum = parseInt(valorRaw, 10) / 100;
  // mesmo codigo de conferencia da pagina HTML (mesma funcao)
  function codigoDe(l) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < l.length; i++) { h1 = ((h1 ^ l.charCodeAt(i)) * 16777619) >>> 0; h2 = ((h2 + l.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0; }
    const AB = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let out = '', n1 = h1, n2 = h2;
    for (let i = 0; i < 4; i++) { out += AB[n1 % 32]; n1 = Math.floor(n1 / 32); }
    for (let i = 0; i < 4; i++) { out += AB[n2 % 32]; n2 = Math.floor(n2 / 32); }
    return out;
  }
  const COD = codigoDe(linha);
  const nome = so(q.n || q.nome || 'Pagador').slice(0, 80);
  const docCli = dig(q.d || q.doc);
  const docFmt = docCli.length === 11 ? docCli.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (docCli.length === 14 ? docCli.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : docCli);
  const pedido = so(q.p || q.pedido || '').slice(0, 40);
  const endereco = so(q.end || '').slice(0, 160);
  const itensTxt = so(q.it || q.itens || '');
  const itens = itensTxt.split('|').map(t => { const p = t.split('='); return { nome: so(p[0]).trim().slice(0, 70), valor: p[1] != null && so(p[1]).trim() !== '' ? Number(so(p[1]).replace(/\./g, '').replace(',', '.')) : null }; }).filter(x => x.nome);
  const hoje = new Date(Date.now() - 3 * 3600000);
  const emissao = String(hoje.getUTCDate()).padStart(2, '0') + '/' + String(hoje.getUTCMonth() + 1).padStart(2, '0') + '/' + hoje.getUTCFullYear();

  await sql("INSERT INTO boletos_emitidos (codigo, linha, pedido, nome, documento, valor, vencimento, itens) VALUES ('" + esq(COD) + "','" + esq(linha) + "','" + esq(pedido) + "','" + esq(nome) + "','" + esq(docCli) + "'," + valorNum + ",'" + iso + "','" + esq(itensTxt) + "') ON CONFLICT (codigo) DO NOTHING;");

  const baixar = async (url) => { try { const b = await self.helpers.httpRequest({ method: 'GET', url, encoding: 'arraybuffer', returnFullResponse: false, timeout: 8000 }); return Buffer.from(b); } catch (e) { return null; } };
  // modo Inter (bolepix): nosso numero e PIX de checkout_boleto_inter, pela linha digitavel (fallbacks &nn= e &pix=)
  let regInter = null;
  if (banco === '077') { const l = linha; const r = await sql("SELECT codigo_solicitacao, nosso_numero, pix_copia_cola, status, pedido_shopify, (confirmado_em IS NOT NULL) AS pago, to_char(coalesce(pago_em, confirmado_em) AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS pago_em FROM checkout_boleto_inter WHERE linha_digitavel='" + esq(l) + "' ORDER BY criado_em DESC LIMIT 1;"); regInter = (r && r[0]) ? r[0] : null; }
  const inter = !!regInter || String(q.b || '') === 'inter' || banco === '077';
  const nossoNumero = inter ? (so((regInter && regInter.nosso_numero) || q.nn || '').trim() || nossoNumeroLinha) : nossoNumeroLinha;
  const pixCopia = inter ? so((regInter && regInter.pix_copia_cola) || q.pix || '').trim() : '';
  const logo = await baixar(LOGO_JPG);
  const stone = await baixar(inter ? INTER_JPG : STONE_JPG);

  let urlConfCurta = BASE + '?c=' + COD;
  try {
    const sdc = $getWorkflowStaticData('global'); sdc.curtos = sdc.curtos || {};
    if (sdc.curtos[COD]) { urlConfCurta = sdc.curtos[COD]; }
    else {
      const enc = await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/encurtar-url', json: true, timeout: 8000, body: { url: BASE + '?c=' + COD } });
      if (enc && enc.shortLink && /^https?:\/\//.test(String(enc.shortLink))) { urlConfCurta = String(enc.shortLink); sdc.curtos[COD] = urlConfCurta; }
    }
  } catch (e) {}
  const pdf = gerarPdfBoleto({ linha, barras, nome, doc: docFmt, endereco, pedido, itens, valor: valorNum, vencimento, emissao, codigo: COD, urlConf: urlConfCurta.replace(/^https?:\/\//, ''), beneficiario: inter ? 'AMERICA NUTRITION COMERCIAL LTDA' : 'Pagar.me Pagamentos S/A', cnpj: inter ? '11.298.909/0001-94' : '18.727.053/0001-74', agencia: inter ? '00019 / 305653768' : '0001 / 1617898', nossoNumero, banco, bancoDv: banco + '-' + (DV_BANCO[banco] || dvGeral), pix: pixCopia, qrFn: (typeof qrcode === 'function') ? qrcode : null, logoW: 1600, logoH: 335, bancoW: inter ? 400 : 140, bancoH: inter ? 102 : 39 }, logo, stone);
  const filename = 'Boleto-America-Nutrition' + (pedido ? '-' + pedido.replace(/[^A-Za-z0-9-]/g, '') : '') + '.pdf';
  return [{ json: { pdf: true, filename, codigo: COD, valor: valorNum, vencimento }, binary: { data: await self.helpers.prepareBinaryData(pdf, filename, 'application/pdf') } }];
}
if (typeof $input !== 'undefined') return __n8n();
