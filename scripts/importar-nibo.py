#!/usr/bin/env python3
"""
Exporta os dados de uma organização do Nibo para o formato de importação do
Financeiro (Configurações → Dados → Importar arquivo do Nibo).

Uso (Mac):
  python3 scripts/importar-nibo.py --token SEU_APITOKEN --saida nibo.json
  python3 scripts/importar-nibo.py --token SEU_APITOKEN --desde 2025-01-01 --saida nibo.json

Onde pegar o token: Nibo → Configurações → Integrações → API (apitoken).
Só usa a biblioteca padrão do Python 3.
"""
import argparse, json, sys, urllib.request, urllib.parse, datetime

BASE = 'https://api.nibo.com.br/empresas/v1/'
BANCOS = {77: 'inter', 208: 'btg', 197: 'stone', 341: 'itau', 237: 'bradesco', 33: 'santander', 1: 'bb', 104: 'caixa', 260: 'nubank', 336: 'c6', 756: 'sicoob', 748: 'sicredi', 422: 'safra', 102: 'xp', 218: 'bs2', 212: 'original', 735: 'neon', 403: 'cora', 323: 'mercadopago', 290: 'pagbank', 380: 'picpay', 461: 'asaas', 364: 'efi', 655: 'bv', 623: 'pan'}
GRUPOS = {'1': 1, '2': 2, '3': 3, '4': 4, '5': 5}

def get(token, path, params=None):
    params = dict(params or {}); params['apitoken'] = token
    url = BASE + path + ('&' if '?' in path else '?') + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def lista(token, path, orderby=None, filtro=None, top=500):
    out, skip = [], 0
    while True:
        p = {'$top': top, '$skip': skip}
        if orderby: p['$orderby'] = orderby
        if filtro: p['$filter'] = filtro
        try:
            j = get(token, path, p)
        except urllib.error.HTTPError as e:
            if e.code == 404: return out
            raise
        items = j.get('items', j if isinstance(j, list) else [])
        out.extend(items)
        sys.stderr.write(f'  {path}: {len(out)}\r')
        if len(items) < top: break
        skip += top
    sys.stderr.write('\n')
    return out

def banco_de(acc):
    n = acc.get('bankNumber'); nome = (acc.get('bankName') or '') + ' ' + (acc.get('name') or '')
    nl = nome.lower()
    if 'pagar' in nl: return 'pagarme', 'gateway'
    if 'clara' in nl: return 'clara', 'cartao'
    if 'caixinha' in nl or 'caixa ]' in nl or '[ caixa' in nl: return 'caixinha', 'caixa'
    if 'stone' in nl: return 'stone', 'corrente'
    if 'mercado pago' in nl: return 'mercadopago', 'gateway'
    if 'infinite' in nl: return 'infinitepay', 'gateway'
    if 'cart' in nl and 'cartão' in nl: return 'cartao', 'cartao'
    if n in BANCOS: return BANCOS[n], 'corrente'
    return 'outro', 'corrente'

def tipo_contato(x):
    t = x.get('type', '')
    return {'Customer': 'cliente', 'Supplier': 'fornecedor', 'Partner': 'socio', 'Employee': 'funcionario'}.get(t, 'fornecedor')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--token', required=True)
    ap.add_argument('--saida', default='nibo.json')
    ap.add_argument('--desde', default=None, help='só lançamentos com vencimento >= AAAA-MM-DD')
    a = ap.parse_args()
    T = a.token
    org = get(T, 'organizations')
    orgs = org.get('items', [org]) if isinstance(org, dict) else org
    sys.stderr.write(f'Organização: {orgs[0].get("name") if orgs else "?"}\n')

    contas = []
    for acc in lista(T, 'accounts'):
        banco, tipo = banco_de(acc)
        contas.append({'nibo_id': acc['id'], 'nome': acc.get('name'), 'banco': banco, 'tipo': tipo, 'agencia': acc.get('bankAgency') or '', 'numero': (acc.get('bankAccount') or '') + (('-' + str(acc.get('bankAccountVerificationNumberString'))) if acc.get('bankAccountVerificationNumberString') else ''), 'saldo_inicial': acc.get('openBalance') or 0, 'data_saldo_inicial': (acc.get('dateOfOpenBalance') or '')[:10] or None, 'arquivada': bool(acc.get('isArchived'))})

    categorias = []
    for c in lista(T, 'categories', orderby='name'):
        g = c.get('group') or {}
        categorias.append({'nibo_id': c['id'], 'nome': c.get('name'), 'tipo': c.get('type') or 'out', 'grupo': GRUPOS.get(str(g.get('referenceCode', '')), 1 if c.get('type') == 'in' else 3), 'subgrupo': c.get('subgroupName') or '', 'codigo': c.get('referenceCode') or ''})

    centros = [{'nibo_id': c['costCenterId'], 'nome': c.get('description')} for c in lista(T, 'costcenters')]

    contatos = []
    for path in ('customers', 'suppliers', 'partners', 'employees'):
        for x in lista(T, path, orderby='name'):
            if x.get('isDeleted'): continue
            doc = (x.get('document') or {}).get('number') or x.get('cpfCnpj') or ''
            addr = x.get('address') or {}
            contatos.append({'nibo_id': x['id'], 'nome': (x.get('name') or '').strip(), 'tipo': tipo_contato(x), 'documento': doc, 'email': (x.get('email') or (x.get('communication') or {}).get('email') or '').lower(), 'telefone': (x.get('communication') or {}).get('phone') or '', 'cidade': addr.get('city') or '', 'uf': addr.get('state') or '', 'arquivado': bool(x.get('isArchived'))})
    # dedup por nome (Nibo permite o mesmo nome em cliente e fornecedor)
    vistos = {}
    for c in contatos:
        k = c['nome'].lower()
        if k in vistos:
            if vistos[k]['tipo'] != c['tipo']: vistos[k]['tipo'] = 'ambos'
            vistos[k].setdefault('outros_ids', []).append(c['nibo_id'])
        else: vistos[k] = c
    contatos = list(vistos.values())
    alias = {}
    for c in contatos:
        for o in c.get('outros_ids', []): alias[o] = c['nibo_id']

    filtro = f'dueDate ge {a.desde}' if a.desde else None
    debitos = lista(T, 'schedules/debit', orderby='dueDate', filtro=filtro)
    creditos = lista(T, 'schedules/credit', orderby='dueDate', filtro=filtro)

    # entradas realizadas (pagamentos) — usadas pra descobrir data e conta das baixas
    entries = []
    try:
        entries = lista(T, 'entries', orderby='date', filtro=(f'date ge {a.desde}' if a.desde else None))
    except Exception as e:
        sys.stderr.write(f'  (sem acesso a /entries: {e}; baixas usarão a data de vencimento)\n')
    por_schedule = {}
    for e in entries:
        sid = e.get('scheduleId') or (e.get('schedule') or {}).get('id')
        if sid: por_schedule.setdefault(sid, []).append(e)

    lancs = []
    for tipo, arr in (('pagar', debitos), ('receber', creditos)):
        for s in arr:
            sid = s.get('scheduleId') or s.get('id')
            valor = abs(float(s.get('value') or 0))
            venc = (s.get('dueDate') or '')[:10]
            comp = (s.get('accrualDate') or s.get('dueDate') or '')[:10]
            st = s.get('stakeholder') or {}
            rate = [{'categoria_nibo_id': c.get('categoryId'), 'valor': abs(float(c.get('value') or 0)), 'descricao': c.get('description') or ''} for c in (s.get('categories') or [])]
            cc = [{'centro_nibo_id': c.get('costCenterId'), 'percent': c.get('percent') or 100} for c in (s.get('costCenters') or [])]
            baixas = []
            ents = por_schedule.get(sid, [])
            if ents:
                for e in ents:
                    acc = e.get('account') or {}
                    baixas.append({'data': (e.get('date') or venc)[:10], 'valor': abs(float(e.get('value') or 0)), 'conta_nibo_id': acc.get('id') or e.get('accountId')})
            elif s.get('isPaid') or abs(float(s.get('paidValue') or 0)) > 0:
                baixas.append({'data': venc, 'valor': abs(float(s.get('paidValue') or valor)), 'conta_nibo_id': None})
            desc = (s.get('description') or '').strip() or ((s.get('category') or {}).get('name') or 'Lançamento Nibo')
            parc = None
            import re
            m = re.search(r'(\d+)\s*/\s*(\d+)\s*$', desc)
            if m: parc = (int(m.group(1)), int(m.group(2)))
            lancs.append({'nibo_id': sid, 'tipo': tipo, 'descricao': desc, 'valor': valor, 'vencimento': venc, 'competencia': comp[:7] + '-01' if comp else None,
                          'categoria_nibo_id': (s.get('category') or {}).get('id'), 'contato_nibo_id': alias.get(st.get('id'), st.get('id')), 'conta_nibo_id': (ents[0].get('account') or {}).get('id') if ents else None,
                          'rateio_categorias': rate if len(rate) > 1 else [], 'rateio_centros': cc, 'referencia': s.get('reference') or '', 'observacoes': '',
                          'parcela_num': parc[0] if parc else None, 'parcela_total': parc[1] if parc else None, 'grupo_parcelas_id': s.get('installmentId') if parc else None,
                          'baixas': baixas, 'criado_em': s.get('createDate')})
    # entradas sem agendamento (lançamentos diretos no extrato do Nibo) viram lançamentos pagos
    ids_sched = {l['nibo_id'] for l in lancs}
    for e in entries:
        sid = e.get('scheduleId') or (e.get('schedule') or {}).get('id')
        if sid and sid in ids_sched: continue
        if e.get('isTransfer') or e.get('transferId'): continue
        v = float(e.get('value') or 0)
        if not v: continue
        acc = e.get('account') or {}
        lancs.append({'nibo_id': 'entry:' + str(e.get('entryId') or e.get('id')), 'tipo': 'receber' if v > 0 else 'pagar', 'descricao': (e.get('description') or 'Lançamento Nibo').strip(), 'valor': abs(v), 'vencimento': (e.get('date') or '')[:10], 'competencia': (e.get('date') or '')[:7] + '-01',
                      'categoria_nibo_id': (e.get('category') or {}).get('id'), 'contato_nibo_id': alias.get((e.get('stakeholder') or {}).get('id'), (e.get('stakeholder') or {}).get('id')), 'conta_nibo_id': acc.get('id'), 'rateio_categorias': [], 'rateio_centros': [], 'referencia': '', 'observacoes': '',
                      'baixas': [{'data': (e.get('date') or '')[:10], 'valor': abs(v), 'conta_nibo_id': acc.get('id')}], 'criado_em': e.get('createDate')})

    saida = {'gerado_em': datetime.datetime.now().isoformat(), 'origem': 'nibo', 'empresa': (orgs[0].get('name') if orgs else ''), 'contas': contas, 'categorias': categorias, 'centros': centros, 'contatos': contatos, 'lancamentos': lancs}
    with open(a.saida, 'w', encoding='utf-8') as f: json.dump(saida, f, ensure_ascii=False, indent=1)
    sys.stderr.write(f'OK → {a.saida}: {len(contas)} contas, {len(categorias)} categorias, {len(centros)} centros, {len(contatos)} contatos, {len(lancs)} lançamentos\n')

if __name__ == '__main__':
    main()
