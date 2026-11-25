// Boleto bancário: linha digitável, código de barras (ITF, "2 de 5 intercalado"),
// valor e vencimento embutidos, leitura do PDF anexado e o modal de pagamento.
import { modal, h, icon, toast, copy } from './ui.js';
import { esc, money, fmtDate } from './utils.js';
import { db } from './db.js';
import { qrDataUrl } from './pix.js';

const LEITOR_URL = 'https://n8n.americanutrition.com/webhook/financeiro-boleto';

export const soDigitos = s => String(s || '').replace(/\D/g, '');
export const ehLinha = s => { const d = soDigitos(s); return (d.length === 47 || d.length === 48) && validarLinha(d); };
export const ehPix = s => { const t = String(s || '').trim(); return /^000201/.test(t) && /6304[0-9A-Fa-f]{4}$/.test(t); };

// Dígito verificador módulo 10 (campos da linha digitável)
function mod10(s) {
  let soma = 0, peso = 2;
  for (let i = s.length - 1; i >= 0; i--) { let p = Number(s[i]) * peso; if (p > 9) p -= 9; soma += p; peso = peso === 2 ? 1 : 2; }
  return (10 - (soma % 10)) % 10;
}
// Dígito verificador geral do código de barras (módulo 11, pesos 2..9)
function mod11(s) {
  let soma = 0, peso = 2;
  for (let i = s.length - 1; i >= 0; i--) { soma += Number(s[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = 11 - (soma % 11);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
}
// Arrecadação/convênio (48 dígitos, começa com 8): DV por bloco, módulo 10 ou 11 conforme o 3º dígito
function mod11Arrec(s) { let soma = 0, peso = 2; for (let i = s.length - 1; i >= 0; i--) { soma += Number(s[i]) * peso; peso = peso === 9 ? 2 : peso + 1; } const r = soma % 11; return r === 0 || r === 1 ? 0 : 11 - r; }

export function validarLinha(d) {
  if (d.length === 47) {
    const c1 = d.slice(0, 10), c2 = d.slice(10, 21), c3 = d.slice(21, 32);
    if (mod10(c1.slice(0, 9)) !== Number(c1[9]) || mod10(c2.slice(0, 10)) !== Number(c2[10]) || mod10(c3.slice(0, 10)) !== Number(c3[10])) return false;
    const b = linhaParaBarras(d); return mod11(b.slice(0, 4) + b.slice(5)) === Number(b[4]);
  }
  if (d.length === 48 && d[0] === '8') {
    const m10 = d[2] === '6' || d[2] === '7';
    for (let i = 0; i < 4; i++) { const bl = d.slice(i * 12, i * 12 + 12); const dv = m10 ? mod10(bl.slice(0, 11)) : mod11Arrec(bl.slice(0, 11)); if (dv !== Number(bl[11])) return false; }
    return true;
  }
  return false;
}

// Linha digitável (47/48) → código de barras (44 dígitos)
export function linhaParaBarras(d) {
  if (d.length === 48) return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
}

export function fmtLinha(d) {
  if (d.length === 48) return [0, 12, 24, 36].map(i => d.slice(i, i + 11) + '-' + d[i + 11]).join(' ');
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}

// Valor e vencimento embutidos no código de barras. Fator de vencimento: dias desde 07/10/1997;
// a contagem recomeçou em 1000 em 22/02/2025, por isso datas anteriores a isso ganham 9000 dias.
export function infoBarras(b) {
  if (!b || b.length !== 44) return {};
  if (b[0] === '8') { const cents = Number(b.slice(4, 15)); return { valor: b[2] === '6' || b[2] === '7' ? cents / 100 : null, vencimento: null, banco: null }; }
  const fator = Number(b.slice(5, 9)); const valor = Number(b.slice(9, 19)) / 100;
  let venc = null;
  if (fator > 0) { const base = new Date(Date.UTC(1997, 9, 7)); let dt = new Date(base.getTime() + fator * 86400000); if (dt < Date.UTC(2025, 1, 22)) dt = new Date(dt.getTime() + 9000 * 86400000); venc = dt.toISOString().slice(0, 10); }
  return { valor: valor || null, vencimento: venc, banco: b.slice(0, 3) };
}

// Código de barras ITF (2 de 5 intercalado) em SVG. Barra fina 1 unidade, grossa 2,5.
export function itfSvg(code, { altura = 72, fina = 2 } = {}) {
  const P = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];
  if (code.length % 2) code = '0' + code;
  const grossa = fina * 2.5; const w = x => x === '1' ? grossa : fina;
  const el = []; // [largura, éBarra]
  el.push([fina, 1], [fina, 0], [fina, 1], [fina, 0]);
  for (let i = 0; i < code.length; i += 2) { const a = P[Number(code[i])], b = P[Number(code[i + 1])]; for (let k = 0; k < 5; k++) el.push([w(a[k]), 1], [w(b[k]), 0]); }
  el.push([grossa, 1], [fina, 0], [fina, 1]);
  const quiet = fina * 10; let x = quiet; let rects = '';
  for (const [lw, bar] of el) { if (bar) rects += `<rect x="${x.toFixed(2)}" y="0" width="${lw.toFixed(2)}" height="${altura}"/>`; x += lw; }
  const total = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total.toFixed(2)} ${altura}" width="${total.toFixed(2)}" height="${altura}" shape-rendering="crispEdges" fill="#000" role="img" aria-label="Código de barras do boleto">${rects}</svg>`;
}

// Lê um boleto no servidor e devolve {ok, linha, pix, valor, vencimento, beneficiario, fonte, motivo, linha_lida}.
// PDF com texto: o n8n extrai e procura os códigos. PDF escaneado ou imagem/foto: o Claude (visão) transcreve
// e o servidor confere os dígitos verificadores antes de devolver (motivo 'linha_invalida' se não baterem).
export const ehArquivoLegivel = (tipo = '', nome = '') => /pdf$/i.test(tipo) || /^image\/(jpeg|png|webp|gif)/i.test(tipo) || /\.(pdf|jpe?g|png|webp|gif)$/i.test(nome);
export async function lerBoletoArquivo({ base64, nome = 'boleto.pdf', tipo = '' }) {
  const token = db.backend?.session?.token; if (!token) throw new Error('Sessão expirada');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const r = await fetch(LEITOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, base64: String(base64 || '').replace(/^data:[^,]*,/, ''), nome, tipo }), signal: ctrl.signal });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || ('HTTP ' + r.status));
    return j;
  } finally { clearTimeout(t); }
}
export const lerBoletoPdf = lerBoletoArquivo;
// Mensagem para o usuário quando a leitura não trouxe código
export function motivoLeitura(r) {
  if (!r) return 'Não consegui ler o arquivo';
  if (r.motivo === 'linha_invalida') { const d = String(r.linha_lida || ''); return `Li "${/^\d{47,48}$/.test(d) ? fmtLinha(d) : d}" mas os dígitos não conferem. Confira no boleto e cole a linha à mão.`; }
  if (r.motivo === 'nao_e_boleto') return 'O arquivo não parece um boleto nem uma conta a pagar';
  if (r.motivo === 'erro_visao' || r.motivo === 'recusado') return 'A leitura por imagem falhou' + (r.erro ? ': ' + r.erro : '');
  if (r.erro === 'formato_nao_suportado') return 'Formato não suportado: use PDF, JPG, PNG ou WEBP';
  return 'Não achei código de boleto nem PIX nesse arquivo';
}

// Texto digitado/colado no formulário → {boleto_linha, pix_codigo}
export function parseCodigos(txt) {
  const out = { boleto_linha: null, pix_codigo: null };
  for (const ln of String(txt || '').split(/\n+/)) { const s = ln.trim(); if (!s) continue; if (!out.pix_codigo && ehPix(s)) out.pix_codigo = s; else if (!out.boleto_linha && ehLinha(s)) out.boleto_linha = soDigitos(s); }
  return out;
}
export const codigosTexto = l => [l?.boleto_linha ? fmtLinha(l.boleto_linha) : '', l?.pix_codigo || ''].filter(Boolean).join('\n');

// Modal "Pagar boleto": linha digitável + Copiar, código de barras na tela, QR PIX se houver.
export function modalBoleto({ lanc, linha = null, pix = null, onPago = null, onLer = null }) {
  const d = modal({ title: 'Pagar boleto', size: 'sm', cls: 'boleto-modal' });
  const paint = () => {
    const temLinha = linha && validarLinha(linha); const barras = temLinha ? linhaParaBarras(linha) : null; const info = barras ? infoBarras(barras) : {};
    d.body.innerHTML = `<div class="bol-box">
      <div class="bol-head"><div class="bol-t">${esc(lanc?.descricao || '')}</div><div class="bol-v">${money(lanc?.valor || 0)}</div></div>
      ${temLinha ? `
        <label class="bol-cc"><span class="fl">Linha digitável</span><textarea class="inp mono" readonly rows="2">${fmtLinha(linha)}</textarea></label>
        <button type="button" class="btn primary" data-copiar-linha>${icon('ti-copy')}Copiar linha digitável</button>
        <div class="bol-bar">${itfSvg(barras)}</div>
        <div class="muted xs">${info.valor ? 'Valor no código: ' + money(info.valor) : ''}${info.vencimento ? ' · vence ' + fmtDate(info.vencimento) : ''}${info.valor && Math.abs(info.valor - Number(lanc?.valor || 0)) > 0.009 ? ' · <b class="neg">diferente do lançamento</b>' : ''}</div>` : ''}
      ${pix ? `<div class="bol-pix"><span class="fl">PIX do boleto (copia e cola)</span><img alt="QR Code PIX" width="200" height="200"><button type="button" class="btn secondary" data-copiar-pix>${icon('ti-copy')}Copiar código PIX</button></div>` : ''}
      ${!temLinha && !pix ? `<p class="muted sm">Este lançamento ainda não tem o código do boleto.${onLer ? ' Leia o anexo (PDF ou foto) ou cole a linha digitável editando o lançamento.' : ' Edite o lançamento e cole a linha digitável em "Mais detalhes".'}</p>` : ''}
      <p class="muted xs">No app do banco: Pagar → Boleto → cole a linha digitável, ou escaneie o código de barras na tela. Depois confirme aqui a baixa, escolhendo a conta de onde saiu.</p>
    </div>`;
    d.body.querySelector('[data-copiar-linha]')?.addEventListener('click', () => copy(linha));
    d.body.querySelector('[data-copiar-pix]')?.addEventListener('click', () => copy(pix));
    const ta = d.body.querySelector('textarea'); if (ta) ta.onclick = () => ta.select();
    const img = d.body.querySelector('.bol-pix img'); if (img) qrDataUrl(pix).then(u => { img.src = u; }).catch(() => img.remove());
    d.footer.innerHTML = '';
    const bFechar = h('<button class="btn ghost">Fechar</button>'); bFechar.onclick = () => d.close(); d.footer.append(bFechar);
    if (onLer && !temLinha && !pix) { const bLer = h(`<button class="btn secondary">${icon('ti-file-search')}Ler do anexo</button>`); bLer.onclick = async () => { bLer.disabled = true; try { const r = await onLer(); if (r?.linha) linha = r.linha; if (r?.pix) pix = r.pix; if (!r?.linha && !r?.pix) toast(motivoLeitura(r), 'warn', 7000); else toast('Boleto lido' + (r.fonte === 'visao' ? ' pela imagem' : '')); paint(); } catch (e) { toast('Falha ao ler o anexo: ' + e.message, 'err', 5000); bLer.disabled = false; } }; d.footer.append(bLer); }
    d.footer.append(h('<span class="grow"></span>'));
    if (onPago) { const bPago = h(`<button class="btn primary">${icon('ti-check')}Já paguei · dar baixa</button>`); bPago.onclick = () => { d.close(); onPago(); }; d.footer.append(bPago); }
  };
  paint();
  return d;
}
