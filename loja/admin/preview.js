// Prévia ao vivo: usa o MESMO código de tema do build (copiado para admin/theme) e renderiza no navegador.
import { db } from './db.js';

let mods = null;
async function tema() {
  if (!mods) {
    const [contexto, sections, layout, pages] = await Promise.all([import('./theme/contexto.mjs'), import('./theme/sections.mjs'), import('./theme/layout.mjs'), import('./theme/pages.mjs')]);
    mods = { contexto, sections, layout, pages };
  }
  return mods;
}

function ctxCom(sobrescrever = {}) {
  const d = structuredClone({ ...db.exportar(), ...sobrescrever });
  return d;
}

export async function htmlHome(home) {
  const m = await tema();
  const d = ctxCom(home ? { home } : {});
  const ctx = m.contexto.criarContexto(d, { versao: 'previa' });
  const h = d.home || { ordem: [], secoes: {} };
  return m.layout.layout(ctx, { title: d.config.titulo_home, canonical: '/', pageType: 'index', body: h.ordem.map((id) => h.secoes[id] && m.sections.renderSecao(id, h.secoes[id], ctx)).filter(Boolean).join('\n') });
}

export async function htmlProduto(p) {
  const m = await tema();
  const d = ctxCom({ produtos: [...db.all('produtos').filter((x) => x.id !== p.id), { ...p, status: 'ativo' }] });
  const ctx = m.contexto.criarContexto(d, { versao: 'previa' });
  return m.pages.paginaProduto(ctx, ctx.produto(p.handle));
}

export async function htmlColecao(c) {
  const m = await tema();
  const d = ctxCom({ colecoes: [...db.all('colecoes').filter((x) => x.id !== c.id), c] });
  const ctx = m.contexto.criarContexto(d, { versao: 'previa' });
  return m.pages.paginaColecao(ctx, ctx.colecoes.find((x) => x.handle === c.handle));
}

export async function htmlPagina(g) {
  const m = await tema();
  const ctx = m.contexto.criarContexto(ctxCom(), { versao: 'previa' });
  return m.pages.paginaConteudo(ctx, g);
}

export async function htmlArtigo(a) {
  const m = await tema();
  const ctx = m.contexto.criarContexto(ctxCom(), { versao: 'previa' });
  return m.pages.paginaArtigo(ctx, a);
}

export async function tiposSecao() { return (await tema()).sections.TIPOS; }

// abre a prévia num iframe (srcdoc), com alternância desktop/celular
export function montarFrame(container) {
  container.innerHTML = `<div class="frame-bar"><span class="soft sm" style="flex:1"><i class="ti ti-eye"></i> Prévia (antes de publicar)</span>
  <div class="seg"><button class="on" data-w="desk"><i class="ti ti-device-desktop"></i></button><button data-w="mob"><i class="ti ti-device-mobile"></i></button></div></div><iframe title="Prévia"></iframe>`;
  const fr = container.querySelector('iframe');
  container.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => {
    container.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b));
    fr.classList.toggle('mobile', b.dataset.w === 'mob');
  });
  return {
    async render(html, rolar) {
      const y = fr.contentWindow?.scrollY || 0;
      fr.srcdoc = html;
      fr.onload = () => { try { if (rolar) { const el = fr.contentDocument.getElementById(rolar); el?.scrollIntoView({ block: 'start' }); } else fr.contentWindow.scrollTo(0, y); } catch {} };
    },
  };
}
