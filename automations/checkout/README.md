# Checkout (Pagar.me — Criar Pedido, Fluxo A)

Workflow `DHeud8c0Qkb0EDwS`: recebe o checkout customizado, cria a order no Pagar.me e devolve ao navegador o que
ele mostra na tela (PIX copia e cola, boleto, mensagens de recusa).

## Boleto no modelo da marca (13/09/2026)

`fluxo-a-formatar-resposta.js` é o node "Formatar Resposta". Desde 13/09 o campo `boleto_url` (o botão
"Ver e imprimir boleto" do checkout) aponta para a página do workflow "AN - Boleto Personalizado"
(`GET /webhook/boleto?l=<linha>&n=<nome>&d=<cpf>&p=<código do pedido>&it=<itens>&end=<endereço>`), montada a
partir da própria linha digitável devolvida pelo Pagar.me. O PDF cru do Pagar.me fica em `boleto_pdf`, só como
reserva. Antes disso, 34 boletos em 30 dias saíram com o PDF cru.

Onde o boleto já saía no modelo: resgate de boleto não pago (Dispatcher Carrinho Abandonado, `boleto_doc_url`)
e, desde 13/09, o Gerar Boleto da Serena. Onde ainda não sai: nenhum outro ponto conhecido.

## Antifraude v3.7 e lista de bloqueio por endereço (19/09/2026)

Caso: chargeback 4837 (fraude, sem autorização do portador) no pedido AN-15104 de 30/08, R$ 177,44, cartão de uma
terceira pessoa. O comprador fez 22 tentativas de cartão entre 30/08 e 09/09, todas para R. Sidônio Ramos de Oliveira
389/399, Caravágio, Osório/RS, alternando três identidades (dois CPFs, três e-mails, dois telefones, 4 IPs). O
AN-RATE-GUARD barrava só dentro dos 30 minutos; ele voltava em outro dia e passava.

O que mudou no node `Checar Estoque` (`nodes/fluxo-a-checar-estoque.js`):
- `cliente_blocklist` ganhou o tipo `endereco`: valor `CEP|rua normalizada` (sem acento, minúscula, sem "R./Rua/Av").
  O checkout compara CEP igual e rua contida no endereço de entrega. Vale para todos os métodos. A constraint da
  tabela foi ampliada para aceitar o tipo.
- Regras de janela longa (só cartão): mesmo telefone com 3+ CPFs distintos em 7 dias; mesmo CPF ou e-mail com 6+
  recusas do emissor (`pagarme_orders.status = failed`) em 7 dias. Bloqueio com a mesma mensagem genérica.
- `Montar Payload Pagar.me` (`nodes/fluxo-a-montar-payload.js`) passa a enviar `ip` (vindo do Gate, `_client_ip`) e
  `session_id` na order do Pagar.me, insumos do antifraude da adquirente quando contratado.

Bloqueados por este caso: CPFs 327.133.716-00, 012.229.661-31 e 151.569.177-20; e-mails carloshenriqueamaral69,
fabriciocruz0178 e elianecaixeta038 (gmail); telefones (11) 97431-5112 e (81) 97628-1972; IPs 179.68.30.15,
188.220.169.63, 191.39.76.172 e 2804:389:f290:b1da:8d0f:12dd:e4de:5343; endereço `95520000|sidonio ramos de oliveira`.
Os dois telefones também entraram em `serena_wpp_bloqueados`.

Testes (19/09): gate com o e-mail do fraudador → `status: blocked`; Fluxo A com identidade nova no endereço bloqueado
→ `failed` com a mensagem genérica, registrado em `pagamento_tentativas` como BLOCKLIST, sem chamar o Pagar.me.

Fica para a conta Pagar.me (não dá para fazer daqui): contratar o Antifraude (ClearSale/Konduto) e, se quiser transferir
a responsabilidade do chargeback ao emissor, o 3DS 2.0, que exige integração no front do checkout.

## WhatsApp com +55 no campo de DDD (16/10/2026)

O campo "WhatsApp (DDD + número)" tinha máscara de 11 dígitos, e o checkout usa os 2 primeiros como DDD. Quem
digitava ou colava o número com o código do país (`+55 21 99923-0800`) ficava com `(55) 21999-2308`: DDD 55 e
número truncado. Esse número passava na validação (55 é um DDD válido, do RS), e o cliente nunca recebia
WhatsApp nenhum (PIX da renovação, convite do Pix Automático, rastreio). Pelo menos 13 assinaturas foram
gravadas assim.

O HTML do checkout fica no static data do workflow `Deploy / Servir Checkout` (`AW9QQoFCsunFLsQh`), publicado
por `POST /webhook/checkout-deploy` (header `x-deploy-key`; `{"action":"get"}` baixa, `{"html":...}` publica e
guarda a versão anterior, `{"action":"rollback"}` volta). Duas mudanças, marcadas com `DDD-55-FIX`:

- `mascaraTel`: com mais de 11 dígitos começando em 55, o 55 é do país e sai antes de cortar em 11.
  `+55 21 99923-0800` digitado ou colado vira `(21) 99923-0800`.
- `coletarDados`: WhatsApp começando em 55 com entrega fora do RS gera um aviso na primeira tentativa de
  finalizar ("digite só DDD + número, sem o 55 do país"). Quem tem DDD 55 de verdade e mora em outro estado
  finaliza de novo e passa, para não perder a venda. Com entrega no RS, passa direto.

Testado no Chromium com as requisições externas bloqueadas, antes e depois do deploy. A versão anterior
reproduz o erro (`(55) 21999-2308`). Publicado em 16/10 às 11h27; o backup automático é a versão de 19/09.

## Assinatura explícita no checkout (27/10/2026)

O Jaderson relatou clientes assinando sem perceber. O que estava levando a isso:

- O box da assinatura fica no topo da etapa de pagamento e só falava em "10% OFF".
- O botão de assinar era vermelho e cheio, com cara de "continuar a compra".
- Com a assinatura ligada, o resumo mostrava apenas "Desconto (-10%)" e o botão seguia "Finalizar compra",
  sem dizer que haveria cobrança todo mês.

A mudança é um bloco no fim do HTML, marcado `AN-ASSIN-CLARO`. A cópia está em
[`patches/assinatura-explicita.html`](patches/assinatura-explicita.html). O que ele faz:

- **Selo no topo do box:** "ASSINATURA MENSAL (opcional) · Entrega e cobrança automáticas a cada 30 dias".
- **Botão de assinar desligado:** vira contorno vermelho com o texto "Quero assinar: todo mês com 10% OFF". Fica
  cheio só o botão de pagar. A nota abaixo diz "Opcional. Sem assinar, esta é uma compra única...".
- **Assinatura ligada:**
  - os dois resumos mostram "Desconto assinatura (-10%)";
  - o botão vira **"Assinar e pagar"**, com "R$ X agora · depois R$ Y a cada 30 dias";
  - logo acima do botão aparece uma **confirmação obrigatória**: "Entendi que estou fazendo uma ASSINATURA. Vou
    receber [itens] a cada 30 dias e pagar R$ Y em cada renovação (cartão ou PIX no WhatsApp)... Posso cancelar
    quando quiser". Embaixo dela há o link "Prefiro compra única, sem assinatura", que desliga a assinatura.
- **Bloqueio:** sem a confirmação marcada, o pagamento não sai, seja pelo clique no botão ou pela
  `finalizarCompra()` chamada de outro lugar. A caixa pisca e a tela rola até ela. Ligar ou desligar a
  assinatura desmarca a confirmação.

**Sem desconto na 1ª compra (15h17, regra trocada às 15h56):** quem tem assinatura ativa ou pagou uma nos
últimos 60 dias não ganha os 10% na primeira compra, só a partir da 2ª entrega. A regra está em
`../assinaturas/README.md`; antes valia para qualquer ex-assinante. Esse aviso tinha sumido
com a primeira versão do bloco e voltou: aparece na nota do box e no fim da confirmação. O botão mostra
"R$ 327,00 agora · depois R$ 294,30 a cada 30 dias". Foi o caso da Fabiana (27/10) e do Winslow (26/10).

Testado no Chromium, no celular (390px) e no desktop, com a assinatura ligada, desligada, no PIX e no cartão.
O teste foi repetido no HTML publicado. Publicado em 27/10 às 15h12, com ajuste às 15h17. O backup automático agora é a versão das 15h12. Para voltar
ao checkout de antes da mudança, publique o HTML de 16/10 sem o bloco `AN-ASSIN-CLARO`.

## PIX vencido devolvido de novo pelo gate (30/10/2026)

**O caso:** a Rosana Caraschi tentou pagar R$ 567,15 em 30/10, e o banco disse que o código PIX era inválido. O PIX
era o de 23/10 (txid `ANmvkysw206e7a80bzimtbujl138ph5c`), que tinha vencido em 24/10 às 09h47. A URL de cobrança
desse PIX no Inter já respondia 404.

**A causa:** o checkout grava no celular uma chave por carrinho (`localStorage` `an_intent:<assinatura do
carrinho>`) e nunca a apaga. O `AN Checkout Gate` (`htUp2uQx0LpaCwCk`) repetia a resposta guardada para a mesma
chave por até 14 dias. Quem voltava com o mesmo carrinho recebia de novo o PIX antigo, já vencido. Com cartão, a
recompra do mesmo carrinho dentro de 14 dias recebia a resposta da compra anterior, e nenhum pedido novo era
criado.

**A correção:** o gate agora só repete a resposta guardada se ela tiver **menos de 30 minutos**. Isso continua
cobrindo clique duplo e recarregamento da página. O código está em
[`nodes/gate-idempotencia.js`](nodes/gate-idempotencia.js), com a chave da Supabase como marcador.

## Modo sem afiliado (03/11/2026)

Pedido do Jaderson: nos navegadores da equipe não pode ficar cookie de afiliado (`an_aff`, `an_ref`, `an_bg_ref`).
Bloquear cookies do site no navegador quebraria carrinho e checkout, então o opt-out foi feito no código.

- **Como usar:** abrir uma vez `https://americanutrition.com/?noaff=1` em cada navegador (aparece o aviso "Modo sem
  afiliado LIGADO"). Grava o cookie `an_noaff=1` em `.americanutrition.com` por 1 ano, valendo para a loja e o checkout.
  `?noaff=0` desliga. Também funciona abrindo direto no checkout.
- **O que faz com o modo ligado** (`nodes/noaff-guard.html`):
  - apaga `an_aff`, `an_ref` e `an_bg_ref`, e o `an_bg_ref` do localStorage do checkout;
  - tira `ref`, `aff`, `bg_ref` e `d` da URL antes dos outros scripts lerem, sem mexer no resto (o `items=` fica
    intacto);
  - impede a gravação desses cookies e do `an_bg_ref` no localStorage.

  O checkout então manda o pedido sem afiliado e não avisa o BixGrow. Cupom por `?discount=` continua funcionando.
- **Sem o cookie `an_noaff`, o script não faz nada**, então clientes não são afetados.
- **Onde está:**
  - loja: tema principal (`155877212332`), `layout/theme.liquid`, logo depois do `<meta charset="utf-8">`;
  - checkout: HTML publicado pelo `/webhook/checkout-deploy`, logo depois do `<head>`.

  Os dois ficam antes dos scripts de afiliado. O deploy do checkout guardou a versão de 27/10 (`action: rollback`
  volta).
- **Teste (Chromium, com o HTML real das duas páginas):**
  - sem o modo, `?ref=` grava como antes;
  - com `?noaff=1`, os cookies de afiliado que já existiam somem;
  - link com `ref`/`bg_ref`/`d` não grava nada, e nem uma escrita forçada de `an_aff` passa;
  - no checkout, `__AN_REF()` volta vazio;
  - `?noaff=0` faz `?ref=` voltar a gravar.

## Utmify sem UTMs nos links internos da loja (03/11/2026)

**O problema.** O link "produtos" da home ia para `/collections/america-nutrition?utm_source=FB&utm_campaign=…`. Quem
faz isso é a Utmify (`cdn.utmify.com.br/scripts/utms/latest.js`, em `layout/theme.liquid`): ela guarda os UTMs do
anúncio por 7 dias no navegador e os cola em todos os links do site, inclusive na navegação interna.

**Correção** (`nodes/utmify-links-internos.html`, no tema logo antes da tag da Utmify):
- a tag da Utmify ganhou `data-utmify-ignore-classes="an-int"`;
- um bloco marca com `an-int` os links para `americanutrition.com` / `www`. Ele roda no `DOMContentLoaded`, antes do
  `load` em que a Utmify decora, e tem um observador para os links que aparecem depois.

Os links para o checkout, o WhatsApp e outros sites continuam com os UTMs. A origem do tráfego segue no cookie
`an_src`, que vale para todo o domínio `.americanutrition.com`.

**Teste** (Chromium, HTML real da home e o script da Utmify, chegando com UTMs do Facebook):
- antes: os 97 links internos ficavam com UTM;
- depois: nenhum, incluindo um link criado depois do carregamento;
- o link do checkout continua com os UTMs.

## PIX pago sem pedido por e-mail com ".." (03/11/2026)

**Caso.** Comprovante da Veronica Firmino dos Santos: R$ 342,02 em 01/11 às 19:10, descrição "Pedido
AN-1793570783070". O Inter confirmou (`checkout_pix_inter`, `CONCLUIDA`, E2E `E60746948202611012209A0793Mh2agQ`),
mas o pedido não nasceu na Shopify. O e-mail foi digitado como `veronica2008pb@gmail..com`: a validação do checkout
aceitava pontos repetidos no domínio e a Shopify recusava o pedido. Sobrou só o alerta "Cobrança paga SEM pedido"
(Telegram, tópico 13). A busca achou o mesmo problema com Fabiano Saul Rover: R$ 355,85 em 27/09, e-mail
`contato@fabianorover..com.br`, sem pedido havia 5 semanas.

**Correção:**
- **Checkout:** `validarEmail` recusa `..` e ponto no começo ou colado no `@`, então a cliente vê o erro no campo e
  corrige. O deploy guardou a versão anterior.
- **Confirmação** (`nodes/confirmacao-pago-limpar-email.js`, no nó `Truncar Tags (max 40)`): limpa o e-mail antes
  de criar o pedido (`..` vira `.`, espaços e pontos soltos saem). Se o e-mail continuar inválido, o pedido sai sem
  e-mail em vez de falhar.

**Recuperação** (autorizada pelo Jaderson):
- os dois pedidos foram criados pelo fluxo normal, com um `order.paid` montado a partir da `checkout_pix_inter`.
  O id leva o sufixo `-r` porque o fluxo guarda os ids já processados e descartaria a repetição;
- Veronica: **AN-16377** (afiliada Vivian Fortunato, cupom PROMO5), com a confirmação no WhatsApp enviada;
- Fabiano: **AN-16378** (Nova Trento/SC, Sedex), com a confirmação agendada;
- os três pagamentos de 18/09 sem vínculo já tinham pedido e foram ligados: AN-15517, AN-15519 e AN-15520.

Hoje não sobra nenhum PIX do Inter pago sem pedido.
