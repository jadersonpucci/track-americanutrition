// Implementacao minima de Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) so com o modulo crypto do Node.
const crypto = require('crypto');
const b64u = b => Buffer.from(b).toString('base64url');
const fromB64u = s => Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'), 'base64');
function hkdf(salt, ikm, info, len) { return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len)); }
function encrypt(payload, p256dh, auth, opts) {
  opts = opts || {};
  const uaPub = fromB64u(p256dh), authSecret = fromB64u(auth);
  const salt = opts.salt ? fromB64u(opts.salt) : crypto.randomBytes(16);
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPriv) ecdh.setPrivateKey(fromB64u(opts.asPriv)); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPub);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const padded = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}
function decrypt(body, uaPriv, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(fromB64u(uaPriv));
  const uaPub = ecdh.getPublicKey(); const shared = ecdh.computeSecret(asPub);
  const ikm = hkdf(fromB64u(auth), shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return pt.subarray(0, pt.length - 1).toString('utf8');
}
function vapidHeaders(endpoint, pubB64u, privB64u, sub) {
  const aud = new URL(endpoint).origin;
  const hdr = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const pay = b64u(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub }));
  const pub = fromB64u(pubB64u);
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: privB64u, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(hdr + '.' + pay), { key: key, dsaEncoding: 'ieee-p1363' });
  return { Authorization: 'vapid t=' + hdr + '.' + pay + '.' + b64u(sig) + ', k=' + pubB64u };
}
function gerarVapid() { const k = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); const j = k.privateKey.export({ format: 'jwk' }); const pub = Buffer.concat([Buffer.from([4]), fromB64u(j.x), fromB64u(j.y)]); return { publica: b64u(pub), privada: j.d }; }
module.exports = { encrypt, decrypt, vapidHeaders, gerarVapid, b64u, fromB64u };

if (require.main === module) {
  // Vetor da RFC 8291 secao 5
  const v = { pt: 'When I grow up, I want to be a watermelon', uaPriv: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgZcM4A', uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg', asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    esperado: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN' };
  const out = encrypt(v.pt, v.uaPub, v.auth, { asPriv: v.asPriv, salt: v.salt });
  console.log('RFC8291 vetor bate:', b64u(out) === v.esperado);
  console.log('round-trip:', decrypt(out, v.uaPriv, v.auth) === v.pt);
  const k = gerarVapid(); const h = vapidHeaders('https://web.push.apple.com/QAbc', k.publica, k.privada, 'mailto:contato@americanutrition.com');
  // verifica a assinatura do JWT
  const [hh, pp, ss] = h.Authorization.split(' ')[1].replace(/^t=/, '').split(',')[0].split('.');
  const pub = fromB64u(k.publica); const pk = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  console.log('VAPID JWT valido:', crypto.verify('sha256', Buffer.from(hh + '.' + pp), { key: pk, dsaEncoding: 'ieee-p1363' }, fromB64u(ss)), 'pub len', pub.length);
}
