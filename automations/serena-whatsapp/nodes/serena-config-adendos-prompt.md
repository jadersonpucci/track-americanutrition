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
