#!/usr/bin/env python3
"""Exporta pedidos e cupons da Shopify para a loja própria (gera um .sql para rodar no Supabase).

Pedidos entram por loja_pedido_criar (origem 'shopify', shopify_id preenchido: rodar de novo não duplica);
rastreio e status de entrega vêm dos fulfillments; cupons de desconto (códigos) vão para loja_cupons.

Uso (Mac), com um token de Admin API (Shopify → Configurações → Apps → Desenvolver apps; escopos
read_orders, read_all_orders, read_customers, read_discounts):

    python3 scripts/loja-importar-pedidos.py --loja 39c4f8-2.myshopify.com --token shpat_xxx --desde 2024-01-01 --saida pedidos.sql
    psql "$SUPABASE_DB_URL" -f pedidos.sql        # ou cole no SQL Editor do Supabase

Depois ajuste a numeração para continuar de onde a Shopify parou:
    select setval('loja_pedido_numero', (select max(numero) from loja_pedidos));
"""
import argparse, json, ssl, sys, time, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('--loja', required=True)
ap.add_argument('--token', required=True)
ap.add_argument('--desde', default='2020-01-01')
ap.add_argument('--saida', default='pedidos.sql')
a = ap.parse_args()
URL = f'https://{a.loja}/admin/api/2025-07/graphql.json'

def gql(q, v=None):
    for tent in range(6):
        req = urllib.request.Request(URL, data=json.dumps({'query': q, 'variables': v or {}}).encode(), headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': a.token})
        try:
            j = json.load(urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=60))
        except Exception as e:
            time.sleep(2 ** tent); continue
        if j.get('errors') and any('THROTTLED' in json.dumps(e) for e in j['errors']): time.sleep(2 ** tent); continue
        if j.get('errors'): sys.exit('Shopify: ' + json.dumps(j['errors'])[:500])
        return j['data']
    sys.exit('Shopify não respondeu.')

Q_PED = '''query($c:String,$q:String){ orders(first:100, after:$c, query:$q, sortKey:CREATED_AT) { pageInfo{hasNextPage endCursor} nodes {
  id name createdAt processedAt cancelledAt displayFinancialStatus displayFulfillmentStatus note tags sourceName
  email phone customer{ firstName lastName email phone }
  shippingAddress{ zip address1 address2 city provinceCode countryCodeV2 phone name }
  subtotalPriceSet{shopMoney{amount}} totalDiscountsSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}} totalPriceSet{shopMoney{amount}}
  discountCodes shippingLine{ title }
  customAttributes{ key value }
  transactions(first:5){ gateway kind status }
  fulfillments(first:5){ createdAt trackingInfo{ number company } displayStatus }
  lineItems(first:50){ nodes{ title quantity sku variant{ id } originalUnitPriceSet{shopMoney{amount}} discountedUnitPriceSet{shopMoney{amount}} } }
} } }'''

def sql(v): return '$J$' + json.dumps(v, ensure_ascii=False) + '$J$'
PAG = {'PAID': 'pago', 'PARTIALLY_REFUNDED': 'parcial', 'REFUNDED': 'reembolsado', 'VOIDED': 'cancelado', 'PENDING': 'pendente', 'AUTHORIZED': 'pendente'}
out = open(a.saida, 'w', encoding='utf-8')
out.write('-- gerado por scripts/loja-importar-pedidos.py\nbegin;\n')
n, cur = 0, None
while True:
    d = gql(Q_PED, {'c': cur, 'q': f'created_at:>={a.desde}'})['orders']
    for o in d['nodes']:
        attrs = {x['key']: x['value'] for x in o.get('customAttributes') or []}
        c = o.get('customer') or {}; s = o.get('shippingAddress') or {}
        pago = o['displayFinancialStatus'] in ('PAID', 'PARTIALLY_REFUNDED')
        tx = next((t for t in o.get('transactions') or [] if t['status'] == 'SUCCESS'), {})
        payload = {
            'origem': 'shopify', 'shopify_id': o['id'].split('/')[-1], 'paid': pago,
            'customer': {'name': ' '.join(x for x in [c.get('firstName'), c.get('lastName')] if x) or s.get('name'), 'email': o.get('email') or c.get('email'), 'phone': o.get('phone') or c.get('phone') or s.get('phone'), 'cpf': attrs.get('cpf') or attrs.get('CPF')},
            'shipping_address': {'zip': s.get('zip'), 'address1': s.get('address1'), 'address2': s.get('address2'), 'city': s.get('city'), 'province_code': s.get('provinceCode'), 'country_code': s.get('countryCodeV2')},
            'shopify_items': [{'variant_id': (li.get('variant') or {}).get('id', '').split('/')[-1] or None, 'quantity': li['quantity'], 'price': float(li['discountedUnitPriceSet']['shopMoney']['amount']), 'title': li['title']} for li in o['lineItems']['nodes']],
            'discount_code': (o.get('discountCodes') or [None])[0], 'discount_amount': float(o['totalDiscountsSet']['shopMoney']['amount']),
            'shipping_price': float(o['totalShippingPriceSet']['shopMoney']['amount']), 'shipping_title': (o.get('shippingLine') or {}).get('title'),
            'total': float(o['totalPriceSet']['shopMoney']['amount']), 'payment': {'gateway': tx.get('gateway'), 'method': tx.get('gateway')},
            'ref': attrs.get('ref') or attrs.get('afiliado'), 'note': o.get('note'), 'tags': o.get('tags') or [],
        }
        numero = o['name'].lstrip('#').split('-')[0]
        out.write(f"select loja_pedido_criar({sql(payload)}::jsonb);\n")
        st = PAG.get(o['displayFinancialStatus'], 'pendente')
        if o.get('cancelledAt'): st = 'cancelado'
        ent = {'FULFILLED': 'enviado', 'PARTIALLY_FULFILLED': 'preparando'}.get(o['displayFulfillmentStatus'], 'nao_enviado')
        f = next((x for x in o.get('fulfillments') or [] if x.get('trackingInfo')), None)
        rast = f['trackingInfo'][0]['number'] if f and f['trackingInfo'] else None
        if f and f.get('displayStatus') == 'DELIVERED': ent = 'entregue'
        sets = [f"criado_em = {sql(o['createdAt'])}::jsonb #>> '{{}}'", f"status_pagamento = '{st}'", f"status_entrega = '{ent}'"]
        if numero.isdigit(): sets.append(f'numero = {int(numero)}')
        if rast: sets.append(f"rastreio = {sql(rast)}::jsonb #>> '{{}}'")
        out.write(f"update loja_pedidos set {', '.join(sets)} where shopify_id = '{payload['shopify_id']}';\n")
        n += 1
    print(f'{n} pedidos…', file=sys.stderr)
    if not d['pageInfo']['hasNextPage']: break
    cur = d['pageInfo']['endCursor']

Q_CUP = '''query($c:String){ codeDiscountNodes(first:100, after:$c) { pageInfo{hasNextPage endCursor} nodes { id codeDiscount {
  ... on DiscountCodeBasic { title status startsAt endsAt usageLimit asyncUsageCount appliesOncePerCustomer codes(first:5){nodes{code}}
    minimumRequirement{ ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal{amount} } }
    customerGets{ value{ ... on DiscountPercentage{percentage} ... on DiscountAmount{ amount{amount} } } } }
  ... on DiscountCodeFreeShipping { title status startsAt endsAt usageLimit asyncUsageCount appliesOncePerCustomer codes(first:5){nodes{code}} } } } } }'''
k, cur = 0, None
while True:
    d = gql(Q_CUP, {'c': cur})['codeDiscountNodes']
    for nd in d['nodes']:
        cd = nd.get('codeDiscount') or {}
        if not cd.get('codes'): continue
        val = ((cd.get('customerGets') or {}).get('value') or {})
        tipo = 'frete' if 'customerGets' not in cd else ('percentual' if 'percentage' in val else 'fixo')
        valor = round(val['percentage'] * 100, 2) if 'percentage' in val else float((val.get('amount') or {}).get('amount') or 0)
        minimo = (((cd.get('minimumRequirement') or {}).get('greaterThanOrEqualToSubtotal')) or {}).get('amount')
        for code in cd['codes']['nodes']:
            r = {'id': 'shopify-' + nd['id'].split('/')[-1] + '-' + code['code'], 'codigo': code['code'].upper(), 'descricao': cd.get('title'), 'tipo': tipo, 'valor': valor,
                 'minimo': float(minimo) if minimo else None, 'inicio': cd.get('startsAt'), 'fim': cd.get('endsAt'), 'limite': cd.get('usageLimit'),
                 'uso_por_cliente': cd.get('appliesOncePerCustomer'), 'ativo': cd.get('status') == 'ACTIVE'}
            out.write(f"select loja_gravar('cupons', {sql(r)}::jsonb);\nupdate loja_cupons set usos = {int(cd.get('asyncUsageCount') or 0)} where id = {sql(r['id'])}::jsonb #>> '{{}}';\n")
            k += 1
    if not d['pageInfo']['hasNextPage']: break
    cur = d['pageInfo']['endCursor']
out.write("select setval('loja_pedido_numero', greatest((select coalesce(max(numero), 0) from loja_pedidos), 50000));\ncommit;\n")
out.close()
print(f'ok: {n} pedidos e {k} cupons em {a.saida}', file=sys.stderr)
