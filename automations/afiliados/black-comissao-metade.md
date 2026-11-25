# Comissão da Black Friday 2026 (metade da taxa, sem o corte por desconto)

Decisão do Jaderson (22/11/2026): na Black, representante e afiliado recebem **metade da taxa do programa sobre o
valor pago** (produtos sem frete), **sem** a regra de promoção (taxa − % de desconto), que zeraria a comissão a partir
de 2 frascos. Programa de 30% → 15%; 20% → 10%; 10% → 5%. O Paulo (super, override) não muda: ele só recebe de
tráfego pago e quando não há representante (`trafego_config.override_so_trafego_pago = on`, desde 01/09/2026).
Nível 2 (indicador do vendedor) segue como está.

## Onde

Workflow `Afiliados - Registrar Comissão` (`PNAFMdGMpTr8GSfU`), nó Postgres novo **"Black: comissão metade"**, ligado
na saída do "Registrar Conversao", em paralelo ao "Alinhar Tag Afiliado". Ele roda depois do corte de promoção
(que fica dentro do "Registrar Conversao") e grava por cima.

## Como reconhece pedido da Black

O checkout próprio grava o desconto automático como "DESCONTO" (manual), sem o nome da Black. Então:
- pedido criado entre 26/11 20h e 04/12 23h59 (Brasília; os dias depois de 30/11 são para boleto/PIX pago depois), e
- desconto / valor dos produtos = 20%, 30%, 35% ou 40% (tolerância de 0,6 ponto).

## Parâmetros do nó

```
$1 = String($json.resp.id)            -- conversão criada pelo Registrar Conversao
$2 = 'sim' | 'nao'                     -- regra acima, a partir do corpo do webhook
```

```sql
with alvo as (
  select c.id, c.afiliado_id, c.order_value,
         (select e.valor from af_comissao_efetiva(c.afiliado_id) e where e.tipo = 'percent') as taxa
    from afiliado_conversoes c join afiliados a on a.id = c.afiliado_id
   where c.id::text = $1 and $2 = 'sim' and c.nivel = 1 and not coalesce(a.is_super, false)
), up as (
  update afiliado_conversoes c set comissao_valor = round(alvo.order_value * alvo.taxa / 200.0, 2)
    from alvo where c.id = alvo.id and alvo.taxa is not null
  returning c.id, c.afiliado_id, c.order_value, c.comissao_valor
)
select up.id, up.order_value, up.comissao_valor, recalc_saldos(up.afiliado_id)::text as saldos from up
```

Teste (22/11, com rollback): conversão 2690 (Vix, R$ 310,65): 93,20 → 46,60.
