# Reviews

## Botão "Enviar p/ grupos" também publica no site (30/10/2026)

Workflow **AN - Reviews Enviar p/ Grupos** (`PQpcMivb7NabvzrO`): `POST /webhook/reviews-grupos` (painel de reviews) e
`GET /webhook/reviews-grupos-tg` (botão do Telegram).

### O problema

O botão gerava o card do depoimento (PNG 1080x1920) e agendava o envio para o grupo de WhatsApp **Depoimentos sobre
ImunoFosfo** e para o Telegram. Só isso.

A página [americanutrition.com/pages/depoimentos](https://www.americanutrition.com/pages/depoimentos) não lê a tabela
`reviews`. Ela lê os metaobjects `depoimento` da Shopify (mídia, tipo, produto, tom) pela Storefront API. Por isso,
nenhum dos 7 depoimentos enviados pelo botão desde 14/10 chegou ao site.

### Como ficou

Depois do `Agendar Broadcast`, o mesmo card sobe para os Arquivos da Shopify e vira um metaobject `depoimento`:

| Node | O que faz |
|---|---|
| `Site: Preparar Upload` ([código](nodes/site-preparar-upload.js)) | Decide se publica: o envio foi agendado ou o pedido é só para o site. Pede o `stagedUploadsCreate` (PUT) e devolve o PNG como binário do n8n. |
| `Site: Subir?` | Se não há nada para subir, vai direto para a `Resposta`. |
| `Site: Subir PNG` | HTTP PUT do binário para a URL do staged upload, com `Content-Type: image/png`. |
| `Site: Criar Depoimento` ([código](nodes/site-criar-depoimento.js)) | Roda `fileCreate` e espera o arquivo ficar `READY`. Depois roda `metaobjectCreate` com handle `review-<8 primeiros do id>`, tipo `imagem`, tom `recomendacao`, produto do review e status `ACTIVE`. Grava `reviews.site_metaobject_id` e `site_em`. |
| `Resposta` ([código](nodes/resposta.js)) | O JSON e a página do Telegram passam a dizer se o depoimento entrou no site. |

- **Duplicação:** um review que já tem `site_metaobject_id` não é publicado de novo, a não ser com `force`.
- **Arquivo recusado:** se a Shopify recusar o arquivo, o metaobject não é criado. Assim não aparece card quebrado
  no site, e o erro volta na resposta.

**Por que o PUT é um node HTTP.** Mandado de dentro do Code node, o `Buffer` chegava ao Google Storage sem o tipo
certo. A Shopify gravava o arquivo como `application/octet-stream` e ele falhava com `UNSUPPORTED_IMAGE_FILE_TYPE`.
Pelo node HTTP com `binaryData`, o tipo vai certo.

**Só o site, sem reenviar aos grupos:**

```bash
curl -X POST https://n8n.americanutrition.com/webhook/reviews-grupos \
  -H 'Content-Type: application/json' \
  -d '{"k":"<ADMIN_TOKEN>","id":"<uuid do review>","site":true}'
```

O `k` é o `review_config.admin_token`. Sem ele, a resposta é "Acesso negado".

### Repescagem

Os 7 reviews que já tinham ido para os grupos foram publicados no site pelo modo `site:true`: Cleber, Marcelo
Kawakami, Nilce, Carla, José Carlos, Tais e Rosana. Os 7 aparecem no topo da página de depoimentos.

### Banco

```sql
alter table reviews add column if not exists site_metaobject_id text, add column if not exists site_em timestamptz;
```
