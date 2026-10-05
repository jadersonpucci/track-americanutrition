import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// Copia mídias (imagens/vídeos) de uma URL de origem para o Storage (bucket imagens, pasta loja/…).
// POST /webhook/loja-migrar-midia  {k, itens:[{src, path, accept?}]}  →  {ok, itens:[{path, status, bytes}]}
// Usado uma vez por scripts/loja-midia.py para tirar o site do CDN da Shopify.
const entrada = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'Receber lote', parameters: { httpMethod: 'POST', path: 'loja-migrar-midia', responseMode: 'responseNode', options: {} } }
});

const validar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validar lote',
    parameters: {
      jsCode: `const b = $input.first().json.body || {};
if (b.k !== '__KEY__') throw new Error('chave invalida');
const itens = (b.itens || []).slice(0, 25);
return itens.filter((i) => i && /^https:\\/\\//.test(i.src) && /^loja\\/[A-Za-z0-9._\\/-]+$/.test(i.path || ''))
  .map((i) => ({ json: { src: i.src, path: i.path, accept: i.accept || '*/*' } }));`
    }
  }
});

const baixar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Baixar origem',
    onError: 'continueRegularOutput',
    parameters: {
      url: expr('{{ $json.src }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Accept', value: expr('{{ $json.accept }}') }] },
      options: { response: { response: { responseFormat: 'file' } }, timeout: 180000 }
    }
  }
});

const subir = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Subir no Storage',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr("{{ 'https://supabase.americanutrition.com/storage/v1/object/imagens/' + $('Validar lote').item.json.path }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-upsert', value: 'true' }, { name: 'cache-control', value: 'max-age=31536000' }] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 180000 }
    },
    credentials: { httpHeaderAuth: { id: 'W5vDvCikvGc6FWGB', name: 'Supabase Service Role' } }
  }
});

const resumo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Resumo',
    parameters: {
      jsCode: `const orig = $('Validar lote').all();
const out = $input.all().map((it, i) => ({ path: orig[i] && orig[i].json.path, ok: !it.json.error && !!(it.json.Key || it.json.Id || it.json.key), erro: it.json.error ? String(it.json.error.message || it.json.error).slice(0, 200) : null }));
return [{ json: { ok: true, itens: out } }];`
    }
  }
});

const responder = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} } }
});

export default workflow('loja-migrar-midia', 'Loja · Migrar mídia da Shopify')
  .add(entrada)
  .to(validar)
  .to(baixar)
  .to(subir)
  .to(resumo)
  .to(responder);
