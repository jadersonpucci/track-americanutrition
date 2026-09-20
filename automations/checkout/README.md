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
