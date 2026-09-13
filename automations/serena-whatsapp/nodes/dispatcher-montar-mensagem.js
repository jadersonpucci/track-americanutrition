// Node "Montar Mensagem" do workflow "[Transacional] Dispatcher Samuel v3" (n8n WXncUehLXyuIMoSm).
// Monta o texto de pedido pago / enviado / entregue a partir de scheduled_messages.
const NL = String.fromCharCode(10);
const TRACK = 'https://track.americanutrition.com/';
const AVISO = 'Atenção! A America Nutrition nunca solicitará o pagamento de nenhuma taxa adicional para a liberação ou entrega do pedido.';
function primeiroNome(n) { const s = String(n || '').trim().split(/\s+/)[0] || ''; return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'tudo bem'; }
// A transportadora as vezes manda a URL inteira no campo de rastreio (ex.: https://envia.com/tracking?label=888...).
// O link da AN e track.americanutrition.com/CODIGO, entao aqui fica so o codigo. Se nao der para extrair, nao envia link quebrado.
function soCodigo(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(s); i++) { try { const d = decodeURIComponent(s); if (d === s) break; s = d; } catch (e) { break; } }
  if (/^[a-z]+:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}[/?#]/i.test(s)) {
    const qs = s.match(/[?&#](?:label|code|codigo|tracking|tracking_number|trackingnumber|objeto|numero|nums|num|id|n)=([^&#\s]+)/i);
    if (qs) s = qs[1];
    else s = (s.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() || '');
    for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(s); i++) { try { const d = decodeURIComponent(s); if (d === s) break; s = d; } catch (e) { break; } }
  }
  s = s.replace(/\s+/g, '');
  return (/^[A-Za-z0-9._-]{8,40}$/.test(s) && /\d/.test(s)) ? s : '';
}
const RODAPE_PAGO = '🚚 Pagamento aprovado e seu pedido já está em preparação para envio.' + NL + NL
  + 'Em breve, você receberá o código de rastreio pelo WhatsApp e email para acompanhar cada etapa da entrega 📦' + NL + NL
  + 'Sigo acompanhando você por aqui dando continuidade ao seu processo, com toda a atenção necessária nessa fase.' + NL + NL
  + 'Se em algum momento fizer sentido ajustar o uso, otimizar estratégias ou alinhar os próximos passos, estou por aqui.';
function textoPago(nome, pedido) {
  return 'Olá, ' + nome + ' 😊' + NL + NL
    + 'Seu pedido ' + pedido + ' foi confirmado!' + NL + NL
    + RODAPE_PAGO;
}
// ASSINATURA (13/09/2026): pedido de assinatura nao pode chegar como compra comum. Na primeira compra a mensagem
// explica como a assinatura funciona; na renovacao lembra que foi automatica, com desconto, e como pausar/cancelar.
// (Caso Carlos M., 12/09: recebeu "seu pedido foi confirmado" da renovacao e respondeu "eu nao fiz nenhum pedido".)
function dataBr(s) { const d = String(s || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : ''; }
function textoPagoAssinatura(nome, pedido, cf) {
  const tipo = String(cf.assinatura || 'assinatura');
  const ciclo = Number(cf.assinatura_ciclo || 30);
  const desc = Number(cf.assinatura_desconto || 0);
  const proximo = dataBr(cf.assinatura_proximo);
  const pix = String(cf.assinatura_metodo || '') === 'pix';
  const descTxt = desc > 0 ? (desc + '% de desconto de assinante') : 'o desconto de assinante';
  let corpo;
  if (tipo === 'primeira') {
    corpo = '🔁 Sua *assinatura* foi ativada e o primeiro pedido dela, ' + pedido + ', já está confirmado!' + NL + NL
      + '*Como funciona:* a cada ' + ciclo + ' dias a renovação acontece automaticamente, com ' + descTxt + ', e um pedido novo sai para você sem precisar fazer nada'
      + (pix ? ' (o Pix da renovação chega por aqui uns dias antes)' : ' (a cobrança vai no cartão cadastrado)') + '. A cada renovação você recebe esta confirmação por aqui.'
      + (proximo ? ' A primeira renovação será em ' + proximo + '.' : '') + NL + NL
      + 'Quer pausar, cancelar ou mudar algo na assinatura? É só me chamar por aqui, a qualquer momento.';
  } else if (tipo === 'renovacao') {
    corpo = '🔁 Sua *assinatura* renovou! O pedido ' + pedido + ' é desta renovação, gerado automaticamente como combinado, com ' + descTxt + '.'
      + (proximo ? ' A próxima renovação será em ' + proximo + '.' : '') + NL + NL
      + 'Se quiser pausar, cancelar ou mudar algo na assinatura, é só me chamar por aqui.';
  } else {
    corpo = '🔁 O pedido ' + pedido + ' faz parte da sua *assinatura* e já está confirmado!' + NL + NL
      + 'Se quiser pausar, cancelar ou mudar algo na assinatura, é só me chamar por aqui.';
  }
  return 'Olá, ' + nome + ' 😊' + NL + NL + corpo + NL + NL + RODAPE_PAGO;
}
function textoEnviado(nome, pedido, transportadora, codigo) {
  return 'Olá, ' + nome + '! 😊' + NL + NL
    + 'Seu pedido ' + pedido + ' foi postado e já está com a transportadora (' + transportadora + ')! 🚚' + NL + NL
    + 'Estamos acompanhando tudo de perto!' + NL + NL
    + 'Clique abaixo para ver onde está seu pedido.🔍' + NL
    + TRACK + codigo + NL + NL
    + AVISO;
}
function textoEntregue(nome, pedido) {
  return 'Olá, ' + nome + '! 😊' + NL + NL
    + 'Seu pedido ' + pedido + ' foi entregue! 📦' + NL + NL
    + 'Esperamos que esteja tudo certo. Em caso de problema com a entrega, responda esta conversa.' + NL + NL
    + AVISO;
}

const out = [];
for (const it of $input.all()) {
  const m = it.json || {};
  let tp = m.template_params; if (typeof tp === 'string') { try { tp = JSON.parse(tp); } catch (e) { tp = {}; } }
  const cf = (tp && tp.custom_fields) || {};
  const nome = primeiroNome(cf.nome || m.first_name);
  const pedido = String(cf.order_name || '').trim();
  const number = String(m.phone || '').replace(/\D/g, '');
  const base = { id: m.id, number: number, first_name: m.first_name || '', template_name: m.template_name, reference_id: m.reference_id, tentativas: Number(m.tentativas || 0), autor: 'transacional:' + m.template_name, pedido: pedido, produto: String(cf.produto_entregue || cf.produtos || '').trim(), pos_entrega: String(m.pos_entrega || 'off') };
  const idade = m.send_at ? (Date.now() - new Date(m.send_at).getTime()) : 0;
  if (idade > 48 * 3600 * 1000) { out.push({ json: Object.assign(base, { skip: true, motivo: 'expirada_48h', text: '' }) }); continue; }
  if (m.ja_enviado) { out.push({ json: Object.assign(base, { skip: true, motivo: 'ja_enviado', text: '' }) }); continue; }
  if (m.optout) { out.push({ json: Object.assign(base, { skip: true, motivo: 'optout', text: '' }) }); continue; }
  if (!number || number.length < 10 || !pedido) { out.push({ json: Object.assign(base, { skip: true, motivo: 'dados_incompletos', text: '' }) }); continue; }
  let text = '';
  if (m.template_name === 'pedido_pago_confirmado') text = cf.assinatura ? textoPagoAssinatura(nome, pedido, cf) : textoPago(nome, pedido);
  else if (m.template_name === 'pedido_entregue') text = textoEntregue(nome, pedido);
  else if (m.template_name === 'pedido_enviado') {
    const bruto = String(cf.tracking_number || '').trim();
    if (!bruto) { out.push({ json: Object.assign(base, { skip: true, motivo: 'sem_rastreio', text: '' }) }); continue; }
    const cod = soCodigo(bruto);
    if (!cod) { out.push({ json: Object.assign(base, { skip: true, motivo: 'rastreio_invalido: ' + bruto.slice(0, 80), text: '' }) }); continue; }
    text = textoEnviado(nome, pedido, String(cf.tracking_company || 'transportadora'), cod);
  }
  if (!text) { out.push({ json: Object.assign(base, { skip: true, motivo: 'template_sem_texto', text: '' }) }); continue; }
  out.push({ json: Object.assign(base, { skip: false, motivo: null, text: text }) });
}
return out;
