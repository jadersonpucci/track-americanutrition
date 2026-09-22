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
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // 22/09: o cliente mandou o comprovante do PIX e a Entrada guarda isso como
    // "[Cliente enviou uma imagem: Comprovante de PIX...]". A palavra "imagem" ligava a rede
    // e ele recebeu a foto do frasco sem pedir. Agora: descricao de midia recebida nunca conta,
    // e falar em foto so vale se vier junto de um pedido de verdade.
    const tCli = norm(ent.texto);
    const ehMidiaRecebida = /(cliente|contato)\s+enviou/.test(tCli) || /^\s*\[?\s*(imagem|audio|video|documento|figurinha|sticker)\b/.test(tCli);
    const falaFoto = /\b(foto|fotos|imagem|imagens)\b/.test(tCli) || /(me mostra|mostra o produto|ver o produto|como e o (frasco|produto|pote|vidro))/.test(tCli);
    const pedeAlgo = /\b(manda|mande|mandar|envia|envie|enviar|tem|teria|quero|queria|posso|pode|poderia|mostra|mostrar|ver|qual|quais|como|existe)\b/.test(tCli) || /\?/.test(String(ent.texto || ''));
    const pediuFoto = !ehMidiaRecebida && falaFoto && pedeAlgo;
    if (pediuFoto && fotos.length) {
      const bate = txt => {
        const t = norm(txt);
        if (!t) return null;
        return fotos.find(d => (Array.isArray(d.termos) ? d.termos : []).map(norm).filter(g => g.length >= 3).some(g => t.indexOf(g) >= 0)) || null;
      };
      let doc = bate(ent.texto) || bate(texto);
      if (!doc) {
        const h = Array.isArray(ctx.historico) ? ctx.historico : [];
        for (let i = 0; i < h.length && i < 6; i++) { const cand = bate(h[i] && h[i].texto); if (cand) { doc = cand; break; } }
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
  lista: c.lista || null,
  arquivo: arquivo || null,
  ferramentas: c.ferramentas || [],
  erro: c.erro || null
} }];

