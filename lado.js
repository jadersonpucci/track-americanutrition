const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const css = require('fs').readFileSync('/tmp/an-chat-serena.liquid','utf8')
  .replace(/\{%-? comment -?%\}[\s\S]*?\{%-? endcomment -?%\}/g,'')
  .replace(/\{%[^}]*%\}/g,'178px')   // simula pagina de produto
  .replace(/<\/?(style|script)[^>]*>/g,'');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 393, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:8799/', { waitUntil: 'load' });
  await p.waitForSelector('#anchat-fab');
  await p.addStyleTag({ content: css });
  // barra de compra falsa, com a altura real do tema
  await p.evaluate(() => {
    const d=document.createElement('div');
    d.style.cssText='position:fixed;left:0;right:0;bottom:0;height:86px;background:#fff;border-top:1px solid #ddd;display:flex;align-items:center;justify-content:space-between;padding:0 13px;font:600 14px -apple-system;z-index:9';
    d.innerHTML='<span>ImunoFosfo · R$ 197</span><span style="background:#c0121a;color:#fff;padding:10px 16px;border-radius:8px">COMPRAR</span>';
    document.body.appendChild(d);
  });
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const f=document.getElementById('anchat-fab').getBoundingClientRect();
    const bb=document.querySelector('div[style*="86px"]').getBoundingClientRect();
    return { fab_altura: Math.round(f.height), fab_largura: Math.round(f.width),
             base_do_stack: Math.round(innerHeight-f.bottom), topo_do_stack: Math.round(innerHeight-f.top),
             topo_da_barra: Math.round(innerHeight-bb.top), sobrepoe: f.bottom > bb.top };
  });
  console.log(JSON.stringify(m, null, 1));
  console.log(m.sobrepoe ? '  FALHOU: cobre a barra de compra' : '  OK: acima da barra, altura de um botao so');
  await p.screenshot({ path: '/tmp/lado.png', clip: { x: 180, y: 590, width: 213, height: 210 } });
  await b.close();
})();
