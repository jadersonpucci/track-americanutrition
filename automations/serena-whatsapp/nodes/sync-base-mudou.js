// No 'Mudou?' do workflow [Serena] Sync Base de Treinamento (D71uJKMi3u442bL0).
// Compara ETag + Last-Modified do site com o que esta salvo. Se igual, nada a fazer (baixa so quando o site muda).
// Sem ETag/Last-Modified (a Hostinger nao manda neste site desde 10/2026): baixa a cada 5 min e o hash decide.
const r = $('Checar Cabecalho').first().json || {};
const h = r.headers || {};
const etag = String(h.etag || '') + '|' + String(h['last-modified'] || '');
const salvo = String(($input.first().json || {}).etag_salvo || '');
const st = Number(r.statusCode || 0);
if (st && st !== 200) return []; // site fora -> deixa para o cron diario
if (etag === '|') return new Date().getUTCMinutes() % 5 === 0 ? [{ json: { etag: '', etag_salvo: salvo, sem_etag: true } }] : [];
if (etag === salvo) return [];
return [{ json: { etag: etag, etag_salvo: salvo } }];
