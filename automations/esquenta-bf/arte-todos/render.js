const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const dir = __dirname;
  const layout = JSON.parse(fs.readFileSync(path.join(dir, 'layout.json'), 'utf8'));
  const scale = Number(process.argv[2] || 1);
  const out = process.argv[3] || 'arte.png';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: scale });
  await p.addInitScript((l) => { window.LAYOUT = l; }, layout);
  await p.goto('file://' + path.join(dir, 'arte.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const font = await p.evaluate(() => document.fonts.check('900 40px Montserrat'));
  console.log('Montserrat carregada:', font);
  await p.screenshot({ path: path.join(dir, out) });
  await b.close();
})();
