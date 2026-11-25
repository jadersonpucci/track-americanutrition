const o = $('Triagem').first().json;
const r = $input.first().json || {};
const b64 = r.base64 || r.media || (r.data && r.data.base64) || '';
if (!b64) return [{ json: Object.assign({}, o, { sem_audio: true }) }];
// O ElevenLabs aceita audio e video, mas nao vale mandar arquivo gigante pela memoria do n8n
const bytes = Math.floor(String(b64).length * 3 / 4);
if (bytes > 25 * 1024 * 1024) return [{ json: Object.assign({}, o, { sem_audio: true, grande: true }) }];
const mime = String(r.mimetype || o.mimetype || (o.tipo === 'video' ? 'video/mp4' : 'audio/ogg')).split(';')[0];
const ehVideo = o.tipo === 'video' || /^video\//.test(mime);
const ext = ehVideo ? 'mp4' : (/mp4|m4a/.test(mime) ? 'm4a' : (/mpeg|mp3/.test(mime) ? 'mp3' : 'ogg'));
const nome = (ehVideo ? 'video.' : 'audio.') + ext;
return [{ json: Object.assign({}, o, { sem_audio: false }), binary: { data: await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), nome, mime) } }];
