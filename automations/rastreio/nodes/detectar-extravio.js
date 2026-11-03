// No 'Detectar Extravio' do workflow America Nutrition - Rastreio Personalizado v3 (Pobps91zvSWe9wCA),
// entre 'Ajustar Previsao +2d' e 'Responder Sucesso'. SUPABASE_SERVICE_KEY fica so no n8n.
//
// EXTRAVIO (18/10/2026, pedido do Jaderson). A J&T marca o extravio no proprio site, mas pela Envia chega so um
// scan "110" (problema) com event "Information" e sem texto, e a pagina mostrava "information". Caso que originou:
// lote de 24 pacotes que saiu de Sao Vicente para Guarulhos em 06/10 16:33 e levou o 110 em 17/10 14:06:10, todos
// no mesmo segundo (AN-15790 a AN-15839). O 110 da J&T e "problema" em geral (endereco, recusa, avaria tambem),
// entao so conta como extravio quando e o ultimo scan, vem sem descricao e chega depois de 5+ dias parado.
// Tambem conta o texto "extraviado" (Correios, Loggi). A tabela rastreio_extravios deixa a equipe forcar
// sim/nao por codigo e informar o codigo do reenvio.
//
// Mensagem combinada: o pacote saiu daqui normalmente, quem extraviou foi a transportadora, e a America Nutrition
// reenvia sem custo. Se o pedido ja tem outro envio na Shopify (o reenvio entra como segundo fulfillment),
// a pagina aponta para o rastreio novo.
const j = ($input.first() && $input.first().json) ? $input.first().json : {};
try {
  const R = j.rastreio;
  if (!R || !R.codigo) return [{ json: j }];
  const cod = String(R.codigo).toUpperCase().trim();
  const DIA = 86400000;

  // ---------- 1) J&T: ultimo scan 110 sem descricao, depois de 5+ dias parado ----------
  let raw = [];
  try { raw = ((($('Envia.com - Tracking').first().json || {}).data || [])[0] || {}).eventHistory || []; } catch (e) { raw = []; }
  const quando = s => { const t = String(s || '').trim(); if (!t) return null; const d = new Date(/T/.test(t) ? t : t.replace(' ', 'T') + '-03:00'); return isNaN(d) ? null : d; };
  const scans = raw.map(e => ({ e, d: quando(e.date) })).filter(x => x.d).sort((a, b) => b.d - a.d);
  let extravio = null;
  if (scans.length && String(scans[0].e.description || '').trim() === '110' && !String(scans[0].e.location || '').trim()) {
    const anterior = scans.find(x => String(x.e.description || '').trim() !== '110');
    if (!anterior || (scans[0].d - anterior.d) >= 5 * DIA) extravio = { data: scans[0].e.date, fonte: 'jt_110' };
  }

  // ---------- 2) texto da transportadora no evento mais recente ----------
  const evs = Array.isArray(R.eventos) ? R.eventos : [];
  if (!extravio && evs[0] && /extravi/i.test(String(evs[0].status || '') + ' ' + String(evs[0].detalhe || ''))) {
    extravio = { data: evs[0].data, fonte: 'texto' };
  }

  // ---------- 3) marcacao manual da equipe (manda sobre a deteccao) ----------
  let manual = null;
  try {
    const SK = 'SUPABASE_SERVICE_KEY';
    const rows = await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', json: true, timeout: 2500,
      headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' },
      body: { query: "select extraviado, novo_codigo from rastreio_extravios where codigo = '" + cod.replace(/[^A-Z0-9]/g, '') + "'" } });
    manual = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) { manual = null; }
  if (manual && manual.extraviado === false) extravio = null;
  if (manual && manual.extraviado === true && !extravio) extravio = { data: evs[0] ? evs[0].data : null, fonte: 'manual' };
  if (!extravio) {
    // 110 que nao e extravio (recente, ou desmarcado pela equipe): sem "information" cru na tela
    for (const ev of evs) if (/^information$/i.test(String(ev.status || '').trim())) ev.status = 'Ocorrência registrada pela transportadora';
    if (/^information$/i.test(String(R.status_atual || '').trim())) R.status_atual = 'Ocorrência registrada pela transportadora';

    // 03/11/2026 (AN-16220, 888031005427277): o 110 da J&T as vezes vem com um codigo de motivo no texto ("1"), e a
    // pagina mostrava "1". Depois de "saiu para entrega" (94), sem entrega no meio, o 110 e a entrega que nao deu certo.
    const prefixo = s => String(s || '').trim().replace(' ', 'T').slice(0, 19);
    const evDoScan = s => evs.find(ev => String(ev.data || '').indexOf(prefixo(s.e.date)) === 0);
    let topoMudou = false;
    scans.forEach((s, i) => {
      if (String(s.e.description || '').trim() !== '110') return;
      const ev = evDoScan(s);
      if (!ev) return;
      if (ev === evs[0]) topoMudou = true;
      const loc = String(s.e.location || '').trim();
      const textoReal = loc.length > 3 && !/^\d+$/.test(loc);
      const anterior = scans.slice(i + 1).find(x => String(x.e.description || '').trim() !== '110');
      if (anterior && String(anterior.e.description || '').trim() === '94') {
        ev.status = 'Tentativa de entrega sem sucesso';
        ev.status_chave = 'exception';
        ev.detalhe = 'O entregador não conseguiu entregar o pacote neste dia.';
      } else if (!textoReal) {
        ev.status = 'Ocorrência registrada pela transportadora';
        ev.detalhe = '';
      }
    });
    for (const ev of evs) if (/^\d{1,3}$/.test(String(ev.status || '').trim())) { ev.status = 'Ocorrência registrada pela transportadora'; ev.detalhe = ''; if (ev === evs[0]) topoMudou = true; }

    // Devolucao: depois do primeiro evento de devolucao (sem entrega depois), o pacote esta voltando para a America
    // Nutrition. Antes, a saida seguinte aparecia como "Saiu de Maringá" em transito, como se fosse para a cliente.
    const iDev = evs.findIndex(ev => ev.status_chave === 'returned');
    if (iDev >= 0) {
      // "entregue" depois da devolucao e a entrega de volta para nos, nao para a cliente
      const voltou = evs.slice(0, iDev).some(ev => ev.status_chave === 'delivered');
      for (let k = 0; k <= iDev; k++) {
        const ev = evs[k];
        if (/escaneador|esscaneador|verificado/i.test(String(ev.detalhe || ''))) ev.detalhe = 'A transportadora registrou a devolução do pacote.';
        if (k === iDev) continue;
        if (ev.status_chave === 'delivered') { ev.status = 'Pacote devolvido à America Nutrition'; ev.detalhe = ''; }
        ev.status_chave = 'returned';
        if (/^Sa[íi]u /.test(String(ev.status || ''))) ev.status = 'Em devolução: ' + ev.status.charAt(0).toLowerCase() + ev.status.slice(1);
        else if (/^Chegou /.test(String(ev.status || ''))) ev.status = 'Em devolução: ' + ev.status.charAt(0).toLowerCase() + ev.status.slice(1);
      }
      R.status_chave = 'returned';
      R.status_atual = voltou ? 'Pacote devolvido à America Nutrition' : 'Pacote em devolução';
      R.detalhe_atual = 'A ' + (R.transportadora || 'transportadora') + ' não conseguiu entregar e o pacote ' + (voltou ? 'voltou' : 'está voltando') + ' para a America Nutrition. Fale com a gente pelo WhatsApp para combinar o reenvio.';
      R.entregue_em = null;
      R.recebido_por = null;
      R.previsao_entrega = null;
      R.atrasado = false;
    } else if (topoMudou) {
      R.status_atual = evs[0].status;
      if (evs[0].status_chave === 'exception') { R.status_chave = 'exception'; R.detalhe_atual = evs[0].detalhe || R.detalhe_atual; }
    }
    return [{ json: j }];
  }

  // ---------- reenvio: outro rastreio no mesmo pedido da Shopify ----------
  let novo = manual && manual.novo_codigo ? String(manual.novo_codigo).toUpperCase().trim() : '';
  if (!novo) {
    let orders = [];
    try { orders = ($('Shopify - Buscar por Tracking').first().json || {}).orders || []; } catch (e) { orders = []; }
    if (!orders.length) { try { orders = ($('Shopify - Buscar Pedido').first().json || {}).orders || []; } catch (e) { orders = []; } }
    const tns = f => (f.tracking_numbers || (f.tracking_number ? [f.tracking_number] : [])).map(t => String(t).toUpperCase().trim());
    const ped = orders.find(o => (o.fulfillments || []).some(f => tns(f).includes(cod)));
    if (ped) {
      const outros = (ped.fulfillments || [])
        .filter(f => String(f.status || '') !== 'cancelled')
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .flatMap(tns).filter(t => t && t !== cod);
      novo = outros[0] || '';
    }
  }

  const transp = R.transportadora || 'transportadora';
  const urlNovo = novo ? 'https://track.americanutrition.com/' + novo : '';
  R.extraviado = true;
  R.extravio = { data: extravio.data || null, fonte: extravio.fonte, reenvio_codigo: novo || null, reenvio_url: urlNovo || null };
  R.status_chave = 'exception';
  R.status_atual = 'Pacote extraviado pela transportadora';
  R.atrasado = false;
  R.previsao_entrega = null;
  R.detalhe_atual = 'Seu pedido saiu do nosso centro de distribuição normalmente e foi entregue à ' + transp
    + ', mas a transportadora extraviou o pacote durante o transporte. O problema aconteceu com a transportadora, não com o nosso envio. '
    + (novo
      ? 'Já reenviamos o seu pedido, sem nenhum custo para você. Acompanhe o novo envio aqui: ' + urlNovo
      : 'Vamos reenviar o seu pedido sem nenhum custo para você, e o novo código de rastreio chega pelo WhatsApp assim que ele for postado');

  // evento do extravio na linha do tempo (o 110 chegava como "information")
  const alvo = extravio.fonte === 'jt_110' ? String(extravio.data || '').replace(' ', 'T') : '';
  let marcado = false;
  for (const ev of evs) {
    if ((alvo && String(ev.data || '').indexOf(alvo) === 0) || /^information$/i.test(String(ev.status || '').trim())) {
      ev.status = 'Extraviado pela transportadora';
      ev.status_chave = 'exception';
      ev.detalhe = 'A ' + transp + ' informou que o pacote foi extraviado durante o transporte.';
      marcado = true;
      break;
    }
  }
  if (!marcado && extravio.fonte === 'manual' && evs.length) {
    evs.unshift({ data: new Date().toISOString(), status: 'Extraviado pela transportadora', status_chave: 'exception', detalhe: 'A ' + transp + ' informou que o pacote foi extraviado durante o transporte.', unidade: '', local_origem: '', local_destino: '', eh_transferencia: false });
  }
} catch (e) { /* fail-open: rastreio sai como veio */ }
return [{ json: j }];
