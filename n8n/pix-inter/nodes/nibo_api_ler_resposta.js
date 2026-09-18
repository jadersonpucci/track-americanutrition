// O no HTTP baixa a resposta como arquivo (formato 'file'): o modo JSON quebra quando o Nibo devolve so um UUID entre aspas
// e o modo texto serializa o stream gzip. Aqui o binario vira texto, e ok/statusCode sao inferidos pelo corpo
// (erros do Nibo trazem error / Messages / statusCode >= 400).
const item = $input.first();
let t = '';
if (item.binary && item.binary.data) {
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  t = buf.toString('utf8');
} else if (item.json && typeof item.json.data === 'string') t = item.json.data;
let b = t;
try { b = JSON.parse(t); } catch (e) { b = t; }
if (b === '') b = null;
const falha = !!(b && typeof b === 'object' && !Array.isArray(b) && (b.error !== undefined || b.Messages !== undefined || Number(b.statusCode) >= 400));
return [{ json: { ok: !falha, statusCode: falha ? (Number(b.statusCode) || 400) : 200, body: b } }];
