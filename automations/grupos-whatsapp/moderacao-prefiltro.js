const GRUPOS = {
  '120363233277583685@g.us': 'Fosfoetanolamina (ImunoFosfo)',
  '120363246659395526@g.us': '#1 ImunoFosfo',
  '120363353982971871@g.us': 'ImunoFosfo Connect Oncologicas',
  '120363307265095030@g.us': '#2 ImunoFosfo',
  '120363423321725793@g.us': 'Fosfoetanolamina (ImunoFosfo) #2',
  '120363407686844370@g.us': '#3 ImunoFosfo',
  '120363426145445382@g.us': 'Depoimentos sobre ImunoFosfo',
  '120363404254700593@g.us': 'ImunoFosfo Diabetes Oficial',
  '120363407289053552@g.us': '#1 ImunoFosfo Diabetes',
  '120363425146226301@g.us': '#4 ImunoFosfo',
  '120363429298095918@g.us': 'QA Teste Evolution'
};
const raw = $json.body || $json;
const d = raw.data || raw;
const key = d.key || {};
const jid = String(key.remoteJid || '');
if (!GRUPOS[jid]) return [];
if (key.fromMe === true) return [];
const m = d.message || {};
let texto = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || (m.imageMessage && m.imageMessage.caption) || '';
// Convite nativo de grupo (cartao do WhatsApp) vira texto com o link, para cair na mesma regra
const gi = m.groupInviteMessage || null;
if (gi && !texto) { texto = 'Convite de grupo: ' + String(gi.groupName || '') + ' https://chat.whatsapp.com/' + String(gi.inviteCode || '') + (gi.caption ? ' ' + String(gi.caption) : ''); }
texto = String(texto).trim();
if (texto.length < 8 || texto.length > 1200) return [];
const autor = String(key.participant || d.participant || '');
const autorNum = autor.split('@')[0].replace(/[^0-9]/g, '');
const EQUIPE = ['5513981885555', '16464270203', '13472225493'];
if (EQUIPE.indexOf(autorNum) !== -1) return [];
const msgId = String(key.id || '');
if (!msgId) return [];
const st = $getWorkflowStaticData('global');
const agora = Date.now();
st.vistos = st.vistos || {};
for (const k in st.vistos) { if (agora - st.vistos[k] > 3600000) { delete st.vistos[k]; } }
if (st.vistos[msgId]) return [];
st.vistos[msgId] = agora;
const n = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
let telefone = null;
let ehAdmin = false;
try {
  const g = await this.helpers.httpRequest({ method: 'GET', url: EVO + '/group/participants/Samuel?groupJid=' + encodeURIComponent(jid), headers: { apikey: EVO_KEY }, json: true, timeout: 30000 });
  const ps = (g && (g.participants || g)) || [];
  for (const p of ps) {
    const lid = String((p && p.id) || '').split('@')[0];
    const ph = String((p && p.phoneNumber) || '').split('@')[0];
    if (lid === autorNum || ph === autorNum) { telefone = ph || null; if (p.admin) { ehAdmin = true; } }
  }
} catch (e) { }
if (ehAdmin) return [];
const base = { jid: jid, grupo_nome: GRUPOS[jid], msg_id: msgId, participant: autor, autor_num: autorNum, telefone: telefone, push_name: String(d.pushName || ''), texto: texto };

// LINK DE GRUPO DE WHATSAPP (set/2026): so os grupos oficiais da lista GRUPOS podem ser divulgados.
// Convite para qualquer outro grupo e apagado na hora, sem passar pela IA. O codigo do convite e resolvido na
// Evolution (inviteInfo) para saber qual grupo e; se nao der para confirmar, so alerta (confianca 60).
const conv = texto.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i);
if (conv) {
  const code = conv[1];
  let alvoJid = gi && gi.groupJid ? String(gi.groupJid) : null;
  let alvoNome = gi && gi.groupName ? String(gi.groupName) : '';
  let falha = false;
  if (!alvoJid) {
    try {
      const info = await this.helpers.httpRequest({ method: 'GET', url: EVO + '/group/inviteInfo/Samuel?inviteCode=' + encodeURIComponent(code), headers: { apikey: EVO_KEY }, json: true, timeout: 20000 });
      alvoJid = String((info && (info.id || (info.groupInfo && info.groupInfo.id))) || '') || null;
      alvoNome = String((info && (info.subject || (info.groupInfo && info.groupInfo.subject))) || '');
    } catch (e) { falha = true; }
  }
  let oficial = !!(alvoJid && GRUPOS[alvoJid]);
  let erros = 0;
  if (!oficial && !alvoJid) {
    // convite invalido/expirado ou Evolution fora: confere pelo codigo dos grupos oficiais
    for (const gj of Object.keys(GRUPOS)) {
      try {
        const r = await this.helpers.httpRequest({ method: 'GET', url: EVO + '/group/inviteCode/Samuel?groupJid=' + encodeURIComponent(gj), headers: { apikey: EVO_KEY }, json: true, timeout: 15000 });
        if (r && String(r.inviteCode || '') === code) { oficial = true; break; }
      } catch (e) { erros++; }
    }
  }
  if (oficial) return [];
  const seguro = alvoJid || erros === 0;
  return [{ json: Object.assign({ direto: true, categoria: 'link_grupo_externo', confianca: seguro ? 100 : 60,
    motivo: 'Convite para grupo de fora' + (alvoNome ? ' ("' + alvoNome.slice(0, 60) + '")' : '') + (seguro ? '. So grupos oficiais ImunoFosfo podem ser divulgados.' : '. Nao consegui confirmar na Evolution (' + (falha ? 'inviteInfo falhou, ' : '') + erros + ' erros).') }, base) }];
}

const AUSENCIA = /(fora do (atendimento|expediente|escritorio)|nao estamos disponiveis|nao estou disponivel|estamos ausentes|no momento (nao posso|estou fora|nao estou)|retorno (sua|a sua) mensagem|responderemos assim que|responderei assim que|retornarei assim que|assim que possivel (retorno|responderei|retornarei)|mensagem automatica|resposta automatica|obrigad[oa] pelo seu contato|agradecemos (sua|o seu) (mensagem|contato)|nosso horario de atendimento|horario de funcionamento|atendemos de segunda|deixe sua mensagem que|se for urgente (pode |favor )?lig|em breve retornaremos|logo retornaremos)/;
const ASSINATURA = /(atenciosamente|corretor[a]? de imoveis|\bcreci\b|\bcrm\b|\boab\b|equipe de vendas|nossa equipe entrara em contato)/;
const ehAusencia = AUSENCIA.test(n) || (ASSINATURA.test(n) && texto.length > 90);
const TEM_LINK = /(https?:\/\/|www\.|\.com|\.br\b|\.net|\.shop|wa\.me\/|chat\.whatsapp)/.test(n);
const VENDA = /(vendo|a venda|mais barato|menor preco|promocao|desconto exclusivo|chama no (pv|privado|zap)|me chama no|faco (por|entrega)|pix|entrego|revend|distribuidor|representante|frete gratis so hoje)/.test(n);
const SPAM = /(aposta|bet\b|cassino|bingo|renda extra|ganhe dinheiro|trabalhe em casa|emprestimo|consignado|limpe seu nome|cripto|bitcoin|investimento|indique e ganhe r\$|clique aqui e receba|sorteio|premio|voce foi selecionad)/.test(n);
const CONC = /(phosphomax|fosfomax|calcium 2-?aep|2 aep|outro laboratorio|outra marca|compro de outro|tem mais barato em)/.test(n);
const GOLPE = /(sou (do|da) (equipe|suporte|atendimento)|central de atendimento|atualize seus dados|seu pedido esta retido|taxa de liberacao|pague a taxa|novo numero (do|da) (loja|empresa))/.test(n);
if (!(ehAusencia || (TEM_LINK && VENDA) || SPAM || CONC || GOLPE)) return [];
const SYS = 'Voce modera grupos de WhatsApp da America Nutrition, marca do suplemento ImunoFosfo. Boa parte dos membros tem cancer ou cuida de alguem com cancer. Classifique a MENSAGEM e responda SOMENTE um JSON valido, sem markdown, no formato {"categoria":"...","confianca":0,"motivo":"..."}.' + String.fromCharCode(10) + 'Categorias: ausencia_automatica (resposta automatica de ausencia disparada por um robo de WhatsApp Business quando a pessoa foi mencionada: avisa que esta fora do atendimento, fora do expediente, que retorna depois, horario de funcionamento, agradece o contato de forma generica, muitas vezes com assinatura profissional. NAO tem pergunta nem conteudo dirigido ao grupo), spam_venda (divulgando ou vendendo produto de outra loja ou marca, com link, preco ou convite para comprar), golpe (alguem se passando pela America Nutrition ou por atendimento oficial, pedindo pix, taxa ou dados), spam_geral (aposta, cassino, emprestimo, cripto, renda extra, corrente, sorteio falso), mencao_concorrente (cita outra marca mas NAO esta vendendo), reclamacao (cliente insatisfeito ou critica a marca), normal (qualquer outra coisa, inclusive relato pessoal, duvida, desabafo, oracao, agradecimento sincero de uma pessoa real).' + String.fromCharCode(10) + 'REGRAS: 1) So use ausencia_automatica se for claramente texto de robo, nao de pessoa escrevendo na hora. Um obrigado ou bom dia escrito por alguem e normal. 2) Relato de tratamento, desabafo, oracao e duvida sao SEMPRE normal. 3) Perguntar se alguem conhece outro produto e mencao_concorrente. 4) Reclamacao de cliente e SEMPRE reclamacao. 5) Use confianca alta apenas quando nao houver duvida nenhuma. Na duvida escolha a categoria menos grave e baixe a confianca. 6) motivo tem no maximo 110 caracteres.';
return [{ json: Object.assign({ direto: false, prompt_system: SYS, prompt_user: 'MENSAGEM NO GRUPO ' + GRUPOS[jid] + ':' + String.fromCharCode(10) + texto }, base) }];
