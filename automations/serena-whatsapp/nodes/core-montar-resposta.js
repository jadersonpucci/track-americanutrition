const c = $('Cerebro Serena').first().json;
const ent = $('Normalizar').first().json.entrada;
const canal = ent.canal;

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

let texto = c.resposta;
let arquivo = c.arquivo || null;

// MIDIA RECEBIDA NAO E O CLIENTE FALANDO (14/10/2026). A Entrada grava a foto/PDF do cliente como
// "[Cliente enviou uma imagem: <descricao escrita pelo nosso modelo>]" (+ "Legenda do cliente: ..." quando
// ha legenda). Essa descricao cita produto ("foto do rotulo do ImunoFosfo 90 capsulas") e liga as redes de
// arquivo, que casam termos/gatilhos contra o texto do cliente: a Serena mandava foto ou rotulo sem ninguem
// pedir. semMidia() tira so a descricao e mantem a legenda, que e o cliente falando de verdade.
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const semMidia = t => String(t == null ? '' : t)
  .replace(/\[\s*(?:cliente|contato)\s+enviou[^\]]*\]/gi, ' ')
  .replace(/legenda do cliente\s*:/gi, ' ')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();
const temMidia = /\[\s*(?:cliente|contato)\s+enviou/i.test(String(ent.texto || ''));
const textoCli = semMidia(ent.texto);
const verboEnvio = t => /(segue|segui|mand|envi|anex|encaminh|aqui esta|aqui vai)/.test(norm(t));

// VETO DO ARQUIVO DO CEREBRO. A segunda rede do node grande casa os gatilhos do documento contra o texto
// do cliente, e esse texto inclui a descricao da midia. Aqui, quando houve midia e o documento escolhido
// NAO se explica nem pela legenda do cliente nem pela resposta da Serena, o anexo nao vai. O marcador
// explicito ([[ARQUIVO: x]]) continua passando porque o prompt exige uma frase de envio antes dele.
try {
  if (arquivo && temMidia && !c.sugestao) {
    const ctx0 = $('Carregar Contexto').first().json || {};
    let docs0 = [];
    try { docs0 = Array.isArray(ctx0.documentos) ? ctx0.documentos : JSON.parse(ctx0.documentos || '[]'); } catch (e) { docs0 = []; }
    const doc0 = docs0.find(d => d && norm(d.chave) === norm(arquivo.chave));
    if (doc0) {
      const alvos = []
        .concat(Array.isArray(doc0.gatilhos) ? doc0.gatilhos : [])
        .concat(Array.isArray(doc0.termos) ? doc0.termos : [])
        .concat([doc0.chave, doc0.nome])
        .map(norm).filter(g => g.length >= 4);
      const tLimpo = norm(textoCli);
      const tResp = norm(texto);
      const justificado = alvos.some(g => tLimpo.indexOf(g) >= 0) || (verboEnvio(texto) && alvos.some(g => tResp.indexOf(g) >= 0));
      if (!justificado) arquivo = null;
    }
  }
} catch (e) { /* fail-open: na duvida o anexo segue como o Cerebro decidiu */ }

// FOTO DE PRODUTO (21/09/2026). Rede de seguranca: em 21/09 um cliente pediu "Tem foto do produto" e a Serena
// respondeu "nao tenho como enviar foto por aqui" com o link do site, porque nao havia foto cadastrada. Agora as
// fotos estao em serena_config.documentos (tipo image) e ela marca [[ARQUIVO: foto_...]] sozinha; se esquecer o
// marcador, aqui o arquivo e anexado: acha o produto pelos termos na pergunta, na resposta ou no historico
// recente (campo 'termos', que a rede antiga do Cerebro nao le, senao "quanto custa o imunofosfo 90" mandaria
// foto sem ninguem pedir) e, sem nada disso, manda o frasco de 90. Mora aqui para nao mexer no node grande.
try {
  if (!arquivo && !c.sugestao && String(ent.modo || '') !== 'proativo' && String(texto || '').trim()) {
    const ctx = $('Carregar Contexto').first().json || {};
    let docs = [];
    try { docs = Array.isArray(ctx.documentos) ? ctx.documentos : JSON.parse(ctx.documentos || '[]'); } catch (e) { docs = []; }
    const fotos = docs.filter(d => d && d.chave && d.url && String(d.tipo) === 'image');
    // 22/09: o cliente mandou o comprovante do PIX e a palavra "imagem" da descricao ligava esta rede.
    // Antes o turno inteiro era descartado quando havia midia, o que silenciava quem manda foto COM legenda
    // pedindo foto. Agora vale a legenda, e so ela.
    const tCli = norm(textoCli);
    const falaFoto = /\b(foto|fotos|imagem|imagens)\b/.test(tCli) || /(me mostra|mostra o produto|ver o produto|como e o (frasco|produto|pote|vidro))/.test(tCli);
    const pedeAlgo = /\b(manda|mande|mandar|envia|envie|enviar|tem|teria|quero|queria|posso|pode|poderia|mostra|mostrar|ver|qual|quais|como|existe)\b/.test(tCli) || /\?/.test(textoCli);
    const pediuFoto = falaFoto && pedeAlgo;
    if (pediuFoto && fotos.length) {
      const bate = txt => {
        const t = norm(txt);
        if (!t) return null;
        return fotos.find(d => (Array.isArray(d.termos) ? d.termos : []).map(norm).filter(g => g.length >= 3).some(g => t.indexOf(g) >= 0)) || null;
      };
      let doc = bate(textoCli) || bate(texto);
      if (!doc) {
        const h = Array.isArray(ctx.historico) ? ctx.historico : [];
        for (let i = 0; i < h.length && i < 6; i++) { const cand = bate(semMidia(h[i] && h[i].texto)); if (cand) { doc = cand; break; } }
      }
      if (!doc) doc = fotos.find(d => /_90$/.test(String(d.chave))) || fotos[0];
      if (doc) {
        arquivo = { chave: doc.chave, url: doc.url, tipo: 'image', nome: doc.nome || 'foto.jpg', legenda: doc.legenda || '' };
        // o cliente nao pode ler "nao tenho como enviar foto" e receber a foto na mensagem seguinte
        if (/n[aoã]o\s+(tenho|consigo|posso|d[aá])\s+(como\s+)?(te\s+)?(enviar|mandar|passar)/i.test(String(texto))) {
          texto = 'Claro! \u{1F499} Aqui esta a foto do *' + String(doc.nome || 'produto').replace(/\.(jpe?g|png)$/i, '').trim() + '*:';
        }
      }
    }
  }
} catch (e) { /* fail-open: sem foto, a resposta segue igual */ }

// BASTIDOR NAO VAI PARA O CLIENTE (15/10/2026). Caso Sheila, 14/10 18:57: o WhatsApp Business dela respondeu
// sozinho a confirmacao do pedido, a Serena ficou calada (certo), o reprocessamento pediu resposta e ela escreveu
// para a cliente "Essa mensagem e uma resposta automatica de ausencia, entao nao vou responder... Quando a Sheila
// escrever de verdade, eu retomo o atendimento". Texto que fala da propria decisao de nao responder vira silencio.
// Conferido sobre 54 mil respostas dos ultimos 30 dias: so esse caso bate.
try {
  const n = norm(texto).replace(/\s+/g, ' ');
  const bastidor = /(resposta|mensagem) automatica de ausencia|troca de mensagens automaticas|mensagens automaticas sem fim|loop de mensagens/.test(n)
    || /quando (a|o) [a-z]+( [a-z]+)? (escrever|responder|mandar mensagem|voltar a escrever) de verdade/.test(n)
    || (/\b(nao vou|nao irei|prefiro nao|melhor nao) (responder|retornar|interagir)\b/.test(n) && /(automatic|ausencia|\brobo\b|\bbot\b)/.test(n));
  if (bastidor && !c.sugestao) { texto = ''; arquivo = null; }
} catch (e) { /* fail-open */ }

const textoCanais = ['whatsapp', 'site', 'telegram', 'instagram', 'messenger', 'sms'];
const resposta = textoCanais.indexOf(canal) >= 0 ? paraWhatsApp(texto) : texto;

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
  lista: texto ? (c.lista || null) : null,
  arquivo: arquivo || null,
  ferramentas: c.ferramentas || [],
  erro: c.erro || null
} }];

