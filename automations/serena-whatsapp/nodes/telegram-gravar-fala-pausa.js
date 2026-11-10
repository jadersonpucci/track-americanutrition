// Node "Gravar fala durante pausa" (Postgres, credencial "Postgres account") do workflow "Serena | Telegram"
// (GwreSR7VN3bfSqaO), ligado na saida do "Tratar Mensagem". Criado em 10/11/2026.
// O Core devolve {pausada:true} quando a conversa esta pausada (handoff) e nao grava nada; o "Tratar Mensagem"
// so retornava {acao:'pausada'}. Resultado: tudo o que o cliente escrevia durante a pausa sumia - nao aparecia no
// Inbox, no alerta da fila humana parada nem para quem fosse assumir. Caso real: Jose B. (tg-1509991482), 9
// mensagens perdidas de 07/11 22:29 a 09/11 13:44 depois de pedir para revender.
// Query (expressao do n8n), so grava quando a saida do Tratar Mensagem e acao = 'pausada':
// ={{ (() => {
//   const b = $('Telegram IN').first().json.body || {};
//   const m = b.business_message || b.message || b.edited_business_message || {};
//   let t = String(m.text || m.caption || '').trim();
//   if (!t) t = (m.voice || m.audio) ? '[O cliente mandou um áudio]' : (m.photo ? '[O cliente mandou uma foto, sem escrever nada junto]' : '[O cliente mandou uma mensagem sem texto]');
//   const q = s => "'" + String(s).replace(/'/g, "''") + "'";
//   return "insert into serena_mensagens (contato_id, papel, texto, canal, entregue, criado_em) select c.id, 'cliente', " + q(t.slice(0, 4000)) +
//     ", 'telegram', true, now() from serena_contatos c where c.session_site = " + q('tg-' + $json.chat_id) + " and " + q($json.acao || '') + " = 'pausada' returning id";
// })() }}
