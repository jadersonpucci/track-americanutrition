// "AN - Boleto Personalizado" (workflow YimLSOs5CJqkrPTz), node "Gerar PDF" (Code).
// GET /webhook/boleto?l=<linha>&n=<nome>&d=<cpf>&p=<pedido>&it=<itens>&end=<endereco>&pdf=1
// Mesmos parametros da pagina HTML, mas devolve um PDF de verdade, UMA folha A4 (binario "data"). O "Responder PDF"
// entrega com Content-Type application/pdf. Tudo sai da propria linha digitavel (valor, vencimento, nosso numero),
// como na pagina; o codigo de conferencia e o mesmo (mesma funcao de hash) e o boleto e registrado em boletos_emitidos.
// O gerador (gerarPdfBoleto) nao usa biblioteca nenhuma: fontes padrao do PDF, logo JPEG embutido, barras I25 em retangulos.
function gerarPdfBoleto(d, logoJpg) {
  const W = 595.28, H = 841.89, M = 36;
  const AZ = [0.027, 0.22, 0.557], VM = [0.678, 0.016, 0.016], VERDE = [0.055, 0.478, 0.29], TINTA = [0.043, 0.07, 0.125], CINZA = [0.42, 0.46, 0.53], LINHA = [0.85, 0.87, 0.92];
  const ops = [];
  const num = n => (Math.round(n * 100) / 100).toString();
  const lat = s => String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/[^\x00-\xFF]/g, '?');
  const esc = s => lat(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const Y = y => H - y;
  const col = (c, fill) => ops.push(c.map(num).join(' ') + (fill ? ' rg' : ' RG'));
  // largura aproximada Helvetica (AFM, /1000): so o que as caixas alinhadas a direita usam
  const HW = { ' ': 278, ',': 278, '.': 278, '/': 278, ':': 278, '-': 333, '$': 556, 'R': 722, '#': 556, 'D': 722, 'A': 722, 'N': 722 };
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
  const brl = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const linha = String(d.linha || '').replace(/\D/g, '');
  const linhaFmt = linha.length === 47 ? linha.slice(0, 5) + '.' + linha.slice(5, 10) + '  ' + linha.slice(10, 15) + '.' + linha.slice(15, 21) + '  ' + linha.slice(21, 26) + '.' + linha.slice(26, 32) + '  ' + linha.slice(32, 33) + '  ' + linha.slice(33) : linha;

  // ---- cabecalho
  const logoH = 36, logoW = logoH * (d.logoW && d.logoH ? d.logoW / d.logoH : 4.776);
  if (logoJpg) ops.push('q ' + num(logoW) + ' 0 0 ' + num(logoH) + ' ' + num(M) + ' ' + num(Y(30 + logoH)) + ' cm /Im1 Do Q');
  text('F2', 15, W - M, 46, 'BOLETO BANCÁRIO', TINTA, true);
  text('F1', 9.5, W - M, 61, 'Pedido ' + (d.pedido || '-') + '   -   emitido em ' + (d.emissao || ''), CINZA, true);
  rect(M, 78, (W - 2 * M) * 0.58, 3, AZ); rect(M + (W - 2 * M) * 0.58, 78, (W - 2 * M) * 0.42, 3, VM);

  // ---- valor e vencimento (grandes)
  const bw = (W - 2 * M - 14) / 2;
  rect(M, 94, bw, 74, [0.945, 0.98, 0.965]); box(M, 94, bw, 74, VERDE, 1.2);
  text('F1', 9, M + 14, 112, 'VALOR A PAGAR', [0.09, 0.4, 0.26]);
  text('F2', 30, M + 14, 150, brl(d.valor), VERDE);
  rect(M + bw + 14, 94, bw, 74, [0.965, 0.975, 0.99]); box(M + bw + 14, 94, bw, 74, AZ, 1.2);
  text('F1', 9, M + bw + 28, 112, 'PAGAR ATÉ O DIA', AZ);
  text('F2', 30, M + bw + 28, 150, d.vencimento || '', AZ);

  // ---- pagador
  let y = 186;
  text('F1', 8.5, M, y, 'PAGADOR', CINZA); y += 16;
  text('F2', 13, M, y, d.nome || '', TINTA); y += 15;
  if (d.doc) { text('F1', 10.5, M, y, 'CPF/CNPJ ' + d.doc, TINTA); y += 14; }
  if (d.endereco) { text('F1', 10.5, M, y, d.endereco, TINTA); y += 14; }
  line(M, y + 4, W - M, y + 4, LINHA, 0.8); y += 20;

  // ---- itens
  text('F1', 8.5, M, y, 'O QUE VOCÊ ESTÁ PAGANDO', CINZA); y += 8;
  const itens = Array.isArray(d.itens) ? d.itens : [];
  for (const it of itens.slice(0, 6)) {
    y += 16;
    text('F1', 11.5, M, y, it.nome, TINTA);
    if (it.valor != null && it.valor !== '') text('F2', 11.5, W - M, y, brl(it.valor), TINTA, true);
    line(M, y + 5, W - M, y + 5, LINHA, 0.5, true);
  }
  y += 20;
  text('F2', 12.5, M, y, 'TOTAL', TINTA);
  text('F2', 14, W - M, y, brl(d.valor), TINTA, true);
  y += 22;

  // ---- como pagar
  const cy = y;
  rect(M, cy, W - 2 * M, 96, [0.957, 0.973, 0.996]); box(M, cy, W - 2 * M, 96, [0.79, 0.85, 0.96], 0.8);
  text('F2', 11, M + 14, cy + 20, 'COMO PAGAR (é fácil):', AZ);
  text('F1', 11.5, M + 14, cy + 40, '1.  Abra o aplicativo do seu banco e toque em "Pagar boleto" ou "Código de barras".', TINTA);
  text('F1', 11.5, M + 14, cy + 57, '2.  Aponte a câmera para o código de barras no fim desta folha, ou digite os números abaixo.', TINTA);
  text('F1', 11.5, M + 14, cy + 74, '3.  Confirme o pagamento. Quando o banco avisar, seu pedido é separado e enviado.', TINTA);
  text('F1', 9.5, M + 14, cy + 89, 'Também pode pagar em qualquer banco ou casa lotérica, até o vencimento.', CINZA);
  y = cy + 96 + 18;

  // ---- linha digitavel
  text('F1', 8.5, M, y, 'NÚMEROS DO BOLETO (para digitar no aplicativo)', CINZA); y += 6;
  rect(M, y, W - 2 * M, 34, [0.97, 0.97, 0.97]); box(M, y, W - 2 * M, 34, LINHA, 0.8);
  text('F3', 13.2, M + 10, y + 22, linhaFmt, TINTA); y += 34 + 16;

  // ---- ficha de compensacao (compacta)
  line(M, y, W - M, y, [0.6, 0.65, 0.75], 0.8, true);
  text('F1', 8, W - M, y - 3, 'corte aqui', CINZA, true); y += 12;
  const fx = M, fw = W - 2 * M;
  const cab = y;
  text('F2', 15, fx, cab + 15, (d.banco || '197') + '-1', TINTA);
  text('F3', 9.4, W - M, cab + 14, linhaFmt.replace(/  /g, ' '), TINTA, true);
  line(fx, cab + 20, W - M, cab + 20, TINTA, 1.4);
  y = cab + 20;
  const rowH = 26;
  const cell = (x, yy, w, rot, val, right, bold) => {
    box(x, yy, w, rowH, [0.2, 0.2, 0.2], 0.5);
    text('F1', 6.2, x + 3, yy + 8, rot, [0.25, 0.25, 0.25]);
    text(bold === false ? 'F1' : 'F2', 9, right ? x + w - 4 : x + 3, yy + 20, val, TINTA, !!right);
  };
  const c5 = fw * 0.28;
  cell(fx, y, fw - c5, 'Local de pagamento', 'Pagável em qualquer banco, aplicativo ou casa lotérica');
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
  cell(fx, y, fw - c5, 'Pagador', (d.nome || '') + (d.doc ? '  -  ' + d.doc : ''));
  cell(fx + fw - c5, y, c5, '(=) Valor cobrado', '', true); y += rowH;
  if (d.endereco) { cell(fx, y, fw, 'Endereço do pagador', d.endereco, false, false); y += rowH; }
  y += 10;

  // ---- codigo de barras I25 (grande)
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
    const bwid = Math.min(fw, 470), unit = bwid / mods, x0 = fx + (fw - bwid) / 2, bh = 58;
    let x = x0;
    col([0, 0, 0], true);
    for (const e of seq) { if (e[1]) ops.push(num(x) + ' ' + num(Y(y + bh)) + ' ' + num(e[0] * unit) + ' ' + num(bh) + ' re f'); x += e[0] * unit; }
    y += bh + 12;
  }
  text('F1', 7.5, fx, y, 'Autenticação mecânica  -  código de conferência ' + (d.codigo || ''), CINZA);
  text('F2', 7.5, W - M, y, 'FICHA DE COMPENSAÇÃO', TINTA, true);
  if (d.urlConf) text('F1', 7.5, fx, y + 11, 'Confira se este boleto é mesmo nosso: ' + d.urlConf, CINZA);

  // ---- monta o PDF
  const content = Buffer.from(ops.join('\n'), 'latin1');
  const objs = [];
  const add = (s) => { objs.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1')); return objs.length; };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(W) + ' ' + num(H) + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >>' + (logoJpg ? ' /XObject << /Im1 8 0 R >>' : '') + ' >> >>');
  add(Buffer.concat([Buffer.from('<< /Length ' + content.length + ' >>\nstream\n', 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  if (logoJpg) add(Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width ' + (d.logoW || 1600) + ' /Height ' + (d.logoH || 335) + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + logoJpg.length + ' >>\nstream\n', 'latin1'), logoJpg, Buffer.from('\nendstream', 'latin1')]));
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
  const SK = 'SUPABASE_SERVICE_KEY';
  const PG = 'https://supabase.americanutrition.com/pg/query';
  const LOGO_JPG = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/logos/logo-america-nutrition-branco.jpg';
  const BASE = 'https://n8n.americanutrition.com/webhook/boleto';
  const sql = async (texto) => { try { const r = await self.helpers.httpRequest({ method: 'POST', url: PG, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: texto }, json: true, timeout: 8000 }); return Array.isArray(r) ? r : []; } catch (e) { return []; } };

  const linha = dig(q.l || q.linha);
  if (linha.length !== 47) return [{ json: { erro: 'linha digitavel invalida' } }];
  const banco = linha.slice(0, 3);
  const c1 = linha.slice(4, 9), c2 = linha.slice(10, 20), c3 = linha.slice(21, 31);
  const dvGeral = linha[32], fator = linha.slice(33, 37), valorRaw = linha.slice(37, 47);
  const barras = banco + linha[3] + dvGeral + fator + valorRaw + c1 + c2 + c3;
  const nossoNumero = (c1 + c2 + c3).slice(-20);
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

  let logo = null;
  try { const b = await self.helpers.httpRequest({ method: 'GET', url: LOGO_JPG, encoding: 'arraybuffer', returnFullResponse: false, timeout: 8000 }); logo = Buffer.from(b); } catch (e) { logo = null; }

  const pdf = gerarPdfBoleto({ linha, barras, nome, doc: docFmt, endereco, pedido, itens, valor: valorNum, vencimento, emissao, codigo: COD, urlConf: BASE.replace('https://', '') + '?c=' + COD, beneficiario: 'Pagar.me Pagamentos S/A', cnpj: '18.727.053/0001-74', agencia: '0001 / 1617898', nossoNumero, banco, logoW: 1600, logoH: 335 }, logo);
  const filename = 'Boleto-America-Nutrition' + (pedido ? '-' + pedido.replace(/[^A-Za-z0-9-]/g, '') : '') + '.pdf';
  return [{ json: { pdf: true, filename, codigo: COD, valor: valorNum, vencimento }, binary: { data: await self.helpers.prepareBinaryData(pdf, filename, 'application/pdf') } }];
}
if (typeof $input !== 'undefined') return __n8n();
