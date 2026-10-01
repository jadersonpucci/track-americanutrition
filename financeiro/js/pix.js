// PIX "copia e cola" (BR Code EMV) a partir da chave do contato, com QR Code.
// Padrão do Banco Central: payload estático de uso único com valor fixo; o
// pagador abre o app do banco, lê o QR (ou cola o código) e paga.
import { modal, h, icon, toast, copy } from './ui.js';
import { esc, money } from './utils.js';

const noAcc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
const fld = (id, v) => id + String(v.length).padStart(2, '0') + v;

function crc16(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function cpfOk(c) { if (/^(\d)\1+$/.test(c)) return false; let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i); let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== +c[9]) return false; s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i); r = (s * 10) % 11; if (r === 10) r = 0; return r === +c[10]; }
function cnpjOk(c) { if (/^(\d)\1+$/.test(c)) return false; const calc = n => { const t = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += +c[i] * t[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; }; return calc(12) === +c[12] && calc(13) === +c[13]; }

// Normaliza a chave digitada no cadastro: e-mail, CPF, CNPJ, telefone (+55) ou chave aleatória.
export function pixKeyNorm(raw) {
  const v = String(raw == null ? '' : raw).trim(); if (!v) return null;
  if (v.includes('@')) return { k: v.toLowerCase(), t: 'e-mail' };
  const semT = v.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(semT) && /[a-fA-F]/.test(semT)) return { k: v.toLowerCase(), t: 'aleatória' };
  const d = v.replace(/\D/g, '');
  if (d.length === 14 && cnpjOk(d)) return { k: d, t: 'CNPJ' };
  if (d.length === 11) return cpfOk(d) ? { k: d, t: 'CPF' } : { k: '+55' + d, t: 'telefone' };
  if (d.length === 10) return { k: '+55' + d, t: 'telefone' };
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return { k: '+' + d, t: 'telefone' };
  return { k: v, t: 'chave' };
}

// Monta o payload. valor em reais (number); nome/cidade do recebedor; txid opcional (até 25 alfanuméricos).
export function pixEMV({ chave, valor = 0, nome = '', cidade = '', txid = '***', descricao = '' }) {
  let conta = fld('00', 'br.gov.bcb.pix') + fld('01', chave);
  const desc = noAcc(descricao).replace(/\s+/g, ' ').trim().slice(0, 40);
  if (desc && conta.length + 4 + desc.length <= 99) conta += fld('02', desc);
  const tx = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  const body = fld('00', '01') + fld('01', '12') + fld('26', conta) + fld('52', '0000') + fld('53', '986')
    + (valor > 0 ? fld('54', Number(valor).toFixed(2)) : '')
    + fld('58', 'BR') + fld('59', (noAcc(nome).toUpperCase().trim() || 'RECEBEDOR').slice(0, 25)) + fld('60', (noAcc(cidade).toUpperCase().trim() || 'BRASIL').slice(0, 15))
    + fld('62', fld('05', tx)) + '6304';
  return body + crc16(body);
}

// qrcode-generator (MIT, Kazuhiko Arase), servido junto com o app.
let qrLib = null;
function carregarQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (qrLib) return qrLib;
  qrLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'assets/vendor/qrcode.min.js'; s.onload = () => res(window.qrcode); s.onerror = () => { qrLib = null; rej(new Error('qr')); }; document.head.appendChild(s); });
  return qrLib;
}

// Abre o modal de pagamento de um lançamento pela chave PIX do contato.
export function modalPix({ lanc, contato, valor, onPago = null, contaNome = '' }) {
  const nk = pixKeyNorm(contato?.pix);
  if (!nk) { toast('Este contato não tem chave PIX cadastrada', 'warn'); return null; }
  const v = Math.max(0, Number(valor) || 0);
  const payload = pixEMV({ chave: nk.k, valor: v, nome: contato.nome, cidade: contato.cidade, descricao: lanc?.descricao || '' });
  const d = modal({ title: 'Pagar com PIX', size: 'sm', cls: 'pix-modal' });
  d.body.innerHTML = `<div class="pix-box">
    <div class="pix-qr"><img alt="QR Code PIX" width="240" height="240"><div class="pix-qr-ld muted sm">Gerando QR…</div></div>
    <div class="pix-v">${money(v)}</div>
    <div class="pix-n">${esc(contato.nome)}</div>
    <div class="pix-k muted sm">${icon('ti-bolt')} <span>${esc(nk.t)}</span> <b class="mono">${esc(nk.k)}</b></div>
    <label class="pix-cc"><span class="fl">PIX copia e cola</span><textarea class="inp mono" readonly rows="3">${esc(payload)}</textarea></label>
    <button type="button" class="btn secondary" data-copiar>${icon('ti-copy')}Copiar código</button>
    <p class="muted xs">Abra o app do banco, escolha Pix → Ler QR Code ou Pix Copia e Cola. O valor já vai preenchido; confira o nome do recebedor antes de confirmar.</p>
  </div>`;
  const ta = d.body.querySelector('textarea'); ta.onclick = () => ta.select();
  d.body.querySelector('[data-copiar]').onclick = () => copy(payload);
  const img = d.body.querySelector('.pix-qr img'); const ld = d.body.querySelector('.pix-qr-ld');
  carregarQR().then(qrcode => { const qr = qrcode(0, 'M'); qr.addData(payload); qr.make(); img.src = qr.createDataURL(6, 0); ld.remove(); })
    .catch(() => { ld.textContent = 'QR indisponível. Use o código copia e cola.'; img.remove(); });
  d.footer.innerHTML = '';
  const bFechar = h('<button class="btn ghost">Fechar</button>'); bFechar.onclick = () => d.close();
  d.footer.append(bFechar, h('<span class="grow"></span>'));
  if (onPago) { const bPago = h(`<button class="btn primary" title="${contaNome ? `Abre a baixa já com a conta ${esc(contaNome)} selecionada` : 'Abre a baixa'}">${icon('ti-check')}Já paguei · dar baixa</button>`); bPago.onclick = () => { d.close(); onPago(); }; d.footer.append(bPago); }
  d.body.querySelector('.pix-box p').insertAdjacentHTML('beforeend', contaNome ? ` A baixa vai para a conta <b>${esc(contaNome)}</b> (dá para trocar na próxima tela).` : ' Na baixa você escolhe de qual conta o PIX saiu.');
  return d;
}
