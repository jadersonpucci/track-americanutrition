const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 393, height: 800 }, deviceScaleFactor: 2 });
  const err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto('http://127.0.0.1:8799/', { waitUntil: 'load' });
  await p.waitForSelector('#anchat-fab', { timeout: 8000 });
  const est = await p.evaluate(() => {
    const f = document.getElementById('anchat-fab').getBoundingClientRect();
    const tg = document.getElementById('anchat-tg');
    const b = document.getElementById('anchat-b').getBoundingClientRect();
    const t = tg.getBoundingClientRect();
    return { stack: Math.round(f.width)+'x'+Math.round(f.height), telegram_acima: Math.round(t.bottom) < Math.round(b.top),
             href: tg.getAttribute('href'), tg: Math.round(t.width), chat: Math.round(b.width) };
  });
  console.log('botões:', JSON.stringify(est));
  await p.screenshot({ path: '/tmp/fab.png', clip: { x: 250, y: 620, width: 143, height: 180 } });
  await p.click('#anchat-b'); await p.waitForTimeout(500);
  console.log('faixa visível antes de conversar:', await p.evaluate(() => !document.getElementById('anchat-tgb').classList.contains('off')));
  await p.screenshot({ path: '/tmp/painel-tg.png', clip: { x: 0, y: 0, width: 393, height: 260 } });
  await p.evaluate(() => {
    const m = document.getElementById('anchat-m');
    ['eu','ela'].forEach(q => { const d=document.createElement('div'); d.className='anm '+q; const x=document.createElement('div'); x.className='anb'; x.textContent='teste'; d.appendChild(x); m.appendChild(d); });
    document.getElementById('anchat-tgb').classList.toggle('off', m.querySelectorAll('.anm').length > 1);
  });
  console.log('faixa some depois de conversar:', await p.evaluate(() => document.getElementById('anchat-tgb').classList.contains('off')));
  console.log(err.length ? 'ERROS: '+err.join(' | ') : 'sem erros de JS');
  await b.close();
})();
