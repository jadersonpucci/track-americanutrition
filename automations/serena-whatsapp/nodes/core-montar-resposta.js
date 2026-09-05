// Nó "Montar Resposta" do workflow [Serena] Core (5Z5MdXAiatwnjc73).
// Normaliza o markdown para o formato do WhatsApp e repassa para quem chamou o Core
// (Entrada Samuel, Inbox, Meta, site) os campos que o canal precisa para entregar a resposta:
// texto, lista clicavel e arquivo (PDF/imagem).
const c = $('Cerebro Serena').first().json;
const canal = $('Normalizar').first().json.entrada.canal;

// WhatsApp usa *negrito* e _italico_. Markdown padrao (**, ##, ###) aparece
// literal na tela, entao normaliza antes de entregar.
function paraWhatsApp(txt) {
  if (!txt) return txt;
  let t = String(txt);
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '*$1*');
  t = t.replace(/\*\*(.+?)\*\*/g, '*$1*');
  t = t.replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, '*$1*');
  t = t.replace(/^\s{0,3}[-*+]\s+/gm, '• ');
  t = t.replace(/__(.+?)__/g, '_$1_');
  t = t.replace(/^\s*```.*$/gm, '');
  t = t.replace(/[ \t]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

const textoCanais = ['whatsapp', 'site', 'telegram', 'instagram', 'messenger', 'sms'];
const resposta = textoCanais.indexOf(canal) >= 0 ? paraWhatsApp(c.resposta) : c.resposta;

return [{ json: {
  ok: !c.erro,
  pausada: !!c.pausada,
  desligado: !!c.desligado,
  handoff: !!c.handoff,
  motivo_handoff: c.motivo_handoff || null,
  humor: c.humor || null,
  lacuna: c.lacuna || null,
  sugestao: !!c.sugestao,
  tags: c.tags || [],
  contato_id: c.contato_id,
  canal: canal,
  resposta: resposta,
  // lista clicavel e arquivo (PDF/imagem) que a Entrada envia junto com a resposta
  lista: c.lista || null,
  arquivo: c.arquivo || null,
  ferramentas: c.ferramentas || [],
  erro: c.erro || null
} }];
