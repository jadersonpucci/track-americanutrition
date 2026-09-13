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
