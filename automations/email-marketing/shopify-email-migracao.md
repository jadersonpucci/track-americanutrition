# Migração Klaviyo → Shopify Email (04/11/2026)

**Situação:** os 9 fluxos do Klaviyo estão **pausados** (rascunho, nada apagado). O HTML original de cada e-mail está em
`klaviyo-export/`. A automação que mandava carrinho abandonado para o Klaviyo foi desligada, e a de cobrança falhada da
assinatura deixou de chamar o Klaviyo (o WhatsApp continua).

**Onde montar:** Shopify Admin → **Marketing → Automações → Criar automação**. Em cada automação: escolha o modelo indicado
(ou "Criar personalizada"), troque o conteúdo de cada e-mail pelo texto abaixo e ajuste as esperas.

- No Shopify Email o nome da cliente é `{{ customer.first_name }}`.
- Cor principal: azul `#07388E`; destaque: vermelho `#AD0404`; botão WhatsApp: verde `#25D366`.
- Todo e-mail termina com o rodapé padrão:
  > **Dúvidas? Fale com a Serena** — disponível 24h · [💬 Falar com a Serena](https://wa.me/16462068419)
  > Este produto não é um medicamento.

---

## 1. Boas-vindas (quem se inscreve na lista)

**Modelo:** "Boas-vindas a novos assinantes" · **Gatilho:** cliente se inscreveu no e-mail marketing
**Cupom:** `IMUNOFOSFO` (10%, uma vez por cliente, já ativo na loja). Link com o cupom aplicado:
`https://americanutrition.com/discount/IMUNOFOSFO?redirect=/products/imunofosfo`

### E-mail 1.1 · imediato
- **Assunto:** {{ customer.first_name }}, seu cupom de 10% OFF chegou 🎁
- **Prévia:** Código exclusivo dentro. O desconto aplica sozinho no clique.
- **Título:** Seu cupom de 10% OFF chegou
- **Texto:** Olá, {{ customer.first_name }}! 👋 Bem-vindo(a) à America Nutrition, a plataforma completa de saúde celular. Como prometido, aqui está o seu cupom de primeiro pedido:
- **Destaque:** `IMUNOFOSFO` · 10% OFF no seu primeiro pedido
- **Botão:** Usar meu cupom agora → link do cupom acima
- **Onde usar:** ImunoFosfo (fosfoetanolamina 650mg, versões Cápsulas, Vegano, Liquid, Kids e Healing) · Ômega 3 MEG-3 · Própolis Verde Premium · Vitamina D3 K2 A (também 50.000 UI)
- **Depoimento:** ★★★★★ "Comecei pelo ImunoFosfo e acabei descobrindo toda a linha. Hoje uso o Ômega 3 e o Própolis junto. Nunca me senti tão bem." — Carlos M.
- **Fecho:** Dúvida sobre qual produto escolher? Nossa equipe te orienta pelo WhatsApp.

### E-mail 1.2 · esperar 1 hora
- **Assunto:** {{ customer.first_name }}, você foi convidado(a) para a nossa comunidade
- **Prévia:** WhatsApp, Facebook ou Telegram: escolha seu canal. Suporte real, relatos reais, todo dia.
- **Título:** Faça parte da comunidade America Nutrition
- **Texto:** Fazer parte da America Nutrition vai além de receber um produto. É entrar em uma comunidade de pessoas que decidiram levar a saúde celular a sério, e que se apoiam nessa jornada todos os dias. Nos grupos você encontra relatos reais de quem está no protocolo, dicas de uso, novidades da linha e acesso direto à nossa equipe.
- **Lista:** Relatos reais de clientes no protocolo · Dicas de uso e dúvidas com a equipe · Novidades, lançamentos e ofertas para membros · Acesso direto à equipe pelo WhatsApp, sem robô
- **Botões:** WhatsApp → `https://grupo.americanutrition.com` · Facebook → `https://www.facebook.com/groups/fosfoetanolamina` · Telegram → `https://t.me/imunofosfo`
- **Depoimento:** ★★★★★ "Entrei no grupo do WhatsApp e foi um divisor de águas. Ver outras pessoas no protocolo e receber resposta rápida da equipe me deu confiança para continuar." — Roberta L.

### E-mail 1.3 · esperar 1 dia
- **Assunto:** {{ customer.first_name }}, sabe como o ImunoFosfo age no seu organismo?
- **Prévia:** Modulação imunológica, comunicação celular, ação anti-inflamatória e suporte metabólico.
- **Título:** Como o ImunoFosfo age
- **Texto:** O ImunoFosfo é baseado em fosfoetanolamina sintética bioidêntica, uma molécula que age diretamente no metabolismo celular. Diferente de suplementos convencionais, ele não trata sintomas: age na origem.
- **Os 4 pilares:** Modulação imunológica (regula sem superestimular) · Comunicação celular · Ação anti-inflamatória sistêmica · Suporte metabólico celular
- **Citação:** "O ImunoFosfo não aumenta nem fortalece a imunidade. Ele promove o equilíbrio dela, e isso muda tudo."
- **Protocolo:** 650mg por cápsula · Fase de choque: 6 cáps/dia por 7 dias · Manutenção: 3 cáps/dia · Preventivo: 2 cáps/dia · sempre com no mínimo 3h entre doses
- **Depoimento:** ★★★★★ "Fiz muita pesquisa antes de comprar. O que me convenceu foi entender como a molécula funciona." — Ana Paula R.
- **Botão:** Garantir meu ImunoFosfo → `https://americanutrition.com/products/imunofosfo`

### E-mail 1.4 · esperar 1 dia
- **Assunto:** {{ customer.first_name }}, os resultados falam por si mesmos
- **Prévia:** Depoimentos verificados de quem seguiu o protocolo. Avalie e ganhe 5% na próxima compra.
- **Título:** Quem usa o ImunoFosfo conta a própria história
- **Texto:** Nada convence mais do que a experiência de quem já passou pelo processo. Cada organismo responde no seu tempo; o que une esses relatos é a consistência no protocolo.
- **Depoimentos:** "Em 3 semanas já senti diferença na disposição diária." — Roberto F. · "Uso há 4 meses e não pretendo parar. Me sinto muito mais equilibrada." — Cláudia M. · "Estava com desconfiança total. Após 21 dias no protocolo de choque, os resultados apareceram." — Juliana C.
- **Botões:** Ver depoimentos → `https://americanutrition.com/pages/depoimentos` · Garantir meu ImunoFosfo → `https://americanutrition.com/products/imunofosfo`

---

## 2. Pós-compra (jornada da cliente)

**Modelo:** "Agradecer clientes após a primeira compra" (ou personalizada com gatilho **Pedido criado**) · **Condição:** somente pedidos pagos.
O e-mail "Pedido confirmado" do Klaviyo **não** entra: a Shopify já manda a confirmação do pedido e a de envio.

### E-mail 2.1 · esperar 2 dias
- **Assunto:** Leia antes de abrir seu produto 📋
- **Prévia:** O jeito certo de usar faz toda a diferença. Preparamos tudo para você começar bem.
- **Título:** Leia antes de abrir seu produto
- **Texto:** Olá, {{ customer.first_name }}! Seu produto está chegando, e o modo certo de usar faz toda a diferença nos resultados.
- **Fases:** 🔴 Choque (primeiros 7 dias): dose intensiva, mínimo 3h entre doses · 🔵 Manutenção (a partir do 8º dia): uso diário contínuo · 🟢 Preventivo (longo prazo): dose reduzida
- **Importante:** As doses variam conforme o produto. Fale com a Serena para receber o protocolo exato do seu produto, de graça, 24h.
- **Botão:** 🧬 Receber meu protocolo personalizado → `https://wa.me/16462068419`

### E-mail 2.2 · esperar 2 dias
- **Assunto:** 🧬 {{ customer.first_name }}, você foi convidado(a) para a nossa comunidade
- **Prévia:** WhatsApp, Facebook ou Telegram: conteúdo, suporte e novidades em primeira mão.
- **Título:** Faça parte da nossa comunidade oficial
- **Texto:** Você agora é parte da família America Nutrition, e todo membro merece acesso à nossa comunidade exclusiva: conteúdo educativo, suporte e troca com quem já está na jornada, ofertas e lançamentos antecipados e benefícios para membros ativos.
- **Botões:** WhatsApp → `https://grupo.americanutrition.com` · Facebook → `https://www.facebook.com/groups/fosfoetanolamina` · Telegram → `https://t.me/imunofosfo`
- **Fecho:** Você não está sozinho(a) nessa jornada. 🧬 Gratuito e exclusivo para clientes.

### E-mail 2.3 · esperar 4 dias
- **Assunto:** Ela quase desistiu no décimo dia, {{ customer.first_name }}
- **Prévia:** Uma história real que pode mudar como você encara os primeiros dias de uso.
- **Título:** Ela quase desistiu no décimo dia. Não desistiu.
- **Texto:** Carla tinha 54 anos quando comprou seu primeiro frasco. Nos primeiros dias, nada. Na segunda semana, ficou em dúvida. No décimo dia, quase parou. Foi quando falou com a Serena, entendeu que a fase de adaptação é normal e decidiu continuar. Hoje, no quarto frasco, ela mesma conta a história para quem está começando.
- **Citação:** "Quase parei no décimo dia porque achei que não estava funcionando. A Serena me explicou que isso era normal, que o corpo precisa de tempo para se adaptar. No final do segundo mês, as pessoas ao meu redor perceberam antes de mim." — Carla M., São Paulo
- **Lição:** A fase de adaptação é real e normal. Se surgir dúvida nos primeiros dias, não decida sozinho(a).
- **Botão:** 💬 Falar com a Serena agora → `https://wa.me/16462068419`

### E-mail 2.4 · esperar 4 dias
- **Assunto:** O complemento que nossos clientes mais usam com o ImunoFosfo
- **Prévia:** Ômega 3 MEG-3 de alta pureza, com EPA e DHA para o cuidado diário 🧬
- **Título:** O combo que nossos clientes mais recomendam
- **Texto:** Agora que seu protocolo começou, queremos te apresentar o complemento que os clientes mais experientes já descobriram: o Ômega 3 MEG-3. Com EPA e DHA de alta pureza, ele cria o ambiente celular ideal para o ImunoFosfo atuar com ainda mais eficiência.
- **Lista:** Ação anti-inflamatória que complementa o ImunoFosfo · Saúde cardiovascular, cerebral e articular · MEG-3 certificado · 2 cápsulas/dia com as refeições · Frete grátis acima de R$ 250
- **Depoimento:** "Comecei só com o ImunoFosfo. Depois adicionei o Ômega 3 e a diferença foi notável." — Beatriz M.
- **Botões:** Adicionar Ômega 3 → `https://seguro.americanutrition.com/WggSccM` · Saber mais → `https://americanutrition.com/products/omega-3-meg3`

### E-mail 2.5 · esperar 6 dias
- **Assunto:** ⭐ {{ customer.first_name }}, como está sendo sua experiência?
- **Prévia:** Sua avaliação ajuda outras pessoas e ainda garante um mimo exclusivo para você.
- **Título:** Sua opinião transforma a jornada de alguém 🎁
- **Texto:** Você já tem cerca de 2 semanas de uso real. Sua avaliação é muito mais do que uma nota: ajuda outras pessoas que procuram exatamente o que você encontrou.
- **Presente:** Ao avaliar, você recebe 5% de desconto na próxima compra, válido por 30 dias.
- **Botão:** ⭐ Deixar minha avaliação agora → `https://seguro.americanutrition.com/avaliar`

### E-mail 2.6 · esperar 15 dias
- **Assunto:** 🏆 Olha até onde você chegou, {{ customer.first_name }}
- **Prévia:** 4 semanas de protocolo contínuo. E o melhor ainda está por vir.
- **Título:** Olha até onde você chegou 🏆
- **Texto:** 4 semanas de protocolo contínuo. A maioria das pessoas desiste antes disso. Você não. A fase de adaptação ficou para trás, e os resultados mais consistentes aparecem a partir do segundo mês de uso contínuo.
- **Linha do tempo:** Semana 1: fase de choque · Semanas 2 e 3: adaptação celular · Semana 4: equilíbrio em andamento
- **Citação:** "No segundo mês foi onde realmente senti a diferença. Vale muito a pena não desistir no começo." — cliente há 4 meses
- **Botão:** 💬 Falar com a Serena → `https://wa.me/16462068419`

---

## 3. Recompra do ImunoFosfo

**Modelo:** personalizada · **Gatilho:** Pedido criado (pago) · **Esperar:** 22 dias · **Condição:** a cliente não fez outro pedido depois desse.

### E-mail 3.1
- **Assunto:** ⚠️ {{ customer.first_name }}, seu ImunoFosfo pode estar acabando
- **Prévia:** Interromper o protocolo agora pode atrasar o que você já conquistou. Renove em 1 minuto.
- **Título:** Não perca o ritmo que você construiu
- **Texto:** Faz algumas semanas que você está investindo na sua saúde, e isso merece parabéns. A consistência é o segredo dos melhores resultados: interromper o protocolo agora significa dar um passo atrás.
- **Destaque:** 📦 Se você está na manutenção com o frasco de 90 cápsulas (3 por dia), seu estoque está chegando ao fim. Não espere acabar.
- **Botão:** 🛒 Renovar meu estoque agora → `https://americanutrition.com/products/imunofosfo`

---

## 4. Navegação abandonada

**Modelo:** "Recuperar navegação abandonada" (já vem com o bloco do produto visto).

### E-mail 4.1 · esperar 2 horas
- **Assunto:** O que faz você se sentir equilibrado?
- **Prévia:** Você visitou e foi embora. Mas algumas decisões valem a pena ser retomadas.
- **Título:** {{ customer.first_name }}, ainda está pensando nisso?
- **Texto:** Você visitou um produto e foi embora sem levar. Acontece. Decisão de saúde nunca é por impulso, e está certo que seja assim. Mas o organismo não espera o momento perfeito: o cuidado que começa hoje já faz diferença amanhã.
- **Lista:** Alta pureza, tecnologia americana · Avaliações verificadas no Judge.me · Frete grátis acima de R$ 250 · Dúvidas? A Serena responde em minutos, 24h
- **Botões:** Ver o produto (bloco de produto) · Tirar uma dúvida → `https://wa.me/16462068419`

---

## 5. Cliente VIP

**Como fazer:** crie o segmento de clientes VIP (sugestão: `number_of_orders >= 3`) e, em **Shopify Flow**, use o gatilho
**"Cliente entrou no segmento"** → ação **"Enviar e-mail de marketing"** com o e-mail abaixo.
**Cupom:** `VIP_AN` (já ativo; link `https://www.americanutrition.com/discount/VIP_AN`).

### E-mail 5.1
- **Assunto:** 👑 Você é VIP, {{ customer.first_name }}: sua recompensa exclusiva chegou
- **Prévia:** Você faz parte de um grupo seleto. Preparamos um cupom exclusivo de 15% para você.
- **Título:** Você merece esse tratamento especial
- **Texto:** Você faz parte de um grupo seleto: pessoas que não apenas compraram, mas se comprometeram com a própria saúde.
- **Destaque:** `VIP_AN` · 15% de desconto em qualquer produto
- **Botão:** 🛒 Usar meu cupom VIP agora → link do cupom

---

## O que não migra (e por quê)

| Fluxo do Klaviyo | Situação |
|---|---|
| Carrinho adicionado / checkout abandonado | Pausados. A Shopify não vê o nosso checkout; fica para a próxima etapa. A recuperação pelo WhatsApp continua. |
| Assinatura ativada / cobrança falhou | Pausados. Dependem de eventos do nosso sistema, que a Shopify não recebe. O WhatsApp já avisa nos dois casos. |
| Pedido confirmado (1º e-mail do pós-compra) | Não precisa: a Shopify já envia. |

## Depois de ativar tudo na Shopify

1. Mandar um e-mail de teste de cada automação.
2. No Klaviyo, cancelar o plano em **Configurações → Billing**. Antes disso, exportar a lista de inscritos
   (Audience → Lists & Segments → exportar CSV) para guardar o histórico de consentimento.

## 04/11/2026: Klaviyo desligado do site

No tema publicado (155877212332), o app embed **Klaviyo onsite** (pop-ups de inscrição e rastreamento) foi desligado em
`config/settings_data.json` (bloco `855628211100114053`, `disabled: true`). Backup do arquivo anterior no scratchpad da
sessão. Site e checkout conferidos: nenhuma chamada ao Klaviyo.

## Visual igual ao do Klaviyo: bloco "Custom Liquid"

Os blocos padrão do Shopify Email deixam o e-mail com outra cara. Para manter o visual do Klaviyo, cada e-mail tem a
versão pronta em `shopify-custom-liquid/` (mesmo HTML do Klaviyo, com `{{ customer.first_name }}`, o cupom IMUNOFOSFO
e as imagens já nos Arquivos da Shopify, sem nenhuma variável do Klaviyo):

| E-mail | Arquivo |
|---|---|
| 1.1 a 1.4 Boas-vindas | `1.1-boas-vindas-cupom.html` … `1.4-boas-vindas-depoimentos.html` |
| 2.1 a 2.6 Pós-compra | `2.1-pos-compra-guia-de-uso.html` … `2.6-pos-compra-4-semanas.html` |
| 3.1 Recompra | `3.1-recompra-imunofosfo.html` |
| 4.1 Navegação abandonada | `4.1-navegacao-abandonada.html` (aponta para o ImunoFosfo) |
| 5.1 VIP | `5.1-cliente-vip.html` |

Em cada e-mail da automação: apagar as seções padrão do modelo, adicionar a seção **Custom Liquid** (Liquid
personalizado), colar o conteúdo inteiro do arquivo, e preencher assunto e prévia conforme as seções acima. O rodapé de
descadastro a Shopify adiciona sozinha.

## 04/11/2026 (noite): migração suspensa, Klaviyo de volta

Sem API para controlar as automações do Shopify Email, o Jaderson decidiu manter o Klaviyo por enquanto.
Revertido: os 9 fluxos voltaram a `live` (workflow n8n `7KnxBKb4iY2ch05q`, lista fixa de IDs), o app embed do Klaviyo
voltou a ficar ligado no tema, o "AN Klaviyo Carrinho Abandonado" foi republicado e o nó "Evento Klaviyo Falha" do
Dunning foi religado. As automações do Shopify Email devem ficar desativadas no painel. O export e os e-mails em
Custom Liquid continuam aqui para uma migração futura (próprio sistema via n8n + Amazon SES).
