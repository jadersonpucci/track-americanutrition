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

Testado no Chromium, no celular (390px) e no desktop, com a assinatura ligada, desligada, no PIX e no cartão.
O teste foi repetido no HTML publicado. Publicado em 27/10 às 15h12. O backup automático é a versão de 16/10;
`{"action":"rollback"}` volta para ela.
