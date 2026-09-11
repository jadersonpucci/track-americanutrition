# track.americanutrition.com

Página de rastreio da America Nutrition (arquivo único: `index.html`).

- Consulta o webhook `n8n /webhook/rastreio/buscar` (workflow "America Nutrition - Rastreio Personalizado v3").
- Mostra a **foto real do frasco** do produto: o n8n devolve `produto_id` / `variante_id` de cada item do pedido e a página casa com o catálogo público da loja (`americanutrition.com/products.json`). Sem match (ou foto quebrada) ela volta pro frasco desenhado em CSS.
- `vercel.json` reescreve `/{codigo}` para `index.html`; a página lê o código da URL e busca sozinha.
