// No "Pagina ou Publicar" do workflow [Depoimentos] Review de Grupo (id 1z8vXF57zD3DicR2).
// GET /webhook/dep-review?t=TOKEN&id=<grupo_radar.id> — o botao do card do Radar abre aqui.
// A service key vai literal no no do n8n; aqui fica o placeholder.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const BASE = 'https://n8n.americanutrition.com/webhook/dep-review';
const TOKEN = 'an-dep-3Xk9Wq7Vz';
const LOJA = 'https://americanutrition.com.br/products/';
const self = this;
const NL = String.fromCharCode(10);

async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 });
  if (r && r.error) throw new Error(String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
const E = v => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Catalogo enxuto: os produtos que concentram os reviews. Serve so para o seletor da pagina.
const PRODUTOS = [
  { id: 7783594754220, handle: 'imunofosfo-fosfoetanolamina-phospho', titulo: 'ImunoFosfo' },
  { id: 8006262554796, handle: 'imunofosfo-liquid', titulo: 'ImunoFosfo Liquid' },
  { id: 8010080518316, handle: 'imunofosfo-healing', titulo: 'ImunoFosfo Healing' },
  { id: 8428616908972, handle: 'imunofosfo-diabetes', titulo: 'ImunoFosfo Diabetes' },
  { id: 8010079666348, handle: 'imunopet', titulo: 'ImunoPet - Fosfo para Pets' },
  { id: 8104946172076, handle: 'green-propolis-premium-propolis-verde', titulo: 'Green Propolis Premium' },
  { id: 8072351023276, handle: 'propolis-extract', titulo: 'Propolis Extract' },
  { id: 8072346828972, handle: 'd3-vitamin-with-k2-and-a', titulo: 'D3 Vitamin with K2 and A' },
  { id: 8072342470828, handle: 'omega-3-meg3', titulo: 'Omega 3 - Ultra Pure Fish Oil' },
  { id: 8198421414060, handle: 'creatine-ultra-micronized', titulo: 'Creatina Ultra Micronizada' },
  { id: 8359840153772, handle: 'life-hair', titulo: 'Life Hair - Biotina e Vitaminas' }
];

// Alegacao terapeutica: suplemento nao pode alegar que trata ou cura doenca (ANVISA RDC 240/243).
// Nao bloqueia nada, so avisa quem esta aprovando para decidir com o olho aberto.
const TERMOS = ['cura', 'curou', 'curado', 'curada', 'curar', 'remissao', 'remissão', 'tumor', 'cancer', 'câncer', 'metastase', 'metástase', 'quimio', 'radioterapia', 'psa', 'prostata', 'próstata', 'diabete', 'hiperplasia', 'desapareceu', 'sumiu', 'regrediu', 'reduziu', 'zerou', 'nao precisou de cirurgia', 'não precisou de cirurgia', 'evitou cirurgia', 'parou o remedio', 'parou o remédio', 'deixou o remedio', 'deixou o remédio', 'substituiu o tratamento'];
function alegacoes(txt) {
  const t = String(txt || '').toLowerCase();
  const achou = [];
  for (const termo of TERMOS) { if (t.indexOf(termo) >= 0 && achou.indexOf(termo) < 0) achou.push(termo); }
  return achou.slice(0, 8);
}

// "MARCIA GABRIELA SP" -> "Marcia G." (padrao de review de e-commerce: identifica sem expor)
function nomeCurto(bruto) {
  // push_name as vezes e um email ou apelido: nao da para inventar nome, quem aprova digita
  if (String(bruto || '').indexOf('@') >= 0) return 'Cliente';
  let s = String(bruto || '').replace(/[^\p{L}\s.]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return 'Cliente';
  const partes = s.split(' ').filter(p => p.length > 1);
  if (!partes.length) return 'Cliente';
  const cap = p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  const primeiro = cap(partes[0]);
  if (partes.length === 1) return primeiro;
  return primeiro + ' ' + partes[partes.length - 1].charAt(0).toUpperCase() + '.';
}

const CSS = 'body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;max-width:680px;margin:0 auto;padding:20px 16px 48px;color:#12203a;line-height:1.5;background:#f4f6fa}'
  + '.topo{background:#07388E;color:#fff;border-radius:14px;padding:16px 18px;margin-bottom:16px}.topo h1{font-size:18px;margin:0 0 4px}.topo p{margin:0;opacity:.85;font-size:13px}'
  + '.card{background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:16px;margin:12px 0}'
  + '.rot{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b7a90;margin:0 0 6px}'
  + '.orig{white-space:pre-wrap;background:#f6f7f9;border-left:3px solid #c9d3e2;border-radius:6px;padding:10px 12px;font-size:14px;color:#3a475c}'
  + 'label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}'
  + 'input[type=text],textarea,select{width:100%;box-sizing:border-box;border:1px solid #ccd5e2;border-radius:8px;padding:10px;font:inherit;font-size:15px;background:#fff}'
  + 'textarea{min-height:150px;resize:vertical}'
  + '.linha{display:flex;gap:10px}.linha>div{flex:1}'
  + '.aviso{background:#fff6e5;border:1px solid #f0c674;border-radius:10px;padding:12px 14px;font-size:14px;margin:12px 0}.aviso b{color:#8a5b00}'
  + '.btn{display:inline-block;border:0;background:#108474;color:#fff;font:inherit;font-size:15px;font-weight:600;padding:12px 20px;border-radius:10px;cursor:pointer;text-decoration:none;margin-top:16px}'
  + '.btn.sec{background:#fff;color:#8a94a6;border:1px solid #ccd5e2;font-weight:500;padding:11px 18px}'
  + '.meta{font-size:13px;color:#6b7a90}.meta b{color:#12203a;font-weight:600}'
  + '.ok{background:#108474;color:#fff;border-radius:14px;padding:18px}.ok h1{margin:0 0 6px;font-size:18px}.ok a{color:#fff}';

const pagina = (titulo, corpo) => '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title><style>' + CSS + '</style></head><body>' + corpo + '</body></html>';
const erro = (msg) => [{ json: { html: pagina('Depoimento', '<div class="card"><h1>' + esc(msg) + '</h1></div>') } }];

const q = $input.first().json.query || {};
if (String(q.t || '') !== TOKEN) return erro('Link invalido ou expirado.');
const id = Number(q.id || 0);
if (!id) return erro('Depoimento nao informado.');

const linhas = await sql('select id, grupo_nome, push_name, autor, texto, confianca, resumo, criado_em, decisao, review_id::text as review_id from grupo_radar where id = ' + id + ' and tipo = ' + E('depoimento') + ' limit 1');
const d = linhas[0];
if (!d) return erro('Depoimento nao encontrado.');

const acao = String(q.acao || '').toLowerCase();

// Ja decidido: mostra o que aconteceu em vez de deixar publicar de novo
if (d.decisao && acao !== 'ver') {
  const jaTxt = d.decisao === 'publicado'
    ? 'Este depoimento ja virou review no site.' + (d.review_id ? ' (id ' + esc(d.review_id) + ')' : '')
    : 'Este depoimento foi descartado.';
  return [{ json: { html: pagina('Depoimento', '<div class="card"><p class="rot">Ja resolvido</p><p>' + esc(jaTxt) + '</p></div>') } }];
}

if (acao === 'descartar') {
  await sql('update grupo_radar set decisao = ' + E('descartado') + ', decidido_em = now() where id = ' + id);
  return [{ json: { html: pagina('Descartado', '<div class="card"><p class="rot">Pronto</p><p>Depoimento descartado. Nada foi publicado.</p></div>') } }];
}

if (acao === 'publicar') {
  const texto = String(q.texto || '').trim();
  const nome = String(q.nome || '').trim().slice(0, 80) || 'Cliente';
  let rating = parseInt(q.rating, 10); if (!(rating >= 1 && rating <= 5)) rating = 5;
  const handle = String(q.produto || '').trim();
  const prod = PRODUTOS.filter(p => p.handle === handle)[0] || PRODUTOS[0];
  const status = String(q.destaque || '') === '1' ? 'destaque' : 'aprovado';
  if (texto.length < 20) return erro('O texto do depoimento ficou curto demais para publicar.');

  // Rastro da origem: se alguem questionar o review, da para provar de onde veio.
  const flags = JSON.stringify({ fonte: 'grupo_whatsapp', radar_id: d.id, grupo: d.grupo_nome, autor: d.autor, push_name: d.push_name, confianca: d.confianca, texto_original: String(d.texto || '').slice(0, 1500) });
  const ins = await sql('insert into reviews (product_id, product_handle, product_title, cliente_nome, cliente_whatsapp, rating, texto, status, verified, origem, ia_flags) values ('
    + prod.id + ', ' + E(prod.handle) + ', ' + E(prod.titulo) + ', ' + E(nome) + ', ' + E(d.autor) + ', ' + rating + ', ' + E(texto) + ', ' + E(status) + ', false, ' + E('whatsapp') + ', ' + E(flags) + '::jsonb) returning id::text as id');
  const reviewId = (ins[0] && ins[0].id) || '';
  await sql('update grupo_radar set decisao = ' + E('publicado') + ', decidido_em = now(), review_id = ' + (reviewId ? E(reviewId) + '::uuid' : 'null') + ' where id = ' + id);

  const corpo = '<div class="ok"><h1>Review publicado</h1><p>' + esc(nome) + ' &middot; ' + rating + ' estrelas &middot; ' + esc(prod.titulo) + (status === 'destaque' ? ' &middot; em destaque' : '') + '</p></div>'
    + '<div class="card"><p class="rot">Como ficou</p><div class="orig">' + esc(texto) + '</div>'
    + '<p class="meta" style="margin-top:12px"><a href="' + LOJA + esc(prod.handle) + '">Ver na pagina do produto</a></p></div>';
  return [{ json: { html: pagina('Review publicado', corpo) } }];
}

// --- formulario ---
const textoSugerido = String(d.texto || '').replace(/\r/g, '').replace(/\n{3,}/g, NL + NL).trim();
const nomeSugerido = nomeCurto(d.push_name);
const achados = alegacoes(textoSugerido);
const dataBr = String(d.criado_em || '').slice(0, 10).split('-').reverse().join('/');

let opcoes = '';
for (const p of PRODUTOS) { opcoes += '<option value="' + esc(p.handle) + '">' + esc(p.titulo) + '</option>'; }
let estrelas = '';
for (let n = 5; n >= 1; n--) { estrelas += '<option value="' + n + '">' + n + ' estrela' + (n > 1 ? 's' : '') + '</option>'; }

let corpo = '<div class="topo"><h1>Depoimento espontaneo</h1><p>Revise e publique como review no site</p></div>';
corpo += '<div class="card"><p class="meta"><b>' + esc(d.push_name || 'sem nome') + '</b> &middot; ' + esc(d.grupo_nome || '') + ' &middot; ' + esc(dataBr) + ' &middot; confianca ' + (d.confianca || 0) + '%</p>';
corpo += '<p class="rot" style="margin-top:12px">Mensagem original no grupo</p><div class="orig">' + esc(d.texto) + '</div></div>';

if (achados.length) {
  corpo += '<div class="aviso"><b>Atencao: alegacao terapeutica.</b> O texto cita ' + esc(achados.join(', ')) + '. Suplemento nao pode alegar que trata ou cura doenca (ANVISA RDC 240/243), e review no seu site conta como publicidade. Considere editar o texto antes de publicar, ou publicar assim mesmo por sua conta.</div>';
}

corpo += '<form method="get" action="' + BASE + '" class="card">';
corpo += '<input type="hidden" name="t" value="' + esc(TOKEN) + '"><input type="hidden" name="id" value="' + id + '"><input type="hidden" name="acao" value="publicar">';
corpo += '<label for="nome">Nome que aparece no site</label><input type="text" id="nome" name="nome" value="' + esc(nomeSugerido) + '" maxlength="80">';
corpo += '<label for="texto">Texto do review (edite a vontade)</label><textarea id="texto" name="texto">' + esc(textoSugerido) + '</textarea>';
corpo += '<div class="linha"><div><label for="produto">Produto</label><select id="produto" name="produto">' + opcoes + '</select></div>';
corpo += '<div><label for="rating">Nota</label><select id="rating" name="rating">' + estrelas + '</select></div></div>';
corpo += '<label style="font-weight:500;margin-top:14px"><input type="checkbox" name="destaque" value="1" style="width:auto;margin-right:6px">Marcar como destaque</label>';
corpo += '<button class="btn" type="submit">Publicar review</button>';
corpo += '</form>';
corpo += '<p><a class="btn sec" href="' + BASE + '?t=' + esc(TOKEN) + '&id=' + id + '&acao=descartar">Descartar</a></p>';
corpo += '<p class="meta">Publica como origem <b>whatsapp</b>, sem selo de compra verificada. O texto original fica guardado no review para consulta.</p>';

return [{ json: { html: pagina('Depoimento de grupo', corpo) } }];
