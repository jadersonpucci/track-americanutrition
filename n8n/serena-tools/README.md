# Serena: ferramentas de venda (nós corrigidos em 19/09/2026)

Cópia dos nós Code alterados nos workflows da Serena no n8n. Cada arquivo é colado como está no nó indicado.

| Workflow (n8n) | Nó | Arquivo |
|---|---|---|
| `[Serena Tool] Gerar Boleto` (`gBgvM4y3bYzbnrE5`) | Validar dados | `gerar_boleto_validar_dados.js` |
| idem | Extrair draft | `gerar_boleto_extrair_draft.js` |
| `[Serena Tool] Gerar PIX` (`SkETGTmcqtlTR0Lp`) | Validar dados | `gerar_pix_validar_dados.js` |
| idem | Extrair draft | `gerar_pix_extrair_draft.js` |
| `[Serena Tool] Calcular Frete` (`D1l2l3IUrk4Lf9O1`) | Validar e parsear | `calcular_frete_validar_e_parsear.js` |
| idem | Formatar resposta | `calcular_frete_formatar_resposta.js` |

`node test_serena_tools.js` roda os testes locais (mocks de `$input`, `$()` e `httpRequest`).

## O caso que motivou (19/09/2026, Emerson, Araras/SP)

A Serena coletou os dados e "teve uma instabilidade" ao gerar o boleto. Na verdade:

1. A cotação de frete pelo CEP **13600-000** (CEP genérico de Araras) voltou vazia: a transportadora não cota por CEP genérico.
2. Na segunda tentativa (frete grátis, pedido acima de R$ 250) a Shopify recusou o rascunho: **"Enter a valid CPF/CNPJ"**. O CPF 116.485.317-54 tem dígito verificador errado; a ferramenta só conferia se tinha 11 dígitos.

## O que mudou

- **CPF com dígito verificador** (boleto e PIX, nó Validar dados): CPF inválido devolve `motivo: cpf_invalido` e uma mensagem que manda a Serena pedir o CPF de novo ao cliente, sem falar em instabilidade.
- **Recusa de CPF pela Shopify** (nó Extrair draft): se o `userError` menciona CPF/CNPJ, a resposta vira o mesmo pedido claro de CPF em vez do genérico "problema pra registrar seu pedido".
- **CEP genérico no calcular-frete** (nó Validar e parsear): CEP terminado em `000` cuja cotação volta vazia é recotado pelos CEPs vizinhos (`±1…±5` no prefixo, sufixo `000`); o primeiro que cota é usado e a resposta traz `cep` (o do cliente), `cep_cotado` e `aviso`. A chamada interna leva `_sem_vizinhos: true` (sem loop). Se nem os vizinhos cotarem, a mensagem pede o CEP da rua ou de um ponto de referência (nó Formatar resposta).
