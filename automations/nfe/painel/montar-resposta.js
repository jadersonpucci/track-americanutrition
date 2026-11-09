// Painel de NF-e, no 'Montar resposta': junta o pedido (Agir), a situacao da nota (Reler NF-e) e o que aconteceu.
const A = $('Agir').first().json;
if (!A.ok) return [{ json: { ok: false, erro: A.erro } }];
const row = $('Reler NF-e').first().json || {};
const out = { ok: true, pedido: A.pedido, acao: A.acao, shopify: A.shopify, avisos: (A.avisos || []).slice(),
  nfe: { status: row.status || 'sem registro', mensagem: row.mensagem || '',
    numero: A.mf.numero || (row.numero ? row.numero + ' / serie ' + row.serie : ''), chave: A.mf.chave || row.chave || '',
    danfe: A.mf.danfe || row.danfe_url || '', xml: row.xml_url || '' } };
try { const v = $('Avaliar reenvio').first().json; if (v) out.reenvio = { aceito: v.aceito, http: v.http }; } catch (e) {}
try { const rb = $('Robô').first().json; if (rb && rb.ok === false) out.avisos.push('Robô: ' + (rb.erro || 'falhou')); } catch (e) {}
return [{ json: out }];
