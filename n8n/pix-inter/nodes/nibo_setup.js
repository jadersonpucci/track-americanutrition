// GET /webhook/inter-nibo-setup?t=TOKEN: garante no Nibo a conta bancaria do Inter e o cliente padrao, e grava os ids em checkout_config.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const q = $('Nibo Setup: Requisição').first().json.query || {};
if (!cfg.pix_admin_token || String(q.t || '') !== cfg.pix_admin_token) return [{ json: { ok: false, erro: 'nao autorizado', salvar: [] } }];
const NIBO_BANCO_INTER_ID = '2c436472-dcdb-4adf-b062-103c2dace4ec';
const CATEGORIA_VENDAS_ID = 'e900f1af-b0b1-4248-936c-026a69c1dbb7';
const NOME_CONTA = String(q.conta_nome || 'Inter - America Nutrition');
const NOME_CLIENTE = String(q.cliente_nome || 'BANCO INTER - PIX');
const dig = s => String(s == null ? '' : s).replace(/[^0-9]/g, '');
const api = async (method, path, body, query) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/nibo-api', json: true, timeout: 30000, body: { k: cfg.pix_admin_token, method: method, path: path, body: body || null, query: query || {} } });
  return r || { ok: false };
};
const out = { ok: true, passos: [], salvar: [] };

// 1) conta bancaria do Inter
let contaId = String(cfg.nibo_conta_inter_id || '');
try {
  const r = await api('GET', 'accounts', null, { '$top': '200' });
  const itens = (r.body && r.body.items) || [];
  let conta = contaId ? itens.find(a => a.id === contaId) : null;
  if (!conta) conta = itens.find(a => !a.isArchived && (String(a.bankNumber) === '77' || /inter/i.test(String(a.name || ''))));
  if (!conta) {
    const cc = dig(cfg.inter_conta_corrente);
    const corpo = { name: NOME_CONTA, bankId: NIBO_BANCO_INTER_ID, bankAgency: '0001', openBalance: 0, dateOfOpenBalance: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) };
    if (cc.length > 1) { corpo.bankAccount = cc.slice(0, -1); corpo.bankAccountVerificationNumber = cc.slice(-1); }
    const c = await api('POST', 'accounts', corpo);
    out.passos.push({ passo: 'criar conta', ok: c.ok, http: c.statusCode, resposta: c.body });
    const r2 = await api('GET', 'accounts', null, { '$top': '200' });
    conta = ((r2.body && r2.body.items) || []).find(a => !a.isArchived && (a.name === NOME_CONTA || String(a.bankNumber) === '77')) || null;
  }
  if (conta) { contaId = conta.id; out.passos.push({ passo: 'conta Inter', ok: true, id: conta.id, nome: conta.name }); }
  else { out.ok = false; out.passos.push({ passo: 'conta Inter', ok: false, erro: 'nao encontrada nem criada' }); }
} catch (e) { out.ok = false; out.passos.push({ passo: 'conta Inter', ok: false, erro: String(e && e.message || e) }); }

// 2) cliente padrao (stakeholder) dos recebimentos. O $filter de customers e ignorado pelo Nibo: filtra aqui.
let clienteId = String(cfg.nibo_cliente_id || '');
try {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const listar = async () => { const r = await api('GET', 'customers', null, { '$top': '500' }); return ((r.body && r.body.items) || []).filter(c => !c.isDeleted && !c.isArchived); };
  let lista = await listar();
  let cli = clienteId ? lista.find(c => c.id === clienteId && norm(c.name) === norm(NOME_CLIENTE)) : null;
  if (!cli) cli = lista.find(c => norm(c.name) === norm(NOME_CLIENTE)) || null;
  if (!cli) {
    const c = await api('POST', 'customers', { name: NOME_CLIENTE, communication: { contactName: 'Banco Inter' }, address: { country: 'Brasil' } });
    out.passos.push({ passo: 'criar cliente', ok: c.ok, http: c.statusCode, resposta: c.body });
    if (c.ok && c.body && typeof c.body === 'object' && c.body.id) cli = c.body;
    else if (c.ok && typeof c.body === 'string' && c.body.length > 10) cli = { id: c.body.replace(/"/g, '') };
    else { lista = await listar(); cli = lista.find(x => norm(x.name) === norm(NOME_CLIENTE)) || null; }
  }
  clienteId = (cli && cli.id) ? cli.id : '';
  if (clienteId) out.passos.push({ passo: 'cliente padrao', ok: true, id: clienteId, nome: NOME_CLIENTE });
  else { out.ok = false; out.passos.push({ passo: 'cliente padrao', ok: false, erro: 'crie no Nibo um cliente "' + NOME_CLIENTE + '" e grave o id em checkout_config.nibo_cliente_id' }); }
} catch (e) { out.ok = false; out.passos.push({ passo: 'cliente padrao', ok: false, erro: String(e && e.message || e) }); }

// 3) categoria
let categoriaId = String(cfg.nibo_categoria_id || '') || CATEGORIA_VENDAS_ID;
try {
  const r = await api('GET', 'categories', null, { '$top': '300' });
  const itens = (r.body && r.body.items) || [];
  const cat = itens.find(c => c.id === categoriaId) || itens.find(c => c.type === 'in' && /^vendas$/i.test(String(c.name || '')));
  if (cat) { categoriaId = cat.id; out.passos.push({ passo: 'categoria', ok: true, id: cat.id, nome: cat.name }); }
  else out.passos.push({ passo: 'categoria', ok: false, erro: 'categoria Vendas nao encontrada; usando ' + categoriaId });
} catch (e) { out.passos.push({ passo: 'categoria', ok: false, erro: String(e && e.message || e) }); }

if (contaId) out.salvar.push({ chave: 'nibo_conta_inter_id', valor: contaId });
if (clienteId) out.salvar.push({ chave: 'nibo_cliente_id', valor: clienteId });
if (categoriaId) out.salvar.push({ chave: 'nibo_categoria_id', valor: categoriaId });
out.config = { nibo_lancar: cfg.nibo_lancar || 'off', nibo_conta_inter_id: contaId, nibo_cliente_id: clienteId, nibo_categoria_id: categoriaId, nibo_tipos_lancar: cfg.nibo_tipos_lancar || '' };
out.dica = out.ok ? 'Pronto. Ligue com: update checkout_config set valor=\'on\' where chave=\'nibo_lancar\' (ou pelo painel).' : 'Corrija os passos com ok=false e rode de novo.';
out.salvar_json = JSON.stringify(out.salvar);
return [{ json: out }];
