// Monta o contexto de renderização a partir dos dados da loja. Usado pelo build (Node) e pela prévia do painel (navegador).

export function criarContexto(d, { versao = Date.now().toString(36), lerHtml = (x) => x || '' } = {}) {
  const ativos = (d.produtos || []).filter((p) => p.status !== 'arquivado');
  for (const p of ativos) if (p.landing_html == null) p.landing_html = lerHtml(p.landing);
  for (const g of d.paginas || []) if (g.landing_html == null) g.landing_html = lerHtml(g.landing);
  for (const c of d.colecoes || []) if (c.landing_html == null) c.landing_html = lerHtml(c.landing);
  for (const s of Object.values(d.home?.secoes || {})) if (s.tipo === 'html' && s.html && !s.html.includes('<')) s.html = lerHtml(s.html);

  const visiveis = ativos.filter((p) => p.status === 'ativo');
  const porHandle = new Map(ativos.map((p) => [p.handle, p]));

  // coleções manuais (lista de handles) ou automáticas (regras por tag, tipo, fornecedor, título)
  function produtosDaColecao(col) {
    if (!col) return [];
    if (col.handle === 'all') return visiveis;
    if (col.regras?.length) {
      const ok = (p, r) => {
        const v = r.campo === 'tag' ? p.tags || [] : r.campo === 'tipo' ? [p.tipo] : r.campo === 'fornecedor' ? [p.fornecedor] : r.campo === 'titulo' ? [p.titulo] : [];
        const alvo = String(r.valor || '').toLowerCase();
        return v.some((x) => { const s = String(x || '').toLowerCase(); return r.op === 'contem' ? s.includes(alvo) : s === alvo; });
      };
      return visiveis.filter((p) => (col.disjuntivo ? col.regras.some((r) => ok(p, r)) : col.regras.every((r) => ok(p, r))));
    }
    return (col.produtos || []).map((h) => porHandle.get(h)).filter((p) => p && p.status === 'ativo');
  }

  const colecoes = [...(d.colecoes || [])].filter((c) => c.status !== 'rascunho');
  if (!colecoes.some((c) => c.handle === 'all')) colecoes.push({ id: 'all', handle: 'all', titulo: 'Produtos', produtos: [], virtual: true });

  return {
    config: d.config, versao, todos: ativos, produtos: visiveis, colecoes, paginas: (d.paginas || []), blogs: d.blogs || [],
    artigos: (d.artigos || []).filter((a) => a.status !== 'rascunho').sort((a, b) => String(b.publicado_em || '').localeCompare(String(a.publicado_em || ''))),
    produto: (h) => porHandle.get(String(h || '').replace(/^shopify:\/\/products\//, '')),
    produtosDaColecao, url: '/',
  };
}
