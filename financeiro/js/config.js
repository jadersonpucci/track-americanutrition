// Configuração de produção. O app fala com o n8n (webhook financeiro-api), que consulta o
// Postgres do Supabase self-hosted com a função fin_api. Nenhuma chave fica no navegador.
export const CONFIG = {
  gateway: 'https://n8n.americanutrition.com/webhook/financeiro-api',
  nomeServidor: 'Servidor America Nutrition',
};
