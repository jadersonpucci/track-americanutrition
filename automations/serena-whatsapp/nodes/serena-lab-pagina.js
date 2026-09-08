// Node "Pagina ou Conversar" do workflow "Serena | Sandbox de Testes" (n8n 0rrRVxUQWrb31Ob6).
// Chaves reais so no n8n.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const BASE = 'https://n8n.americanutrition.com/webhook/serena-lab';
const TOKEN = 'an-lab-6Hj2Pk8T';
const self = this;
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 });
  if (r && r.error) throw new Error(String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
const q = ($json.query || $json.body || $json) || {};
const json = (o) => [{ json: { tipo: 'application/json; charset=utf-8', corpo: JSON.stringify(o) } }];
if (String(q.t || '') !== TOKEN) { return [{ json: { tipo: 'text/plain; charset=utf-8', corpo: 'nao autorizado' } }]; }
const acao = String(q.acao || '').toLowerCase();
const sessao = String(q.sessao || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

// contato de teste, um por aba. Nunca e o contato real do cliente: o historico do sandbox fica so aqui.
async function contatoDaSessao(s) {
  const chave = 'lab-' + s;
  const achado = await sql('select id from serena_contatos where session_site = ' + E(chave) + ' limit 1');
  if (achado.length && achado[0].id) return achado[0].id;
  const novo = await sql('insert into serena_contatos (session_site, nome) values (' + E(chave) + ", 'Sandbox') returning id");
  return (novo.length && novo[0].id) ? novo[0].id : null;
}

if (acao === 'enviar') {
  const texto = String(q.texto || '').trim();
  if (!sessao || !texto) return json({ erro: 'faltou sessao ou texto' });
  const tel = String(q.telefone || '').replace(/[^0-9]/g, '');
  const contatoId = await contatoDaSessao(sessao);
  if (!contatoId) return json({ erro: 'nao consegui criar o contato de teste' });
  const corpo = { canal: 'whatsapp', contato_id: contatoId, texto: texto, nome: 'Sandbox' };
  // telefone opcional: o contato continua sendo o de teste (contato_id manda no carregar contexto), mas a
  // Serena consulta os pedidos desse numero na Shopify - e assim que se testa o fluxo de cliente conhecido
  if (tel.length >= 10) corpo.telefone = tel;
  const t0 = Date.now();
  let r = null; let erro = '';
  try { r = await self.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 180000, body: corpo }); }
  catch (e) { erro = String(e.message || e).slice(0, 300); }
  if (!r) return json({ erro: erro || 'Core sem resposta' });
  if (r.pausada === true) return json({ erro: 'a Serena esta pausada neste contato de teste' });
  return json({
    resposta: String(r.resposta || ''),
    ferramentas: Array.isArray(r.ferramentas) ? r.ferramentas : [],
    handoff: !!r.handoff,
    lista: r.lista || null,
    arquivo: r.arquivo || null,
    segundos: Math.round((Date.now() - t0) / 100) / 10
  });
}

if (acao === 'limpar') {
  if (!sessao) return json({ erro: 'faltou sessao' });
  const c = await sql('select id from serena_contatos where session_site = ' + E('lab-' + sessao) + ' limit 1');
  if (c.length && c[0].id) {
    const id = E(c[0].id);
    await sql('delete from serena_mensagens where contato_id = ' + id + '::uuid');
    await sql('delete from serena_conversas where contato_id = ' + id + '::uuid');
    await sql('delete from serena_fatos where contato_id = ' + id + '::uuid');
    await sql('delete from serena_contatos where id = ' + id + '::uuid');
  }
  return json({ ok: true });
}

// pagina
const css = 'body{margin:0;background:#0f1115;color:#e7e9ee;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
  + '.wrap{max-width:760px;margin:0 auto;padding:16px 14px 120px}'
  + 'h1{font-size:19px;margin:6px 0 2px}.sub{color:#8b93a7;font-size:13px;margin:0 0 14px}'
  + '.barra{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#171a21;border:1px solid #262b36;border-radius:12px;padding:10px;margin-bottom:14px}'
  + '.barra input{flex:1;min-width:160px;background:#0f1115;border:1px solid #2c3240;color:#e7e9ee;border-radius:8px;padding:8px 10px;font-size:14px}'
  + '.barra label{font-size:12px;color:#8b93a7}'
  + 'button{background:#2f6df6;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer}'
  + 'button.sec{background:#262b36;color:#c8cede;font-weight:500}'
  + '.msg{margin:10px 0;display:flex}.msg.eu{justify-content:flex-end}'
  + '.bolha{max-width:78%;padding:10px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}'
  + '.eu .bolha{background:#2f6df6;color:#fff;border-bottom-right-radius:4px}'
  + '.ela .bolha{background:#1c2029;border:1px solid #262b36;border-bottom-left-radius:4px}'
  + '.tags{font-size:11px;color:#8b93a7;margin:4px 2px 0}'
  + '.tag{display:inline-block;background:#20252f;border:1px solid #2c3240;border-radius:20px;padding:2px 9px;margin:2px 4px 0 0}'
  + '.tag.alerta{background:#3a2418;border-color:#6b3b1e;color:#ffbe8a}'
  + '.envio{position:fixed;left:0;right:0;bottom:0;background:#0f1115;border-top:1px solid #222733;padding:12px}'
  + '.envio .in{max-width:760px;margin:0 auto;display:flex;gap:8px}'
  + '.envio textarea{flex:1;background:#171a21;border:1px solid #2c3240;color:#e7e9ee;border-radius:10px;padding:10px 12px;font:15px/1.4 inherit;resize:none;height:44px}'
  + '.aviso{background:#211a12;border:1px solid #4a3520;color:#e6c79a;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px}'
  + '.pensando{color:#8b93a7;font-size:13px;margin:8px 2px}';

let html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
html += '<title>Sandbox da Serena</title><style>' + css + '</style></head><body><div class="wrap">';
html += '<h1>Sandbox da Serena</h1><p class="sub">Conversa de teste. Nada e enviado por WhatsApp e o historico fica num contato separado.</p>';
html += '<div class="aviso">As ferramentas rodam de verdade. Se a conversa chegar em PIX ou boleto, um rascunho e criado na Shopify; se ela escalar, a equipe recebe o card. O que foi chamado aparece embaixo de cada resposta.</div>';
html += '<div class="barra"><label for="tel">Telefone do cliente (opcional)</label><input id="tel" placeholder="5513981885555 - para testar cliente conhecido" inputmode="numeric">';
html += '<button class="sec" id="limpar">Limpar conversa</button></div>';
html += '<div id="chat"></div>';
html += '</div><div class="envio"><div class="in"><textarea id="txt" placeholder="Escreva como se fosse o cliente..."></textarea><button id="enviar">Enviar</button></div></div>';

const js = 'var BASE=' + JSON.stringify(BASE) + ',T=' + JSON.stringify(TOKEN) + ';'
  + 'var s=localStorage.getItem("serena_lab_sessao");if(!s){s=Math.random().toString(36).slice(2,10);localStorage.setItem("serena_lab_sessao",s);}'
  + 'var tel=document.getElementById("tel");tel.value=localStorage.getItem("serena_lab_tel")||"";'
  + 'tel.addEventListener("change",function(){localStorage.setItem("serena_lab_tel",tel.value);});'
  + 'var chat=document.getElementById("chat"),txt=document.getElementById("txt");'
  + 'function bolha(quem,texto,tags){var d=document.createElement("div");d.className="msg "+quem;var b=document.createElement("div");b.className="bolha";b.textContent=texto;d.appendChild(b);chat.appendChild(d);'
  + 'if(tags&&tags.length){var t=document.createElement("div");t.className="tags";t.innerHTML=tags.join("");chat.appendChild(t);}'
  + 'window.scrollTo(0,document.body.scrollHeight);return d;}'
  + 'function chip(txt,alerta){return "<span class=\\"tag"+(alerta?" alerta":"")+"\\">"+txt+"</span>";}'
  + 'async function enviar(){var v=txt.value.trim();if(!v)return;txt.value="";bolha("eu",v);'
  + 'var p=document.createElement("div");p.className="pensando";p.textContent="Serena esta pensando...";chat.appendChild(p);window.scrollTo(0,document.body.scrollHeight);'
  + 'try{var u=BASE+"?t="+T+"&acao=enviar&sessao="+s+"&texto="+encodeURIComponent(v)+"&telefone="+encodeURIComponent(tel.value||"");'
  + 'var r=await fetch(u);var j=await r.json();p.remove();'
  + 'if(j.erro){bolha("ela","[erro] "+j.erro);return;}'
  + 'var tags=[];if(j.ferramentas&&j.ferramentas.length){for(var i=0;i<j.ferramentas.length;i++){var f=j.ferramentas[i];var nome=(typeof f==="string")?f:(f.acao||JSON.stringify(f));tags.push(chip(nome,/pix|boleto|escalar|troca/i.test(nome)));}}'
  + 'if(j.handoff)tags.push(chip("handoff para humano",true));'
  + 'if(j.lista)tags.push(chip("lista clicavel"));'
  + 'if(j.arquivo)tags.push(chip("arquivo: "+(j.arquivo.chave||j.arquivo)));'
  + 'tags.push(chip(j.segundos+"s"));'
  + 'bolha("ela",j.resposta||"(sem resposta)",tags);'
  + '}catch(e){p.remove();bolha("ela","[falhou] "+e.message);}}'
  + 'document.getElementById("enviar").onclick=enviar;'
  + 'txt.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}});'
  + 'document.getElementById("limpar").onclick=async function(){if(!confirm("Apagar esta conversa de teste?"))return;await fetch(BASE+"?t="+T+"&acao=limpar&sessao="+s);chat.innerHTML="";};';

html += '<script>' + js + '<' + '/script></body></html>';
return [{ json: { tipo: 'text/html; charset=utf-8', corpo: html } }];
