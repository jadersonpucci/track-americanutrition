// Node "Pre-filtro" do workflow "Grupos | Samuel Responde" (n8n 0OwXSCNKh3zpvyFG).
// Chaves reais so no n8n.
//
// SILENCIO E O PADRAO. Este no derruba, sem gastar IA, tudo que nao merece resposta: mensagem fora
// dos grupos oficiais, mensagem nossa, de equipe ou de admin, sem cara de pergunta, link puro, curta
// ou longa demais, repetida, ou com a chave geral desligada. So o que sobra vai para a classificacao.
//
// Por que existe: o bot antigo respondia "Ja vi nos sites!" com card de depoimentos e "gostaria de
// saber a mesma questao" com outro card. Reagia a afirmacao como se fosse pergunta. A mira aqui e
// dupla: um filtro barato de forma, e depois a IA decidindo se e pergunta DIRIGIDA ao grupo.
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
// Equipe e os admins fixos dos grupos. Admin tambem e conferido ao vivo na lista de participantes.
const EQUIPE = ['5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555'];
const SK = 'SUPABASE_SERVICE_KEY';
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (q) => { const r = await req({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); return Array.isArray(r) ? r : []; };

const raw = $json.body || $json;
const d = raw.data || raw;
const key = d.key || {};
const jid = String(key.remoteJid || '');
if (!GRUPOS[jid]) return [];
if (key.fromMe === true) return [];
const m = d.message || {};
let texto = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || (m.imageMessage && m.imageMessage.caption) || '';
texto = String(texto).trim();
if (texto.length < 6 || texto.length > 700) return [];
if (/^https?:\/\/\S+$/i.test(texto)) return [];
const msgId = String(key.id || '');
if (!msgId) return [];

// repetida (a Evolution as vezes entrega o mesmo upsert duas vezes)
const st = $getWorkflowStaticData('global');
const agora = Date.now();
st.vistos = st.vistos || {};
for (const k in st.vistos) { if (agora - st.vistos[k] > 3600000) delete st.vistos[k]; }
if (st.vistos[msgId]) return [];
st.vistos[msgId] = agora;

// cara de pergunta ou pedido? Barato, antes de qualquer chamada externa.
const n = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PERGUNTA = /\?|\b(como|quanto|quantas|quantos|qual|quais|onde|tem|teria|pode|podem|alguem|link|valor|preco|promo|promocao|desconto|comprar|compra|adquirir|pedido|chegou|chegar|chega|rastre|entrega|tomar|tomo|posologia|gotas|capsula|capsulas|versao|liquid|liquido|kids|pet|depoimento|depoimentos|relato|relatos)\b/;
if (!PERGUNTA.test(n)) return [];

// chave geral e lista de grupos liberados (serena_config)
const cfg = await sql("select chave, valor from serena_config where chave in ('grupo_bot_ativo','grupo_bot_grupos')");
const c = {}; cfg.forEach((r) => { c[r.chave] = String(r.valor || ''); });
if (String(c.grupo_bot_ativo || 'off') !== 'on') return [];
const permitidos = String(c.grupo_bot_grupos || 'todos').trim();
if (permitidos !== 'todos' && permitidos.split(',').map((s) => s.trim()).indexOf(jid) === -1) return [];

// autor: o WhatsApp manda @lid; o telefone vem em participantAlt/senderPn ou na lista do grupo
const part = String(key.participant || d.participant || '');
const lidNum = part.indexOf('@lid') !== -1 ? part.split('@')[0].replace(/\D/g, '') : '';
let telefone = String(key.participantAlt || key.senderPn || (part.indexOf('@lid') === -1 ? part : '')).split('@')[0].replace(/\D/g, '');
let ehAdmin = false;
try {
  const g = await req({ method: 'GET', url: EVO + '/group/participants/Samuel?groupJid=' + encodeURIComponent(jid), headers: { apikey: EVO_KEY }, json: true, timeout: 30000 });
  const ps = (g && (g.participants || g)) || [];
  for (const p of ps) {
    const lid = String((p && p.id) || '').split('@')[0].replace(/\D/g, '');
    const ph = String((p && p.phoneNumber) || '').split('@')[0].replace(/\D/g, '');
    if ((lidNum && lid === lidNum) || (telefone && ph === telefone)) { if (!telefone && ph) telefone = ph; if (p.admin) ehAdmin = true; }
  }
} catch (e) { }
if (ehAdmin) return [];
if (telefone && EQUIPE.indexOf(telefone) !== -1) return [];

const SYS = 'Voce classifica mensagens de grupos de WhatsApp da America Nutrition, marca do suplemento ImunoFosfo. Muitos membros tem cancer ou cuidam de alguem com cancer. Responda SOMENTE um JSON valido, sem markdown: {"intencao":"...","produto":"...","dirigida_ao_grupo":true,"confianca":0,"motivo":"..."}.'
  + ' INTENCOES, so estas: link_compra (pede o link, onde comprar ou como adquirir o ImunoFosfo ou outro produto da America Nutrition); preco_promocao (pergunta preco, valor, promocao, desconto ou parcelamento de produto da America Nutrition); como_tomar (pergunta como tomar, quantas capsulas ou gotas, horario ou intervalo de um produto da America Nutrition); versao_produto (pergunta se existe versao liquida, kids, pet, vegana, diabetes, ou os tamanhos); depoimentos (pede depoimentos, relatos, resultados, ou se alguem ja usou o ImunoFosfo); pedido_nao_chegou (diz que o pedido nao chegou, pergunta cade o pedido, rastreio ou quando chega); nenhuma (qualquer outra coisa).'
  + ' PRODUTO: imunofosfo_90, imunofosfo_180, imunofosfo_60, imunofosfo_42, imunofosfo_vegano, imunofosfo_liquid, imunofosfo_kids, imunofosfo_diabetes, imunopet, healing, omega3, outro, nenhum. Se a pessoa disse so "imunofosfo" sem tamanho, use imunofosfo_90. "Plus" ou "180" e imunofosfo_180. "Liquido" ou "gotas" e imunofosfo_liquid.'
  + ' dirigida_ao_grupo: true SOMENTE se e uma pergunta ou pedido feito ao grupo ou aos administradores, esperando resposta. false se e resposta a outra pessoa, comentario, afirmacao ("ja vi", "eu tambem", "gostaria de saber a mesma coisa", "que bom"), relato, oracao ou agradecimento.'
  + ' REGRAS: 1) Pergunta sobre doenca, sintoma, remedio, tratamento, medico, exame, outro suplemento, cha ou erva e SEMPRE nenhuma. 2) Pergunta de dose para uma doenca especifica ("quantas capsulas para cancer de X") e nenhuma; como_tomar e so a posologia geral do rotulo. 3) Pergunta sobre produto de outra marca e nenhuma. 4) Na duvida, nenhuma e confianca baixa. 5) motivo com no maximo 100 caracteres.';
const USER = 'GRUPO: ' + GRUPOS[jid] + String.fromCharCode(10) + 'MENSAGEM:' + String.fromCharCode(10) + texto;
return [{ json: { candidata: true, jid: jid, grupo_nome: GRUPOS[jid], msg_id: msgId, participant: part, telefone: telefone, push_name: String(d.pushName || ''), texto: texto, ts: Number(d.messageTimestamp || Math.floor(agora / 1000)), prompt_system: SYS, prompt_user: USER } }];
