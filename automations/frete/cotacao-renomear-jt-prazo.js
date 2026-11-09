// No "Renomear JT" do workflow "Envia.com — Cotacao de Frete" (lszlpy1Pl4dnHW2w), POST /webhook/frete-cotacao
// (checkout e Serena), depois do "Normalizar Opcoes + Regra Gratis".
// Renomeia o servico do J&T para 'J&T Express' (Envia devolve 'J&T STANDART')
// + REGRA DE EXIBICAO (jul/2026): soma 2 dias ao prazo vindo da API (eta_aprox=true).
// + HORARIO DE CORTE (09/11/2026, Jaderson): pedido em dia util ate 12h (Brasilia) e postado no mesmo dia; depois das
//   12h, ou em fim de semana/feriado, e postado no proximo dia util. O prazo da transportadora conta a partir da
//   postagem, entao depois do corte o prazo ganha +1 dia util. Cada opcao leva tambem a data estimada de entrega
//   (entrega_ate, contando so dias uteis: sem sabado, domingo e feriado nacional).
// Frete Gratis (eta_aprox=false, prazo interno 10-15 dias) permanece como esta no texto; ganha so a data estimada.
// ATENCAO (set/2026): este no REORDENA no fim. Se o aviso de greve estiver ativo,
// a transportadora precisa continuar no topo — senao a ordem definida no no anterior
// ("Normalizar Opcoes") seria desfeita aqui.
const j = ($input.first() && $input.first().json) ? $input.first().json : {};

// ---------- dias uteis (sem fim de semana e sem feriado nacional) ----------
const DIA_MS = 86400000;
function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}
const _feriados = {};
function ehFeriado(t) {
  const y = new Date(t).getUTCFullYear();
  if (!_feriados[y]) {
    const p = pascoa(y);
    const lista = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((s) => Date.UTC(y, +s.slice(0, 2) - 1, +s.slice(3)));
    lista.push(p - 48 * DIA_MS, p - 47 * DIA_MS, p - 2 * DIA_MS, p + 60 * DIA_MS);
    _feriados[y] = new Set(lista);
  }
  return _feriados[y].has(t);
}
const diaUtil = (t) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6 && !ehFeriado(t); };
function somarDiasUteis(t, n) { let k = 0; while (k < n) { t += DIA_MS; if (diaUtil(t)) k++; } while (!diaUtil(t)) t += DIA_MS; return t; }

// ---------- horario de corte (12h, Brasilia) ----------
const HORA_CORTE = 12;
const agoraBR = new Date(Date.now() - 3 * 3600000);          // Brasilia (UTC-3, sem horario de verao)
const hojeBR = Date.UTC(agoraBR.getUTCFullYear(), agoraBR.getUTCMonth(), agoraBR.getUTCDate());
const antesDoCorte = diaUtil(hojeBR) && agoraBR.getUTCHours() < HORA_CORTE;
const postagem = antesDoCorte ? hojeBR : somarDiasUteis(hojeBR, 1);
const extraCorte = antesDoCorte ? 0 : 1;
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dataTxt = (t) => { const d = new Date(t); return SEM[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

function somarDias(eta, n) {
  let t = String(eta || '');
  if (!t || !n) return t;
  if (/mesmo dia/i.test(t)) return n === 1 ? '1 dia útil' : (n + ' dias úteis');
  t = t.replace(/\d+/g, function(x){ return String(parseInt(x, 10) + n); });
  t = t.replace(/(\d+)\s*dia útil\b/gi, function(m0, x){ return parseInt(x, 10) === 1 ? m0 : (x + ' dias úteis'); });
  return t;
}

const greveAtiva = !!(j && j.aviso && j.aviso.tipo === 'greve_correios');
const ehCorreios = o => /correios|sedex|pac/i.test(String((o && o.carrier) || '') + ' ' + String((o && o.service) || ''));
// Durante a greve sobe so a TRANSPORTADORA de verdade (paga, nao Correios).
// O Frete Gratis sai pelos Correios, entao segue no grupo de baixo, ordenado por prazo
// — se subisse junto, o cliente escolheria "rapido" algo que tambem pode atrasar.
const prioridade = o => ((!ehCorreios(o) && Number(o && o.price) > 0) ? 0 : 1);

if (j && Array.isArray(j.options)) {
  j.options.forEach(function(o){
    if (!o) return;
    if (/jt/i.test(String(o.carrier || ''))) { o.service = 'J&T Express'; }
    if (o.eta_aprox === true) {
      const soma = 2 + extraCorte;
      o.eta = somarDias(o.eta, soma);
      if (typeof o.eta_dias === 'number' && o.eta_dias < 999) o.eta_dias = o.eta_dias + soma;
      // eta_dias ja conta a partir de hoje (corte incluido): entrega = hoje + eta_dias dias uteis
      if (typeof o.eta_dias === 'number' && o.eta_dias < 999) { const t = somarDiasUteis(hojeBR, o.eta_dias); o.entrega_ate = new Date(t).toISOString().slice(0, 10); o.entrega_ate_txt = dataTxt(t); }
    } else if (typeof o.eta_dias === 'number' && o.eta_dias < 999) {
      // Frete Gratis: prazo interno conta da postagem
      const t = somarDiasUteis(postagem, o.eta_dias); o.entrega_ate = new Date(t).toISOString().slice(0, 10); o.entrega_ate_txt = dataTxt(t);
    }
  });
  if (greveAtiva) {
    j.options.sort(function(a, b){
      return (prioridade(a) - prioridade(b)) || (a.eta_dias - b.eta_dias) || (a.price - b.price);
    });
  } else {
    j.options.sort(function(a, b){ return (a.eta_dias - b.eta_dias) || (a.price - b.price); });
  }
  j.postagem = new Date(postagem).toISOString().slice(0, 10);
  j.postagem_txt = (antesDoCorte ? 'hoje' : dataTxt(postagem)) + (antesDoCorte ? ' (pedido até 12h)' : ' (pedido depois das 12h ou fora de dia útil)');
  j.corte_12h = { antes_do_corte: antesDoCorte, dias_extra: extraCorte };
}
return [{ json: j }];
