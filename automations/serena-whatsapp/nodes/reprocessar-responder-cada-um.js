// No 'Responder cada um' do workflow [Serena WhatsApp] Reprocessar sem resposta (wXN30aD4YloMV2NN).
// Para cada cliente que ficou sem resposta: pede a resposta ao Core (modo reprocessar, nao regrava a pergunta) e manda pelo Samuel.
let body = {};
try { body = ($('Webhook Reprocessar').first().json || {}).body || {}; } catch (e) { try { body = ($('Ping Claude').first().json || {}).body || {}; } catch (e2) { body = {}; } }
const simular = body.simular === true;
const alvos = $input.all().map(i => i.json).filter(a => a && a.contato_id && a.telefone && String(a.texto || '').trim());

// RESPOSTA AUTOMATICA DE AUSENCIA (15/10/2026): o silencio da Serena diante do "no momento nao posso atender,
// retorno assim que possivel" do WhatsApp Business do cliente e proposital, nao falha. Reprocessar mandava a
// Serena "responder a tudo o que ficou pendente" e, no caso Sheila (14/10 18:57), ela escreveu para a cliente a
// propria justificativa de nao responder. Mesmo detector da Entrada (nodes/entrada-chamar-serena-core.js).
const normA = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
function ehAutoResposta(txt) {
  const t = normA(txt);
  if (!t || t.length > 600 || /^\[cliente enviou/.test(t) || /\?/.test(t)) return false;
  if (/\b(quero|queria|link|pedido|frasco|preco|valor|comprar|pix|boleto|cartao|imunofosfo)\b/.test(t)) return false;
  const ausente = /(nao (estamos|estou) (disponive|disponiv)|nao (posso|podemos|consigo) (atender|responder)|no momento (nao (posso|podemos|estamos|estou)|estamos ocupad|estou ocupad)|estarei ausente|estou ausente|fora do horario|deixe sua mensagem|mensagem automatica|resposta automatica)/.test(t);
  const retorno = /(assim que (possivel|puder)|em breve|retornare(i|mos)|retorno|responde(rei|remos)|entrare(i|mos) em contato|lhe atenderemos|atenderemos)/.test(t);
  return ausente && retorno;
}

const out = [];
for (const a of alvos) {
  const texto = String(a.texto).trim();
  if (/^\[(unsupported|attachment)\]$/i.test(texto)) { out.push({ contato: a.nome, telefone: a.telefone, status: 'pulado', motivo: 'sem texto' }); continue; }
  if (ehAutoResposta(texto)) { out.push({ contato: a.nome, telefone: a.telefone, status: 'pulado', motivo: 'resposta automatica de ausencia' }); continue; }
  if (simular) { out.push({ contato: a.nome, telefone: a.telefone, status: 'simulado', texto: texto.slice(0, 120) }); continue; }
  let r = null, envio = null, erro = null;
  try {
    r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-core', json: true, timeout: 180000,
      body: { canal: 'whatsapp', telefone: a.telefone, nome: a.nome || '', modo: 'reprocessar', texto: texto } });
  } catch (e) { erro = 'core: ' + e.message; }
  if (!erro && r && r.ok && r.resposta && !r.pausada) {
    try {
      envio = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar', json: true, timeout: 60000, body: { number: a.telefone, text: r.resposta, delay: 1200 } });
    } catch (e) { erro = 'envio: ' + e.message; }
  } else if (!erro) { erro = (r && r.erro) || (r && r.pausada ? 'pausada' : 'sem resposta'); }
  const ok = !erro && envio && envio.ok;
  out.push({ contato: a.nome, telefone: a.telefone, status: ok ? 'respondido' : 'falhou', erro: ok ? null : String(erro || JSON.stringify(envio)).slice(0, 200), resposta: ok ? String(r.resposta).slice(0, 100) : null });
  if (!ok && /credit|balance|billing/i.test(String(erro))) { out.push({ status: 'parado', motivo: 'saldo da API ainda esgotado' }); break; }
  await new Promise(res => setTimeout(res, 1500));
}
const resumo = { total: alvos.length, respondidos: out.filter(o => o.status === 'respondido').length, falhas: out.filter(o => o.status === 'falhou').length, simular: simular, itens: out };
// avisa no Telegram quando respondeu alguem automaticamente
if (!simular && resumo.respondidos > 0) {
  try { await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-alerta', json: true, timeout: 10000, body: { chave: 'reprocessado', minutos: 1, texto: '✅ <b>Serena voltou</b>: respondeu ' + resumo.respondidos + ' cliente(s) que estavam esperando' + (resumo.falhas ? ' (' + resumo.falhas + ' falha(s))' : '') + '.' } }); } catch (e) {}
}
return [{ json: resumo }];
