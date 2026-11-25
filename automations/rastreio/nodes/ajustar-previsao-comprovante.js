// 1) REGRA DE EXIBICAO (jul/2026): soma 2 dias a previsao de entrega vinda da API. Desde 09/11/2026 (Jaderson) sao
//    2 DIAS UTEIS: sabado, domingo e feriado nacional nao contam, e a previsao nunca cai em dia sem entrega.
//    (Envia/PacoteVicio na rota BR, Shippo/Supabase na rota USA).
// 2) COMPROVANTE DE ENTREGA (ago/2026): anexa o POD (canhoto assinado) que a
//    transportadora envia, servido pelo nosso proxy /webhook/rastreio/comprovante
//    (nao expoe o bucket nem a transportadora ao cliente).
// 3) COMPROVANTE CORREIOS VIA FRENET (nov/2026): se nao veio POD e o codigo e dos Correios,
//    usa a assinatura baixada do painel da Frenet ([Rastreio] Comprovante Correios (Frenet)),
//    servida em /webhook/rastreio/comprovante-correios.
const j = ($input.first() && $input.first().json) ? $input.first().json : {};

// ---------- dias uteis (sem fim de semana e sem feriado nacional) ----------
// Feriados nacionais fixos + moveis pela Pascoa: Carnaval (seg e ter), Sexta-feira Santa e Corpus Christi.
// 20/11 (Consciencia Negra) e nacional desde 2024. Feriado estadual/municipal nao entra.
const DIA_MS = 86400000;
function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}
const _feriados = {};
function ehFeriado(t) {
  const y = new Date(t).getUTCFullYear();
  if (!_feriados[y]) {
    const p = pascoa(y);
    const lista = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((s) => Date.UTC(y, +s.slice(0, 2) - 1, +s.slice(3)));
    lista.push(p - 48 * DIA_MS, p - 47 * DIA_MS, p - 2 * DIA_MS, p + 60 * DIA_MS);
    _feriados[y] = new Set(lista);
  }
  return _feriados[y].has(t);
}
const diaUtil = (t) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6 && !ehFeriado(t); };
// soma n dias uteis a uma data (t = meia-noite UTC do dia); o resultado sempre e dia util
function somarDiasUteis(t, n) {
  let k = 0;
  while (k < n) { t += DIA_MS; if (diaUtil(t)) k++; }
  while (!diaUtil(t)) t += DIA_MS;
  return t;
}

// ---------- previsao +2 dias uteis ----------
try {
  if (j && j.rastreio && j.rastreio.previsao_entrega) {
    const raw = String(j.rastreio.previsao_entrega).split('T')[0].split(' ')[0];
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const t = somarDiasUteis(Date.UTC(+m[1], +m[2] - 1, +m[3]), 2);
      j.rastreio.previsao_entrega = new Date(t).toISOString().slice(0, 10);
    }
  }
} catch (e) {
  // segue com a previsao original
}

// ---------- comprovante de entrega (POD) ----------
try {
  if (j && j.rastreio) {
    j.rastreio.comprovante = null;

    let it = {};
    try { it = ($('Envia.com - Tracking').first().json.data || [])[0] || {}; } catch (e) { it = {}; }

    const entregue = j.rastreio.status_chave === 'delivered' || /entreg/i.test(j.rastreio.status_atual || '');
    const podFile = it.podFile ? String(it.podFile) : '';
    const evid = Array.isArray(it.podEvidences) ? it.podEvidences : [];
    const carrier = String(it.carrier || 'correios').toLowerCase().replace(/[^a-z0-9]/g, '') || 'correios';
    const cod = String(j.rastreio.codigo || '').toUpperCase();
    const BASE = 'https://n8n.americanutrition.com/webhook/rastreio/comprovante';

    // "Recebido por": so mostra se for nome de pessoa (Correios manda o texto do status)
    let recebidoPor = String(it.signedBy || '').trim();
    if (!recebidoPor || /objeto|entregue|destinat|delivered|recipient/i.test(recebidoPor)) { recebidoPor = ''; }
    // J&T informa o signatario no texto do evento; o normalizador ja limpou e deixou em rastreio.recebido_por
    // ("o proprio destinatario" ou o nome). Texto de status ("Objeto entregue...") continua barrado.
    if (!recebidoPor && j.rastreio.recebido_por) {
      const rp = String(j.rastreio.recebido_por).trim();
      if (rp && !/objeto|entregue|delivered|recipient/i.test(rp)) { recebidoPor = rp; }
    }

    const okArq = /^[A-Za-z0-9._-]{4,80}$/.test(podFile);
    if (entregue && cod && (okArq || evid.length)) {
      const extras = [];
      for (let i = 0; i < evid.length && i < 6; i++) {
        const nome = String(evid[i] || '');
        if (/^[A-Za-z0-9._-]{4,80}$/.test(nome)) {
          extras.push(BASE + '?codigo=' + encodeURIComponent(cod) + '&c=' + carrier + '&i=' + i + '&arq=' + encodeURIComponent(nome));
        }
      }
      j.rastreio.comprovante = {
        url: okArq ? (BASE + '?codigo=' + encodeURIComponent(cod) + '&c=' + carrier + '&arq=' + encodeURIComponent(podFile)) : null,
        recebido_por: recebidoPor || null,
        entregue_em: j.rastreio.entregue_em || null,
        evidencias: extras
      };
      if (!j.rastreio.comprovante.url && !extras.length) { j.rastreio.comprovante = null; }
    }
  }
} catch (e) {
  // qualquer erro: segue sem comprovante, nunca quebra o rastreio
  try { if (j && j.rastreio) j.rastreio.comprovante = null; } catch (e2) {}
}

// ---------- comprovante Correios (painel da Frenet) ----------
try {
  if (j && j.rastreio && !j.rastreio.comprovante) {
    const cod = String(j.rastreio.codigo || '').toUpperCase();
    const entregue = j.rastreio.status_chave === 'delivered' || (/entreg/i.test(j.rastreio.status_atual || '') && !/n[aã]o\s+entregue/i.test(j.rastreio.status_atual || ''));
    if (entregue && /^[A-Z]{2}\d{9}BR$/.test(cod)) {
      const URL_C = 'https://n8n.americanutrition.com/webhook/rastreio/comprovante-correios?codigo=' + cod;
      const r = await this.helpers.httpRequest({ method: 'GET', url: URL_C + '&check=1', json: true, timeout: 4000 });
      if (r && r.ok === true) {
        let rp = String(j.rastreio.recebido_por || '').trim();
        if (/objeto|entregue|delivered|recipient/i.test(rp)) rp = '';
        j.rastreio.comprovante = { url: URL_C, recebido_por: rp || null, entregue_em: j.rastreio.entregue_em || null, evidencias: [] };
      }
    }
  }
} catch (e) {
  // sem comprovante da Frenet (404, demora ou erro): segue normal
}

return [{ json: j }];
