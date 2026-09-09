// Node "Chat do Site" do workflow "Serena | Chat do Site" (n8n gVun1aWoIRm4VrXk).
// Chaves reais so no n8n.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const BASE = 'https://n8n.americanutrition.com/webhook/serena-chat';
const PUSH = 'https://n8n.americanutrition.com/webhook/serena-push';
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=an-serena-9Kx4Lm2Q';
const TG = 'http://telegram-bot-api:8081/bot<TOKEN>/sendMessage';
const TG_CHAT = '6531084136';
const LIMITE_HORA = 40;
const self = this;
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 });
  if (r && r.error) throw new Error(String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const q = ($json.query || $json.body || $json) || {};
const acao = String(q.acao || '').toLowerCase();
const sessao = String(q.sessao || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
const json = (o) => [{ json: { tipo: 'application/json; charset=utf-8', corpo: JSON.stringify(o) } }];

if (acao === 'enviar') {
  const texto = String(q.texto || '').trim().slice(0, 1200);
  if (!sessao || !texto) return json({ erro: 'faltou sessao ou texto' });
  const chave = 'chat-' + sessao;
  let contatoId = null; let novo = false;
  const achado = await sql('select id from serena_contatos where session_site = ' + E(chave) + ' limit 1');
  if (achado.length && achado[0].id) { contatoId = achado[0].id; }
  else {
    const ins = await sql('insert into serena_contatos (session_site, nome) values (' + E(chave) + ', ' + E(String(q.nome || '').slice(0, 60) || null) + ') returning id');
    contatoId = (ins.length && ins[0].id) ? ins[0].id : null;
    novo = true;
  }
  if (!contatoId) return json({ erro: 'nao consegui abrir a conversa' });
  // trava simples de abuso: o endpoint e publico e cada mensagem custa uma chamada ao modelo
  const cnt = await sql("select count(*)::int as n from serena_mensagens where contato_id = " + E(contatoId) + "::uuid and papel = 'cliente' and criado_em > now() - interval '1 hour'");
  if (cnt.length && Number(cnt[0].n) >= LIMITE_HORA) {
    return json({ resposta: 'Voce mandou muitas mensagens seguidas. Espere alguns minutos e continue, ou escreva para contato@americanutrition.com.', limite: true });
  }
  const corpo = { canal: 'site', contato_id: contatoId, session_site: chave, texto: texto };
  if (q.nome) corpo.nome = String(q.nome).slice(0, 60);
  if (q.email) corpo.email = String(q.email).slice(0, 120);
  const r = await req({ method: 'POST', url: CORE, json: true, timeout: 180000, body: corpo });
  // conversa nova neste canal: avisa a equipe, porque hoje ele e a porta de entrada principal
  if (novo) {
    const preview = texto.replace(/[<>&]/g, ' ').slice(0, 180);
    await req({ method: 'POST', url: TG, headers: { 'Content-Type': 'application/json' }, json: true, timeout: 10000,
      body: { chat_id: TG_CHAT, parse_mode: 'HTML', disable_web_page_preview: true,
        text: '\u{1F4AC} <b>Nova conversa no chat do site</b>' + String.fromCharCode(10) + '<i>' + preview + '</i>' + String.fromCharCode(10) + String.fromCharCode(10) + '<a href="' + INBOX + '">Abrir no Inbox</a>' } });
    await req({ method: 'POST', url: PUSH, json: true, timeout: 15000, body: { titulo: '\u{1F4AC} Chat do site', corpo: preview.slice(0, 140), url: INBOX, tag: 'chat-site' } });
  }
  if (!r) return json({ erro: 'nao consegui responder agora', contato_id: contatoId });
  if (r.pausada === true) {
    return json({ resposta: '', pausada: true, contato_id: contatoId, aviso: 'Um atendente esta acompanhando esta conversa e responde por aqui.' });
  }
  const ult = await sql('select coalesce(max(id), 0)::text as id from serena_mensagens where contato_id = ' + E(contatoId) + '::uuid');
  return json({ resposta: String(r.resposta || ''), handoff: !!r.handoff, contato_id: contatoId, ultimo_id: (ult.length ? ult[0].id : '0') });
}

if (acao === 'novas') {
  if (!sessao) return json({ msgs: [] });
  const desde = String(q.desde || '0').replace(/[^0-9]/g, '') || '0';
  const linhas = await sql("select m.id::text as id, m.papel, m.texto, m.criado_em from serena_mensagens m join serena_contatos c on c.id = m.contato_id where c.session_site = " + E('chat-' + sessao) + " and m.id > " + desde + " and m.papel in ('serena','humano') and nullif(m.texto,'') is not null order by m.id limit 30");
  return json({ msgs: linhas.map((l) => ({ id: l.id, papel: l.papel, texto: String(l.texto).replace(/\[\[(ARQUIVO|LISTA):[^\]]*\]\]/gi, '').trim() })) });
}

// ---------- front ----------
// ATENCAO: o JS abaixo e montado por concatenacao e sai numa linha so.
// Nunca use comentario // dentro dele: comentaria o arquivo inteiro. Use /* */.
const CSS = ':root{--an-azul:#1f4fd8;--an-esc:#0e1726}'
  + '#anchat-b{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:60px;height:60px;border-radius:50%;background:var(--an-azul);border:0;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center}'
  + '#anchat-b svg{width:28px;height:28px;fill:#fff}'
  + '#anchat-b .pt{position:absolute;top:-4px;right:-4px;background:#e23b3b;color:#fff;font:700 11px system-ui;border-radius:10px;padding:1px 6px;display:none}'
  + '#anchat-p{position:fixed;right:18px;bottom:88px;z-index:2147483000;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
  + '#anchat-p.on{display:flex}'
  + '#anchat-h{background:var(--an-esc);color:#fff;padding:13px 15px;display:flex;align-items:center;gap:10px;flex:0 0 auto}'
  + '#anchat-h b{font-size:15px;display:block}#anchat-h span{font-size:12px;opacity:.72}'
  + '#anchat-h .x{margin-left:auto;background:0;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;opacity:.75;padding:0 2px}'
  + '#anchat-m{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px;background:#f5f6f8}'
  + '.anm{margin:8px 0;display:flex}.anm.eu{justify-content:flex-end}'
  + '.anb{max-width:82%;padding:9px 13px;border-radius:15px;white-space:pre-wrap;word-wrap:break-word;font-size:14.5px}'
  + '.eu .anb{background:var(--an-azul);color:#fff;border-bottom-right-radius:4px}'
  + '.ela .anb{background:#fff;color:#16202e;border:1px solid #e3e6ec;border-bottom-left-radius:4px}'
  + '.anb a{color:inherit;text-decoration:underline;word-break:break-all}'
  + '.ela .anb a{color:var(--an-azul)}'
  + '.anh{text-align:center;font-size:11.5px;color:#8a93a3;margin:6px 0}'
  + '#anchat-f{flex:0 0 auto;border-top:1px solid #e3e6ec;padding:9px;display:flex;gap:8px;background:#fff;padding-bottom:calc(9px + env(safe-area-inset-bottom))}'
  + '#anchat-t{flex:1;border:1px solid #d8dce4;border-radius:20px;padding:9px 14px;font:16px/1.35 inherit;resize:none;max-height:96px;outline:0}'
  + '#anchat-t:focus{border-color:var(--an-azul)}'
  + '#anchat-s{background:var(--an-azul);border:0;border-radius:50%;width:38px;height:38px;cursor:pointer;flex:0 0 38px;display:flex;align-items:center;justify-content:center}'
  + '#anchat-s svg{width:17px;height:17px;fill:#fff}'
  + '#anchat-s:disabled{opacity:.45}'
  + '.antp{color:#8a93a3;font-size:13px;padding:2px 6px}'
  + '@media(max-width:520px){#anchat-p{top:0;left:0;right:0;bottom:auto;width:100vw;max-width:100vw;height:100dvh;max-height:none;border-radius:0}#anchat-b{right:14px;bottom:14px}}';

const JS = '(function(){if(window.__anchat)return;window.__anchat=1;'
  + 'var BASE=' + JSON.stringify(BASE) + ';'
  + 'var css=' + JSON.stringify(CSS) + ';'
  + '/* webview restrita ou cookies bloqueados fazem o localStorage lancar: sem isso o chat inteiro morre */'
  + 'function lsGet(k,d){try{var v=localStorage.getItem(k);return(v===null||v===undefined)?d:v;}catch(e){return d;}}'
  + 'function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}'
  + 'var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);'
  + 'var s=lsGet("an_chat_s","");if(!s){s=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);lsSet("an_chat_s",s);}'
  + 'var ultimo=lsGet("an_chat_u","0")||"0";'
  + 'var b=document.createElement("button");b.id="anchat-b";b.setAttribute("aria-label","Falar com a gente");'
  + 'b.innerHTML=\'<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg><i class="pt"></i>\';'
  + 'var p=document.createElement("div");p.id="anchat-p";'
  + 'p.innerHTML=\'<div id="anchat-h"><div><b>America Nutrition</b><span>Atendimento \\u00b7 respondemos por aqui</span></div><button class="x" aria-label="Fechar">\\u00d7</button></div><div id="anchat-m"></div><div id="anchat-f"><textarea id="anchat-t" rows="1" placeholder="Escreva sua mensagem..."></textarea><button id="anchat-s" aria-label="Enviar"><svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button></div>\';'
  + 'document.body.appendChild(b);document.body.appendChild(p);'
  + 'var mm=p.querySelector("#anchat-m"),tx=p.querySelector("#anchat-t"),bs=p.querySelector("#anchat-s"),pt=b.querySelector(".pt");'
  + 'var naoLidas=0,aberto=false;'
  + 'var vv=window.visualViewport,scrollSalvo=0,travado=false;'
  + 'function movel(){return window.innerWidth<=520;}'
  + '/* iOS: com o teclado aberto o dvh nao encolhe e o painel fixo se solta da tela */'
  + 'function ajusta(){if(!aberto||!movel())return;var h=vv?vv.height:window.innerHeight,t=vv?vv.offsetTop:0;'
  + 'p.style.setProperty("top",t+"px","important");p.style.setProperty("height",h+"px","important");'
  + 'p.style.setProperty("bottom","auto","important");p.style.setProperty("max-height","none","important");'
  + 'p.style.setProperty("left","0","important");p.style.setProperty("right","0","important");}'
  + 'function limpa(){["top","height","bottom","max-height","left","right"].forEach(function(k){p.style.removeProperty(k);});}'
  + '/* trava a pagina atras: sem isso o iOS rola o site junto e o chat se solta no meio */'
  + 'function travar(){if(!movel()||travado)return;travado=true;scrollSalvo=window.scrollY||document.documentElement.scrollTop||0;'
  + 'var bd=document.body.style;bd.position="fixed";bd.top=(-scrollSalvo)+"px";bd.left="0";bd.right="0";bd.width="100%";bd.overflow="hidden";}'
  + 'function destravar(){if(!travado)return;travado=false;var bd=document.body.style;'
  + 'bd.position="";bd.top="";bd.left="";bd.right="";bd.width="";bd.overflow="";window.scrollTo(0,scrollSalvo);}'
  + 'if(vv){vv.addEventListener("resize",ajusta);vv.addEventListener("scroll",ajusta);}'
  + 'window.addEventListener("orientationchange",function(){setTimeout(ajusta,320);});'
  + 'function esc(t){var d=document.createElement("div");d.textContent=t;return d.innerHTML;}'
  + 'function linkar(t){return esc(t).replace(/(https?:\\/\\/[^\\s<]+)/g,function(u){return \'<a href="\'+u+\'" target="_blank" rel="noopener">\'+u+"</a>";});}'
  + 'function fim(){mm.scrollTop=mm.scrollHeight;}'
  + 'function bolha(quem,texto){var d=document.createElement("div");d.className="anm "+quem;var x=document.createElement("div");x.className="anb";x.innerHTML=linkar(texto);d.appendChild(x);mm.appendChild(d);fim();return d;}'
  + 'function salvar(){try{lsSet("an_chat_h",JSON.stringify([].slice.call(mm.children).map(function(e){return{q:e.className.indexOf("eu")>0?"eu":"ela",t:e.textContent};}).slice(-40)));}catch(e){}}'
  + 'try{var h=JSON.parse(lsGet("an_chat_h","[]"));h.forEach(function(m){bolha(m.q,m.t);});}catch(e){}'
  + 'if(!mm.children.length){bolha("ela","Oi! Sou a Serena, do atendimento da America Nutrition \\ud83d\\udc99 Como posso ajudar voc\\u00ea?");}'
  + 'function abrir(){p.classList.add("on");aberto=true;naoLidas=0;pt.style.display="none";travar();ajusta();setTimeout(function(){ajusta();fim();},60);poll();}'
  + 'function fechar(){p.classList.remove("on");aberto=false;try{tx.blur();}catch(e){}limpa();destravar();}'
  + 'b.onclick=function(){aberto?fechar():abrir();};p.querySelector(".x").onclick=fechar;'
  + 'tx.addEventListener("focus",function(){setTimeout(function(){ajusta();fim();},120);setTimeout(function(){ajusta();fim();},420);});'
  + 'tx.addEventListener("blur",function(){setTimeout(ajusta,120);});'
  + 'function pensando(){var d=document.createElement("div");d.className="antp";d.textContent="digitando...";mm.appendChild(d);fim();return d;}'
  + 'async function enviar(){var v=tx.value.trim();if(!v)return;tx.value="";tx.style.height="auto";bolha("eu",v);salvar();bs.disabled=true;var t=pensando();'
  + 'try{var r=await fetch(BASE+"?acao=enviar&sessao="+s+"&texto="+encodeURIComponent(v));var j=await r.json();t.remove();'
  + 'if(j.ultimo_id){ultimo=j.ultimo_id;lsSet("an_chat_u",ultimo);}'
  + 'if(j.resposta){bolha("ela",j.resposta);}else if(j.aviso){var a=document.createElement("div");a.className="anh";a.textContent=j.aviso;mm.appendChild(a);fim();}'
  + 'else if(j.erro){bolha("ela","Tive um problema aqui agora. Tente de novo em instantes, ou escreva para contato@americanutrition.com.");}'
  + 'salvar();}catch(e){t.remove();bolha("ela","Nao consegui enviar. Confira sua conexao e tente de novo.");}'
  + 'bs.disabled=false;}'
  + 'bs.addEventListener("click",function(e){e.preventDefault();enviar();});'
  + 'tx.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}});'
  + 'tx.addEventListener("input",function(){tx.style.height="auto";tx.style.height=Math.min(tx.scrollHeight,96)+"px";});'
  + 'async function poll(){try{var r=await fetch(BASE+"?acao=novas&sessao="+s+"&desde="+ultimo);var j=await r.json();'
  + 'if(j.msgs&&j.msgs.length){j.msgs.forEach(function(m){if(m.texto){bolha("ela",m.texto);if(!aberto){naoLidas++;pt.textContent=naoLidas;pt.style.display="block";}}ultimo=m.id;});lsSet("an_chat_u",ultimo);salvar();}'
  + '}catch(e){}}'
  + 'setInterval(function(){if(aberto)poll();},5000);'
  + 'setInterval(function(){if(!aberto)poll();},30000);'
  + '})();';

if (acao === 'widget') {
  return [{ json: { tipo: 'application/javascript; charset=utf-8', corpo: JS } }];
}

// pagina avulsa: mesmo widget, ja aberto, para mandar o link direto ao cliente
let html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">';
html += '<title>Atendimento America Nutrition</title>';
html += '<style>body{margin:0;background:#0e1726;color:#e7e9ee;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}';
html += '.c{max-width:620px;margin:0 auto;padding:56px 20px 140px;text-align:center}h1{font-size:24px;margin:0 0 10px}p{color:#9aa3b5;margin:0 auto 8px;max-width:460px}</style></head><body>';
html += '<div class="c"><h1>Fale com a America Nutrition</h1>';
html += '<p>Nosso WhatsApp esta temporariamente indisponivel. Voce pode falar com a gente por aqui mesmo, sem instalar nada.</p>';
html += '<p>Clique no balao azul no canto da tela para comecar.</p></div>';
html += '<script src="' + BASE + '?acao=widget"><' + '/script>';
html += '<script>setTimeout(function(){var b=document.getElementById("anchat-b");if(b)b.click();},600);<' + '/script>';
html += '</body></html>';
return [{ json: { tipo: 'text/html; charset=utf-8', corpo: html } }];
