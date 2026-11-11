// Venda Manual · modo "Pix recebido na chave" (11/11/2026). Injetado na pagina venda-manual (web_assets) depois do boot().
// Abre com ?pix=<token> (link que a Cris recebe no WhatsApp) e, com ?a=<token do agente>, mostra a lista de Pix sem pedido.
// Fala com POST /webhook/venda-manual-pix (workflow "[Financeiro] Venda Manual · Pix na chave (API)").
(function(){
const PIXAPI='https://n8n.americanutrition.com/webhook/venda-manual-pix';
const QS=new URLSearchParams(location.search);
const AG=(QS.get('a')||'').replace(/[^A-Za-z0-9-]/g,'');
let PIX=null,AGNOME='',pixPoll=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quando=h=>{if(!h)return'';const d=new Date(h);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};
const docFmt=s=>{s=String(s||'');if(s.length===11)return'CPF '+s.slice(0,3)+'.'+s.slice(3,6)+'.'+s.slice(6,9)+'-'+s.slice(9);if(s.length===14)return'CNPJ '+s.slice(0,2)+'.'+s.slice(2,5)+'.'+s.slice(5,8)+'/'+s.slice(8,12)+'-'+s.slice(12);return'';};
async function pixApi(body){const r=await fetch(PIXAPI,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({k:K},body))});return r.json();}

// valor fixo = Pix - frete enquanto estiver no modo Pix
const recalcOrig=window.recalc;
window.recalc=function(){
  recalcOrig();
  if(!PIX)return;
  const fr=parseFloat(el('f_frete').value)||0;
  el('f_valor').value=Math.max(0,PIX.valor-fr).toFixed(2);
  el('somaCobrar').textContent=brl(PIX.valor);
  const soma=getItens().reduce((a,i)=>{const p=PRODUTOS.find(x=>String(x.id)===String(i.variant_id));return a+(p?p.price*i.qtd:0);},0);
  const dif=(PIX.valor-fr)-soma;
  el('pixDif').textContent=!soma?'':(Math.abs(dif)<0.01?'✔ Valor do Pix bate com a tabela + frete.':(dif<0?'Desconto de '+brl(-dif)+' sobre a tabela (o Pix cobre menos que a tabela).':'O Pix ficou '+brl(dif)+' acima da tabela + frete.'));
};

function modoPix(on){
  el('pixBanner').style.display=on?'block':'none';
  el('linhaGerar').style.display=on?'none':'';
  el('f_valor').readOnly=!!on;
  el('f_forma').disabled=!!on;
  recalc();
}

async function abrirPix(tk){
  limparAvisos();
  const r=await pixApi({action:'get',token:tk});
  if(!r.ok){aviso('Pix: '+(r.erro||'não encontrado'),'erro');return;}
  const p=r.pix;PIX=p;
  el('pixTit').textContent=brl(p.valor)+' de '+(p.nome||'pagador não identificado');
  el('pixSub').textContent=[docFmt(p.doc),quando(p.horario),p.info?('mensagem: '+p.info):''].filter(Boolean).join(' · ');
  const fechado=['pedido','nao_venda','processando'].indexOf(p.status)>=0;
  el('pixAcoes').style.display=fechado?'none':'';
  el('pixFechado').style.display=fechado?'block':'none';
  el('pixFechado').textContent=p.status==='pedido'?('✅ Este Pix já virou pedido'+(p.pedido?' '+p.pedido:'')+'.'):(p.status==='nao_venda'?'🚫 Marcado como não é venda'+(p.motivo?' ('+p.motivo+')':'')+'.':'⏳ Pedido sendo criado...');
  const s=r.sugestao;
  const set=(id,v)=>{if(v&&!el(id).value)el(id).value=v;};
  if(s){
    const c=s.cliente||{},e=s.endereco||{};
    set('f_nome',c.nome);set('f_cpf',c.cpf);set('f_email',c.email);set('f_fone',c.fone);
    set('f_cep',e.cep);set('f_rua',e.rua);set('f_numero',e.numero);set('f_compl',e.complemento);set('f_bairro',e.bairro);set('f_cidade',e.cidade);set('f_uf',(e.uf||'').toUpperCase());
    if(s.itens&&s.itens.length&&!getItens().length){el('itens').innerHTML='';s.itens.forEach(i=>addItem(i.variant_id,i.qtd));}
    aviso('Dados preenchidos com a última compra deste CPF ('+s.fonte+', '+quando(s.data)+'). Confira produtos e endereço.');
  }else{
    set('f_nome',p.nome);set('f_cpf',p.doc);
    if(p.doc)aviso('CPF sem compra anterior: preencha produtos, contato e endereço.');
  }
  valCpf();modoPix(true);
  el('pixBanner').scrollIntoView({behavior:'smooth',block:'start'});
}

async function criarPedidoPix(){
  if(!PIX)return;
  const d=coletar();
  if(!d.itens.length){toast('Adicione ao menos 1 produto');return;}
  if(!d.cliente.nome){toast('Informe o nome do cliente');return;}
  if(!d.cliente.cpf||!docOk(d.cliente.cpf)){toast('CPF/CNPJ inválido');return;}
  if(!d.endereco.cep||!d.endereco.rua){toast('Endereço incompleto');return;}
  const bt=el('btPixCriar'),orig=bt.innerHTML;bt.disabled=true;bt.innerHTML='<span class="spin"></span> Conferindo...';
  try{
    const base=Object.assign({action:'criar',token:PIX.token,agente:AGNOME||'venda-manual'},d);
    let r=await pixApi(base);
    if(r.precisa_confirmar){
      if(!confirm(r.mensagem)){bt.disabled=false;bt.innerHTML=orig;return;}
      bt.innerHTML='<span class="spin"></span> Criando pedido...';
      r=await pixApi(Object.assign({},base,{confirmar:true}));
    }
    if(!r.ok)throw new Error(r.erro||'falha ao criar');
    (r.avisos||[]).forEach(a=>aviso(a));
    el('pixAcoes').style.display='none';el('pixFechado').style.display='block';
    el('pixFechado').textContent='✅ Pedido criado e pago ('+r.codigo+'). Buscando o número na Shopify...';
    toast('Pedido criado! 🎉');
    let n=0;clearInterval(pixPoll);
    pixPoll=setInterval(async()=>{n++;try{const s=await pixApi({action:'status',token:PIX.token});if(s.ok&&s.pix&&s.pix.pedido){el('pixFechado').textContent='✅ Pedido '+s.pix.pedido+' criado e pago.';clearInterval(pixPoll);carregarLista();}}catch(e){}if(n>20)clearInterval(pixPoll);},5000);
  }catch(err){aviso('Erro: '+err.message,'erro');toast('Erro: '+err.message);}
  bt.disabled=false;bt.innerHTML=orig;
}

async function ignorarPix(){
  if(!PIX)return;
  if(!confirm('Marcar o Pix de '+brl(PIX.valor)+' ('+(PIX.nome||'sem nome')+') como "não é venda"? Ele sai da lista e nenhum pedido é criado.'))return;
  const motivo=prompt('Motivo (opcional): devolução, transferência, sinal...')||'';
  const r=await pixApi({action:'ignorar',token:PIX.token,motivo,agente:AGNOME||'venda-manual'});
  if(!r.ok){toast('Erro: '+(r.erro||''));return;}
  el('pixAcoes').style.display='none';el('pixFechado').style.display='block';el('pixFechado').textContent='🚫 Marcado como não é venda.';
  toast('Pronto');carregarLista();
}

async function carregarLista(){
  if(!AG)return;
  try{
    const r=await pixApi({action:'lista',a:AG});
    if(!r.ok)return;
    AGNOME=r.agente||'';
    const box=el('pixLista');el('pixListaCard').style.display='block';
    if(!r.lista.length){box.innerHTML='<div class="sub">Nenhum Pix na chave esperando pedido. 🎉</div>';return;}
    box.innerHTML=r.lista.map(x=>'<div class="pixitem" data-tk="'+esc(x.token)+'"><div><b>'+esc(brl(x.valor))+'</b> · '+esc(x.nome||'sem nome')+'<div class="sub" style="margin:0">'+esc(quando(x.horario))+(x.status==='erro'?' · ⚠️ falhou, tente de novo':'')+'</div></div><button class="btn btn-azul btn-mini">Abrir</button></div>').join('');
    box.querySelectorAll('.pixitem').forEach(d=>d.onclick=()=>{const tk=d.getAttribute('data-tk');const u=new URL(location.href);u.searchParams.set('pix',tk);history.replaceState(null,'',u);limparTudo();abrirPix(tk);});
  }catch(e){}
}

window.criarPedidoPix=criarPedidoPix;window.ignorarPix=ignorarPix;
const limparOrig=window.limparTudo;
window.limparTudo=function(){PIX=null;clearInterval(pixPoll);limparOrig();modoPix(false);};
const tk=(QS.get('pix')||'').toLowerCase().replace(/[^a-f0-9]/g,'');
const iniciar=()=>{if(!PRODUTOS.length){setTimeout(iniciar,300);return;}if(tk)abrirPix(tk);carregarLista();};
iniciar();
})();
