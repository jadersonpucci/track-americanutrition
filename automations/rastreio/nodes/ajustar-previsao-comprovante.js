// 1) REGRA DE EXIBICAO (jul/2026): soma 2 dias a previsao de entrega vinda da API
//    (Envia/PacoteVicio na rota BR, Shippo/Supabase na rota USA).
// 2) COMPROVANTE DE ENTREGA (ago/2026): anexa o POD (canhoto assinado) que a
//    transportadora envia, servido pelo nosso proxy /webhook/rastreio/comprovante
//    (nao expoe o bucket nem a transportadora ao cliente).
// 3) COMPROVANTE CORREIOS VIA FRENET (nov/2026): se nao veio POD e o codigo e dos Correios,
//    usa a assinatura baixada do painel da Frenet ([Rastreio] Comprovante Correios (Frenet)),
//    servida em /webhook/rastreio/comprovante-correios.
const j = ($input.first() && $input.first().json) ? $input.first().json : {};

// ---------- previsao +2d ----------
try {
  if (j && j.rastreio && j.rastreio.previsao_entrega) {
    const raw = String(j.rastreio.previsao_entrega).split('T')[0].split(' ')[0];
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const pd = new Date(raw + 'T12:00:00-03:00');
      if (!isNaN(pd)) {
        pd.setDate(pd.getDate() + 2);
        const y = pd.getFullYear();
        const mo = String(pd.getMonth() + 1).padStart(2, '0');
        const da = String(pd.getDate()).padStart(2, '0');
        j.rastreio.previsao_entrega = y + '-' + mo + '-' + da;
      }
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
