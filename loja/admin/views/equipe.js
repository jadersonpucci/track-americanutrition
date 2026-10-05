// Equipe: papel de cada usuário no painel (mesmos logins do Financeiro) e registro de atividade.
import { db } from '../db.js';
import { esc, $, $$, toast } from '../ui.js';

export const PAPEIS = {
  dono: ['Dono', 'Tudo, inclusive mudar o papel dos outros'],
  gerente: ['Gerente', 'Tudo, menos mudar papéis'],
  expedicao: ['Expedição', 'Pedidos e estoque, sem ver valores'],
  conteudo: ['Conteúdo', 'Produtos, páginas, blog e vitrine'],
  sem_acesso: ['Sem acesso', 'Não entra no painel da loja'],
};
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export async function equipe(view, { crumb }) {
  crumb('<i class="ti ti-users"></i> Equipe e atividade');
  view.innerHTML = `<div class="page">
  ${db.demo ? '<div class="help amber" style="margin-bottom:12px">Modo demonstração: a lista de usuários é de exemplo. Conectado ao banco, aparecem os usuários do Financeiro e cada um recebe um papel.</div>' : ''}
  <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)">
    <div class="card"><div class="card-h"><h2 class="grow">Usuários</h2></div><div id="us"><div class="empty">Carregando…</div></div>
      <div class="card-b" style="border-top:1px solid var(--line2)"><dl class="kv">${Object.values(PAPEIS).map(([t, d]) => `<dt>${t}</dt><dd class="soft">${d}</dd>`).join('')}</dl></div></div>
    <div class="card"><div class="card-h"><h2 class="grow">Atividade recente</h2><select class="in" id="fu" style="width:auto"><option value="">Todos</option></select></div><div id="at"><div class="empty">Carregando…</div></div></div>
  </div></div>`;
  let lista = [];
  try {
    const r = await db.backend.usuarios();
    lista = r.usuarios || [];
    $('#us', view).innerHTML = `<table class="t"><tbody>${lista.map((u) => `<tr><td><b>${esc(u.nome || u.email)}</b><small style="display:block" class="soft">${esc(u.email)} · último acesso ${quando(u.ultimo_acesso)}</small></td>
      <td class="r"><select class="in" data-u="${esc(u.id)}" style="width:auto"${u.id === r.eu ? ' disabled title="Você não pode mudar o seu próprio papel"' : ''}><option value="">Padrão (${esc(PAPEIS[r.papel_padrao]?.[0] || r.papel_padrao)})</option>${Object.entries(PAPEIS).map(([k, [t]]) => `<option value="${k}"${u.papel === k ? ' selected' : ''}>${t}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
    $$('[data-u]', view).forEach((s) => s.onchange = async () => {
      try { await db.backend.usuariosGravar(s.dataset.u, s.value); toast('Papel atualizado.'); carregarAtividade(); } catch (e) { toast(e.message, true); }
    });
    $('#fu', view).innerHTML += lista.map((u) => `<option>${esc(u.nome || u.email)}</option>`).join('');
  } catch (e) { $('#us', view).innerHTML = `<div class="empty">${esc(e.message)}</div>`; }

  async function carregarAtividade() {
    try {
      const itens = await db.backend.atividade({ usuario: $('#fu', view).value, limite: 300 });
      const f = $('#fu', view).value;
      const vis = itens.filter((a) => !f || a.usuario === f);
      $('#at', view).innerHTML = vis.length ? `<div class="table-wrap"><table class="t"><tbody>${vis.map((a) => `<tr><td class="soft" style="white-space:nowrap">${quando(a.em)}</td><td><b>${esc(a.usuario || '')}</b></td><td class="wrap">${esc(a.resumo || a.op)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma atividade registrada ainda.</div>';
    } catch (e) { $('#at', view).innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  $('#fu', view).onchange = carregarAtividade;
  carregarAtividade();
}
