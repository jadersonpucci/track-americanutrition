// Normalizador do codigo de rastreio (04/09/2026).
// A transportadora as vezes preenche o campo tracking_number com a URL inteira
// (ex.: "https://envia.com/tracking?label=888030910163172"). O link oficial da AN e
// track.americanutrition.com/CODIGO, entao o valor precisa virar so o codigo antes de montar o link.
//
// Esta funcao esta colada nos 4 lugares que montam ou consomem o codigo:
//   1. [Transacional] Pedido Enviado (XzWcKoGQrvVhovb8), no "Preparar agendamento" — normaliza antes de gravar
//      em scheduled_messages; se nao der para extrair, nao agenda (motivo tracking_invalido).
//   2. [Transacional] Dispatcher Samuel v3 (WXncUehLXyuIMoSm), no "Montar Mensagem" — rede de seguranca na hora
//      de enviar; sem codigo valido a mensagem e pulada (motivo rastreio_invalido) em vez de sair com link quebrado.
//   3. [Serena] Painel API (YDUxkTRfg6uTucHB), no "Formatar" — ficha 360 do Inbox (nodes/painel-api-formatar.js).
//   4. [Serena] Rastreio Proativo (OtzYsPkyTEIfPG4P) — rastreio-proativo.workflow.js.
//
// Aceita: codigo puro, URL com ?label= / ?id= / #nums= / etc, URL do proprio track.americanutrition.com,
// e valores percent-encoded (ate 3 niveis). Devolve '' quando o valor nao parece um codigo de rastreio
// (precisa ter 8 a 40 caracteres alfanumericos e pelo menos um digito), para nunca montar link invalido.
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
