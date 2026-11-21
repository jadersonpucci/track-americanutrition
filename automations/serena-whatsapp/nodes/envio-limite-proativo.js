// Node "Limite proativo" do "[Serena WhatsApp] Envio Samuel (texto ou audio)" (n8n EhmndFruX6hOIRDN), entre
// "Webhook Enviar" e "Preparar". 21/11/2026: antes de cada envio pede vaga no limite global de mensagens proativas
// (POST /webhook/wpp-vaga -> wpp_aguardar_vaga, limite-proativo.sql). Conversa ativa, equipe e LID passam na hora;
// proativo espera ate 30s por vaga (6 por minuto, somando todos os robos). Se o limite falhar, segue (nunca trava envio).
// Devolve os itens do webhook sem mudar nada: o Preparar continua lendo o mesmo $input.
const b = $input.first().json.body || $input.first().json || {};
const number = String(b.number || b.telefone || '');
try {
  await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/wpp-vaga', json: true, timeout: 40000, body: { number } });
} catch (e) { /* sem limite: envia */ }
return $input.all();
