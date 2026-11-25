const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const css = require('fs').readFileSync('/tmp/css-produto.css','utf8');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 393, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:8799/', { waitUntil: 'load' });
  await p.waitForSelector('#anchat-fab');
  await p.addStyleTag({ content: css });
  await p.evaluate(() => {
    const d=document.createElement('div'); d.id='buybar';
    d.style.cssText='position:fixed;left:0;right:0;bottom:0;height:86px;background:#fff;border-top:1px solid #ddd;display:flex;align-items:center;justify-content:space-between;padding:0 13px;font:600 14px -apple-system;z-index:9';
    d.innerHTML='<span>ImunoFosfo · R$ 197</span><span style="background:#c0121a;color:#fff;padding:10px 16px;border-radius:8px">COMPRAR</span>';
    document.body.appendChild(d);
  });
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const f=document.getElementById('anchat-fab').getBoundingClientRect();
    const bb=document.getElementById('buybar').getBoundingClientRect();
    return { altura_do_conjunto: Math.round(f.height), largura: Math.round(f.width),
             base: Math.round(innerHeight-f.bottom), topo: Math.round(innerHeight-f.top),
             topo_da_barra: Math.round(innerHeight-bb.top), folga_ate_a_barra: Math.round(f.bottom>bb.top?-1:(bb.top-f.bottom)) };
  });
  console.log(JSON.stringify(m));
  console.log(m.folga_ate_a_barra >= 0 ? '  OK: acima da barra de compra, altura de um botao so ('+m.altura_do_conjunto+'px)' : '  FALHOU');
  await p.screenshot({ path: '/tmp/lado.png', clip: { x: 150, y: 560, width: 243, height: 240 } });
  await b.close();
})();
