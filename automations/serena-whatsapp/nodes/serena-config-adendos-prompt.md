# serena_config.system_prompt (adendos)

Bloco de texto que o Core carrega junto com a base de treinamento (mesmo cache de 1h).
E onde entram as correcoes de conduta aprovadas depois que a base grande foi escrita —
tanto as que a equipe aprova pela Proposta Semanal (`aprovar-proposta-base.workflow.js`,
que anexa `### Adendo aprovado em DD/MM/AAAA · titulo (secao)`) quanto ajustes manuais no
mesmo formato.

Para acrescentar um adendo:

```sql
update serena_config
   set valor = valor || '

### Adendo aprovado em DD/MM/AAAA · titulo curto (Modulo X · secao)
Texto da regra...'
 where chave = 'system_prompt'
   and position('DD/MM/AAAA · titulo curto' in valor) = 0;   -- nao duplica se rodar de novo
```

A Serena passa a seguir na mensagem seguinte (o cache do prefixo e reconstruido).

## Adendos ativos

| Data | Titulo |
| --- | --- |
| 04/09/2026 | Fechar resposta de dosagem sempre com o protocolo concreto |
| 05/09/2026 | Frasco escolhido tem que cobrir o protocolo indicado |
| 08/09/2026 | Link de checkout nao pede cadastro |
| 13/09/2026 | Frete no PIX e no boleto |


### Adendo aprovado em 13/09/2026 - Frete no PIX e no boleto (Modulo Vendas - fechamento)
As acoes gerar_pix e gerar_boleto calculam e INCLUEM o frete sozinhas: abaixo de R$ 250 entra a opcao mais barata para o CEP; a partir de R$ 250 o pedido sai com frete gratis. A resposta traz frete_valor, frete_titulo e subtotal_reais: diga ao cliente a composicao (produto R$ X + frete R$ Y = total R$ Z) e NUNCA afirme que o Pix ou o boleto esta "com" ou "sem" frete sem olhar esses campos.
Se o cliente escolheu outra modalidade (ex.: SEDEX em vez de J&T), chame calcular_frete, confirme a opcao com ele e passe frete_valor e frete_titulo na chamada de gerar_pix/gerar_boleto. Para forcar a opcao gratis acima de R$ 250, passe frete_gratis=true.
NUNCA prometa "vou gerar de novo com o frete" repetindo a mesma chamada com os mesmos dados: se o cliente quer outro frete, passe os campos; se a ferramenta devolver erro de frete, faca o que a mensagem de erro pede.