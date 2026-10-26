// No 'Detectar Retirada' do workflow America Nutrition - Rastreio Personalizado v3 (Pobps91zvSWe9wCA),
// entre 'Detectar Extravio' e 'Responder Sucesso'.
//
// RETIRADA (26/10/2026, pedido do Jaderson). Quando os Correios nao entregam (area sem entrega, restricao, ausente
// varias vezes), o ultimo evento vira "Objeto aguardando retirada no endereco indicado". A API dos Correios
// (PacoteVicio/RapidAPI) traz o endereco da unidade em eventos[0].unidade.endereco, mas o 'Normalizar Resposta'
// so guardava a cidade. Caso que originou: AN-16159, AE059939994BR, Av. Sete de Setembro, 486, Centro, Diadema/SP.
//
// Saida: rastreio.retirada = { aguardando, endereco, logradouro, numero, complemento, bairro, cidade, uf, cep,
// unidade, desde, prazo_ate, prazo_estimado, maps_url, documentos }, e detalhe_atual com o endereco escrito por
// extenso (a pagina e a Serena ja mostram detalhe_atual). Fail-open: qualquer erro devolve o rastreio como veio.
const j = ($input.first() && $input.first().json) ? $input.first().json : {};
try {
  const R = j.rastreio;
  if (!R || !R.codigo || R.extraviado) return [{ json: j }];
  let raw = null;
  try { raw = $('PacoteVício - Tracking').first().json || null; } catch (e) { raw = null; }
  const evs = (raw && Array.isArray(raw.eventos)) ? raw.eventos : [];
  const ev = evs[0];
  if (!ev) return [{ json: j }];
  const desc = String(ev.descricao || '') + ' ' + String(ev.descricaoFrontEnd || '');
  const ehRetirada = String(ev.rota || '').toUpperCase() === 'RETIRADA' || /aguardando retirada/i.test(desc);
  if (!ehRetirada) return [{ json: j }];

  const u = ev.unidade || {};
  const e = u.endereco || {};
  const limpa = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const titulo = s => limpa(s).toLowerCase().replace(/(^|\s|-)(\S)/g, (m, a, b) => a + b.toUpperCase());
  const logradouro = limpa(e.logradouro), numero = limpa(e.numero), complemento = limpa(e.complemento);
  const bairro = limpa(e.bairro), cidade = titulo(e.cidade), uf = limpa(e.uf).toUpperCase();
  const cepD = limpa(e.codigoPostal).replace(/\D/g, '');
  const cep = cepD.length === 8 ? cepD.slice(0, 5) + '-' + cepD.slice(5) : '';
  const linha1 = [logradouro, numero].filter(Boolean).join(', ') + (complemento ? ' - ' + complemento : '');
  const endereco = [linha1, bairro, [cidade, uf].filter(Boolean).join('/'), cep ? 'CEP ' + cep : ''].filter(Boolean).join(' - ');

  // data do evento (vem como "2026-10-24 11:40:05.000000", horario de Brasilia)
  let desde = null;
  try { const t = String((ev.dtHrCriado && ev.dtHrCriado.date) || '').slice(0, 19).replace(' ', 'T'); if (t) desde = new Date(t + '-03:00'); } catch (er) { desde = null; }
  if (desde && isNaN(desde)) desde = null;
  // prazo: os Correios guardam o objeto nacional por 7 dias corridos; quando a API manda dataLimiteRetirada, vale ela
  let prazo = null, estimado = false;
  if (ev.dataLimiteRetirada) { const p = new Date(String(ev.dataLimiteRetirada).replace(' ', 'T')); if (!isNaN(p)) prazo = p; }
  if (!prazo && desde) { prazo = new Date(desde.getTime() + 7 * 86400000); estimado = true; }
  const fmt = d => d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : '';

  const temEndereco = !!(logradouro || bairro);
  const busca = temEndereco ? [linha1, bairro, cidade, uf].filter(Boolean).join(', ') : ('Correios ' + [cidade, uf].filter(Boolean).join(' '));
  R.retirada = {
    aguardando: true,
    endereco: temEndereco ? endereco : '',
    logradouro, numero, complemento, bairro, cidade, uf, cep,
    unidade: limpa(u.tipo) || 'Unidade dos Correios',
    motivo: limpa(ev.descricaoFrontEnd) || '',
    desde: desde ? desde.toISOString() : null,
    prazo_ate: prazo ? prazo.toISOString() : null,
    prazo_estimado: estimado,
    maps_url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(busca),
    documentos: 'código do objeto (' + R.codigo + ') e documento oficial com foto do destinatário; outra pessoa pode retirar com autorização assinada e cópia do documento do destinatário'
  };
  R.status_atual = 'Aguardando retirada nos Correios';
  const semEntrega = /sem entrega|restri/i.test(desc);
  R.detalhe_atual = (semEntrega ? 'Os Correios não fazem entrega no seu endereço e deixaram o pedido para retirada' : 'Os Correios deixaram o pedido para retirada')
    + (temEndereco ? ' em: ' + endereco + '.' : ' na unidade de ' + [cidade, uf].filter(Boolean).join('/') + '.')
    + ' Leve o código do objeto (' + R.codigo + ') e um documento oficial com foto do destinatário.'
    + (prazo ? ' Retire até ' + fmt(prazo) + (estimado ? ' (prazo de guarda de 7 dias corridos)' : '') + ', depois disso o pacote volta para nós.' : '');

  // linha do tempo: o evento de retirada ganha o endereco
  const lista = Array.isArray(R.eventos) ? R.eventos : [];
  for (const x of lista) {
    if (/aguardando retirada/i.test(String(x.status || ''))) {
      if (temEndereco) x.detalhe = 'Endereço para retirada: ' + endereco + '. ' + String(x.detalhe || '');
      break;
    }
  }
} catch (err) { /* fail-open */ }
return [{ json: j }];
