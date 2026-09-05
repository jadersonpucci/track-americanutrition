# serena_config.documentos

Arquivos que a Serena pode mandar no WhatsApp. O conteudo de `serena-config-documentos.json`
e o valor da linha `serena_config` com `chave = 'documentos'`.

Campos de cada item:

| campo | para que serve |
| --- | --- |
| `chave` | identificador usado no marcador `[[ARQUIVO: chave]]` |
| `nome` | nome do arquivo como o cliente ve no WhatsApp |
| `tipo` | `document`, `image` ou `video` (vai como `mediatype` no sendMedia) |
| `url` | URL publica do arquivo (Supabase Storage) |
| `legenda` | legenda (`caption`) enviada junto |
| `quando` | criterio em linguagem natural; entra no prompt do Core |
| `gatilhos` | palavras que a rede de seguranca procura na mensagem do cliente ou na resposta; se ausente, usa a `chave` |

Para adicionar um arquivo novo: suba para o Storage, acrescente um item aqui e rode

```sql
update serena_config set valor = '<json>' where chave = 'documentos';
```

Nenhum workflow precisa mudar — o Core le a lista a cada mensagem.
