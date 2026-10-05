# KOMBINEI — Estado do Projeto
> Última atualização: 2026-10-04 (cadastro de Máquinas + custos automáticos no produto e no Cálculo Rápido)
> Usar este arquivo para iniciar nova sessão de desenvolvimento.
> ⚠️ Sempre que este projeto for alterado (código, infra, deploy), atualizar este arquivo no mesmo
> momento — ver nota no fim da seção 2 e da seção 9.

---

## 1. Visão Geral

Sistema SaaS multi-tenant de gestão para empresas de impressão 3D. Funcionalidades:
- Cadastro e **precificação de produtos 3D com receita** (insumos + subprodutos)
- Cadastro de **Pessoas** (clientes e fornecedores) e de **Insumos**
- Criação e listagem de orçamentos (com frete e prazo de entrega)
- **Eventos/Feiras** — estoque designado por evento + PDV de balcão (`evento_venda.html`) + relatório
- **PDV PWA instalável** (`/pdv/`) — vender em eventos, **cadastrar produto** e **escanear código de barras** pelo celular
- **Código de barras** — leitura por câmera no cadastro (web + PWA) e na venda
- Dashboard de análise
- **Catálogo de HueForges** — correlação de cores: descobre quais artes (até 4 cores) são imprimíveis com a carga atual da impressora, sem trocar bobina
- **Importação de vendas da Shopee** (planilha `.xlsx/.csv`)
- **Máquinas** (Configurações → Minhas máquinas) — impressoras com dados de compra; calculam consumo, desgaste e manutenção dos produtos
- **Tela Início** (`inicio.html`) — saudação "Bom dia/Boa tarde/Boa noite, <nome>" + atalhos rápidos; é a página padrão ao abrir o sistema
- **Cálculo Rápido de impressão** (`calculo_rapido.html`, menu Ferramentas) — custo de uma peça a partir de tempo + peso (filamento, energia, bico, desgaste)
- Branding por empresa (logo + cores)
- Monitoramento de preços no Mercado Livre / frete Melhor Envio *(desligados por flag — ver §6)*

**Stack:** Firebase Hosting + Realtime Database + Auth + **Storage** + Cloud Functions Gen2 (Node.js 22 / Express) + Firestore. Front-end em HTML/JS puro (Firebase Web SDK v8, scripts globais).

---

## 2. Firebase / Infraestrutura

| Item | Valor |
|---|---|
| Projeto Firebase | `calculo3d` |
| Hosting URL | https://calculo3d.web.app |
| RTDB URL | https://calculo3d-default-rtdb.firebaseio.com |
| Storage bucket | `calculo3d.firebasestorage.app` (imagens de produto em `produtos/{id}_{nome}`) |
| Cloud Function | `monitorApiV2` em `us-central1` |
| Function URL | https://monitorapiv2-jq26cohg4q-uc.a.run.app |
| Firebase Hosting rewrite | `/api/**` → `monitorApiV2` |

**Firebase config (front-end):**
```js
const firebaseConfig = {
  apiKey:            "AIzaSyCkGTyw1o7_XGpnXF9-dFwXyCxRZyJOG4c",
  authDomain:        "calculo3d.firebaseapp.com",
  databaseURL:       "https://calculo3d-default-rtdb.firebaseio.com",
  projectId:         "calculo3d",
  storageBucket:     "calculo3d.firebasestorage.app",
  messagingSenderId: "372705279593",
  appId:             "1:372705279593:web:0b584c7a71dd3675a96cf8",
};
```

**Caminhos do projeto local (2 computadores):**
- Computador do Leonardo: `C:\Users\Leonardo\3DCalc\3Dcalc`
- Segundo computador (2026-08-19): `C:\Kombinei` — clonado de `git@github.com:lidiapanis/3Dcalc.git`
  (mesmo remoto), Firebase CLI logado como `leonardomonizbarros@gmail.com`, `functions/` com
  `npm install` já feito.

**Deploy:**
```powershell
firebase deploy --only hosting        # só front-end
firebase deploy --only functions      # só functions
firebase deploy --only hosting,functions,firestore:rules,database
```
Logado como `leonardomonizbarros@gmail.com`.

**2026-10-04 — Cadastro de Máquinas (`maquinas.js`) + custos automáticos:**
- **Configurações → Minhas máquinas** (`configuracoes.html`): lista + modal de cadastro. Campos em
  RTDB `empresas/{id}/maquinas/{pushId}`: `apelido` (nome genérico, obrigatório), `marca`,
  `modelo`, `tipo` (FDM/Resina/Laser/Outra), `numeroSerie`, `consumoW`, `vidaUtilHoras`,
  `custoManutencao` (R$/impressão — bico etc.), `valorCompra`, `dataAquisicao`, `notaFiscal`,
  `fornecedorId` (Pessoa fornecedor) **ou** `fornecedorNome` livre ("Outro"), `observacoes`,
  `padrao` (só uma por empresa), `ativa`, `dataCriacao`, `dataAtualizacao`. A 1ª máquina nasce padrão.
- Regras (fonte única `maquinas.js`): desgaste/h = valorCompra ÷ vidaUtilHoras; outros custos/peça
  = custoManutencao + horas × desgaste/h; consumo = consumoW × 1,2 se PETG/ABS/ASA.
- **Produto (web + PDV):** novo select "Máquina" (`maquinaId`, salva também `maquinaNome`).
  Produto novo vem com a máquina padrão; com máquina, `consumoImpressora` e `custoOutros` ficam
  automáticos (somente leitura). Produtos antigos/sem máquina continuam manuais.
- **Manter produtos em dia:** ao salvar uma máquina com mudança de consumo/valor/vida/manutenção,
  pergunta se recalcula os produtos que a usam (`Maquinas.recalcularProduto`: consumo, custoEnergia,
  custoOutros, custoTotal, precoVendaSugerido — **não mexe no `precoVenda`**). Renomear atualiza
  `maquinaNome`. Máquina em uso não pode ser excluída (sugere inativar).
- **Cálculo Rápido:** lista as máquinas ativas (padrão selecionada) no lugar de "A1 mini / A1";
  sem máquinas cadastradas, mantém os parâmetros genéricos. Passa `maquina=` para o produto.
- Busca "produtos da máquina" usa `orderByChild('maquinaId')` — **sem `.indexOn` ainda** (funciona,
  com aviso de performance). Índice fica no backlog junto com `codigoBarras` (não publiquei regras
  do RTDB sem conferir as regras vivas).
- SW: cache `kombinei-app-v15` (+ `/maquinas.js` no pré-cache).
- Ajuste: data de aquisição da máquina limitada a hoje (`max` no calendário + validação ao salvar). SW `kombinei-app-v16`.

**2026-10-04 — Cálculo Rápido → "Criar produto" + campo `custoOutros`:**
- `calculo_rapido.html`: botão "Copiar resultado" trocado por **"Criar produto com este cálculo"**,
  que abre `cadastro_produtos.html?rapido=1&nome=&tipo=&precoKg=&peso=&kwh=&watts=&horas=&outros=`
  (via `parent.abrirPagina`, marcando "Produtos" no menu). Material agora usa os mesmos tipos do
  cadastro (PLA, PLA Silk, PETG, ABS, ASA; +20% de energia em PETG/ABS/ASA).
- `cadastro_produtos.html`: `aplicarDadosCalculoRapido()` preenche o novo produto (modo "Custo
  simplificado"). **Preço do kg continua a regra do cadastro** (média dos filamentos do tipo em
  Insumos); o R$/kg do cálculo só vale se não houver filamento do tipo — decisão do usuário.
- **Novo campo de produto `custoOutros`** ("Outros custos por peça — bico, desgaste"), no web
  (`cadastro_produtos.html`) e no PDV (`pdv/index.html`, `cOutros`). Entra no `custoTotal` nos
  modos "simples" e "receita" (zerado em "sem"); produtos antigos = 0, sem mudança de custo.
  Cadastros rápidos de produto em `cadastro_orcamentos.html` / `cadastro_eventos.html` não têm o
  campo (criam produto novo sem ele — ok).
- SW: cache `kombinei-app-v14`.

**2026-10-04 — Novo nome do app:** `manifest.json` `name`, `<title>` do `home.html` e do
`login.html` = "Kombinei - Sistema de Gestão Inteligente de Produtos Personalizados" (mesmo texto
nos três para o Chrome não repetir o nome na barra de título do app instalado). `short_name`
continua `KOMBINEI`. SW: cache `kombinei-app-v13`.

**2026-10-03 — Cálculo Rápido + sync do deploy de 2026-08-29:**
- Descoberto que houve um deploy de hosting em **2026-08-29** que nunca foi commitado (de novo).
  Trazia: `evento_estoque_csv.html` (novo — gera CSV do estoque de um evento), botão "Gerar CSV
  p/ novo evento" em `listagem_eventos.html`, modal "Importar CSV (evento anterior)" em
  `cadastro_eventos.html`, e tabela "Vendas por feira / evento" + dropdown com todos os eventos em
  `dashboard.html`. Os 4 arquivos foram baixados do site ao vivo para o repositório.
- Novo: `calculo_rapido.html` — custo de impressão (mesma fórmula do skill `custo-impressao-3d`:
  filamento R$120/kg, energia R$1,10/kWh, A1 mini 0,080 kW / A1 0,095 kW, +20% para
  PETG/ABS/ASA, bico R$1,00, desgaste R$3.600/5.000 h). Tempo por duração ou início–fim.
  Parâmetros editáveis, salvos no `localStorage` do navegador. Item **Ferramentas → Cálculo
  Rápido** no menu (`home.html`, `data-modulo="produtos"`). SW: cache `kombinei-app-v12`.
- Novo: **tela Início** (`inicio.html`), agora a página padrão do `home.html` (item "Início" no
  topo do menu). Saudação por horário (5–12h Bom dia, 12–18h Boa tarde, senão Boa noite) + nome.
  O nome vem do `displayName` do **Firebase Auth** (não havia nome de usuário salvo em lugar
  nenhum); se vazio, a tela oferece "Como você quer ser chamado?" e grava via
  `user.updateProfile()`. O topo direito do `home.html` passou a mostrar o nome (ou o e-mail).
  Atalhos: Cálculo Rápido, Novo Orçamento, Vender em Evento, Dashboard + Orçamentos, Eventos,
  Histórico, Produtos, Novo Produto, Insumos, HueForges, Clientes, Configurações — cada um
  escondido se o usuário não tiver o módulo (`temPermissao`). Os atalhos chamam
  `parent.abrirPagina(pagina, titulo, menuPagina)` do `home.html`, que marca o item certo no menu.
- **Ícones do menu revisados:** Início `fa-house`, Orçamentos `fa-file-invoice-dollar`, Importar
  Shopee `fa-bag-shopping`, Histórico `fa-receipt`, Clientes `fa-user-group`, Produtos `fa-cube`,
  Insumos `fa-boxes-stacked`, HueForges `fa-palette`, Monitoramento `fa-chart-line`,
  Configurações `fa-gear`, Admin `fa-shield-halved`, Sair `fa-right-from-bracket`.
- Cloud Functions já rodam em **nodejs22** (confirmado via `firebase functions:list`).

**2026-08-19 (sync de repositório, sem novo deploy):**
o site já estava rodando todas as features abaixo havia semanas (deploys feitos direto via
`firebase deploy`, sem passar por commit), mas o Git nunca tinha sido atualizado. Setup de um
segundo computador (`C:\Kombinei`) expôs isso: `.git` recuperado do GitHub, working tree
comparado ao vivo com `calculo3d.web.app` (confirmado igual) e tudo consolidado no commit
`9e8101e` ("sync: reconciliar repositório com o estado já publicado em produção"), enviado ao
`origin/main`. **Regra daqui pra frente: atualizar este `.md` (e idealmente commitar) junto com
qualquer alteração no sistema Kombinei — código, infra ou deploy — não deixar o Git ficar atrasado
de novo.** Último deploy (hosting + functions) antes disso: 2026-08-02 —
catálogo de HueForges (correlação de cores: quais artes são imprimíveis com a carga atual de 4
cores), Cloud Function nova `/api/hueforge/scrape` (detecta cores a partir de um link colado).
Deploy anterior, 2026-07-06: modo de custo no
cadastro de produto — Receita completa / Custo simplificado / Sem custo, web + PWA; custo deixou de
ser obrigatório para salvar. Antes disso, 2026-07-01: transferir produtos entre eventos
(`evento_transferir.html`). Antes disso, no mesmo dia 2026-07-01: estoque do evento
segmentado por produto+cor: PDV ganhou "+ Adicionar estoque" do evento, `cadastro_eventos.html`
não bloqueia mais designar sem estoque livre do produto. Deploy anterior no mesmo dia: módulo de
Cores — registro por empresa + seletor reutilizável, produto.cores, PDV "Adicionar Estoque"
(produção); cache `kombinei-app-v10`.

---

## 3. Usuários Firebase Auth

| E-mail | Senha | Observação |
|---|---|---|
| kombineicontato@gmail.com | V147@i2319b | **Superadmin** — UID `uoScmdKF8pXbMgYwrkpm3ULojRk1` |
| (admin Leonardo) | — | Usuário principal da empresa 1 |
| shopee@shopee.com | shopeeteste123 | UID `KltYN0KdCpQP3yxwAWeitWAPGdF3` — testes Shopee |

⚠️ **Lockout por licença:** um job diário desativa o superadmin se a licença da empresa 1 vencer. Manter a **licença da empresa 1 como vitalícia** (sem `licencaExpira` ou data muito futura) para não perder o acesso de administração.

---

## 4. Estrutura de Arquivos

```
3Dcalc/
├── home.html                  # Shell principal (sidebar + iframe)
├── login.html                 # Tela de login
├── dashboard.html             # Dashboard com gráficos
├── config.js                  # ★ Flags de integração (ML/ME/Shopee on/off) — ver §6
├── empresa.js                 # Contexto multi-tenant (initEmpresa, empresaRef, branding…)
├── tags.js                    # Sistema de tags (tagSlug, tagCor, renderChip)
├── cores.js                   # ★ Registro de cores por empresa + seletor reutilizável (Cores.montarSeletor)
├── barcode.js                 # ★ Leitor de código de barras (BarcodeDetector + fallback ZXing)
├── theme.js / dark-mode.css   # Tema claro/escuro
│
│  # Produtos
├── cadastro_produtos.html     # Custo 3D + receita (insumos/subprodutos) + preço + código de barras
├── listagem_produtos.html
│
│  # Pessoas (clientes + fornecedores) — substituiu "clientes"
├── cadastro_pessoas.html
├── listagem_pessoas.html
├── cadastro_clientes.html     # legado / backup
├── listagem_clientes.html     # legado / backup
│
│  # Insumos
├── cadastro_insumos.html
├── listagem_insumos.html
│
│  # HueForges (catálogo + correlação de cores)
├── hueforge.js                # ★ paleta canônica, normalização, correlacionar(), sugerirMelhorCombo(), seletor de chips
├── cadastro_hueforges.html    # manual + colar link (detecta cores via Cloud Function)
├── listagem_hueforges.html    # 4 seletores de cor carregada, contador, filtros, importar planilha
│
│  # Orçamentos
├── cadastro_orcamentos.html   # autocomplete, modais, frete (manual)
├── listagem_orcamentos.html
│
│  # Eventos / Feiras
├── cadastro_eventos.html      # dados, estoque designado, flyer/imagem do evento
├── listagem_eventos.html      # listagem + botão de QR/link da landing + "Gerar CSV p/ novo evento"
├── evento_estoque_csv.html    # gera CSV (produtoId;produtoNome;corId;corNome;quantidade;valor) do estoque de um evento
├── inicio.html                # tela inicial (saudação + atalhos; respeita permissões; nome = displayName do Firebase Auth)
├── maquinas.js                # ★ regras de custo por máquina (desgaste/h, outros custos, consumo × material), opções de <select>, recalcularProduto()
├── calculo_rapido.html        # Cálculo Rápido de custo de impressão (sem banco; parâmetros em localStorage)
├── evento_venda.html          # PDV de balcão (web)
├── evento_relatorio.html      # relatório de vendas do evento
├── evento_transferir.html     # transferir produtos/estoque de um evento p/ outro (checklist)
├── cadastro-cliente.html      # landing PÚBLICA de captação (QR do estande); split 30/70 quando há flyer
│
│  # PWA do PDV (instalável)
├── pdv/
│   ├── index.html             # SPA: login → Home(menu) → [Vender] e [Cadastrar Produto]
│   ├── manifest.json          # name "KOMBINEI PDV", scope/start_url /pdv/
│   ├── sw.js                  # service worker (cache kombinei-pdv-v3, só app shell)
│   ├── icon.svg / icon-maskable.svg
│
│  # Integrações (atualmente desligadas por flag)
├── configuracoes.html         # autorização ME e ML, branding
├── monitoramento.html / busca_ml.html / ml-callback.html / ml-auth.js
├── me-callback.html
├── importar_shopee.html       # ★ importador de vendas Shopee (.xlsx/.csv via SheetJS)
│
├── admin.html                 # Painel superadmin (empresas, usuários, licenças)
├── migrar_nomes.html          # utilitário de migração
├── firebase.json / database.rules.json / firestore.rules
├── ESTADO_DO_PROJETO.md       # ← este arquivo
└── functions/
    ├── index.js
    └── src/
        ├── routes/   (crawler.routes.js, shipping.routes.js, admin.routes.js, public.routes.js, hueforge.routes.js)
        └── services/ (mercadolivre, melhorenvio, deal-detector, admin)
```

---

## 5. Paleta de Cores KOMBINEI

| Variável | Hex | Uso |
|---|---|---|
| Brand blue | `#4A93B0` | Legends, feedbacks, accent |
| Brand hover | `#3A7A96` | Hover de botões/links |
| Sidebar BG / primary | `#1B4C65` | Sidebar, topbar do PDV, theme-color |
| Sidebar hover | `#26617E` | Hover menu |
| Sidebar active | `#2E7496` | Item ativo |
| Light accent | `#8BBBD4` | Border ativo |
| Verde (sucesso/venda) | `#28a745` / `#218838` | Preços, botões salvar/finalizar |

**Branding por empresa:** logo + cores ficam no Firestore em `empresas/{id}.branding` (`logoUrl, corPrimaria, corSecundaria, corDestaque`). `empresa.js` aplica como CSS vars **apenas no modo claro** (não quebra o dark). Regra do Firestore permite o admin da empresa escrever só o nó `branding`.

---

## 6. Integrações de API

> **Estado atual:** ML, Melhor Envio e Shopee estão **desligados por flag em `config.js`**. O frete nos orçamentos é **manual**. As credenciais abaixo ficam guardadas para quando forem reativadas.

### Mercado Livre
| Item | Valor |
|---|---|
| Client ID | `1479387515607586` |
| Redirect URI | `https://calculo3d.web.app/ml-callback.html` |
| Scopes | `read offline_access` (PKCE S256) |
| Tokens | Firestore `config/ml_tokens` |
| Status | App "inativo"/70% no portal ML — só `/highlights/` funciona. **Desligado via config.js.** |

### Melhor Envio
| Item | Valor |
|---|---|
| Client ID | `25835` |
| Redirect URI | `https://calculo3d.web.app/me-callback.html` |
| Scopes | `shipping-calculate` · CEP origem `18605360` |
| Tokens | Firestore `config/me_tokens` |
| Status | Erro `invalid_client` na troca do code (não resolvido). **Desligado via config.js — frete manual.** |

### Shopee
| Item | Valor |
|---|---|
| Integração API | Não conectada — **desligada via config.js** |
| Caminho usado | **Importação por planilha** (`importar_shopee.html`): lê `.xlsx/.csv` (SheetJS), mapeia colunas e grava em `vendas_online`, idempotente por `numeroPedido` |

---

## 7. Banco de Dados (RTDB) — Estrutura Atual (multi-tenant)

Tudo isolado sob `/empresas/{id}/`:
```
/empresas/{id}/produtos/{id}      → { idSequencial, nomePeca, nomeResumido, tags[],
                                      codigoBarras, receita[{insumoId,quantidade}],
                                      subprodutos[{produtoId,quantidade}],
                                      custoMaterial(=filamento+receita), custoEnergia, custoOutros, custoTotal,
                                      precoVendaSugerido, precoVenda, imagemUrl,
                                      precoRolo, pesoPeca, taxaKWh, consumoImpressora,
                                      tempoImpressao, margemLucro, dataCriacao,
                                      tipoFilamento, estoque, estoquePorFilamento{filId:qtd},
                                      cores[{corId,nome,hex}] (opcional) }
/empresas/{id}/insumos/{id}       → { nome, fornecedorId, tipo: material|filamento, unidade,
                                      custoUnitario(R$/g), estoqueAtual(grama p/ filamento),
                                      // filamento: tipoFilamento, precoUnitario(R$/g), cor:{nome,hex} }
/empresas/{id}/movimentacoes_estoque/{pushId} → { tipo: producao|entrada_insumo|evento_saida|..., qtd, custoUnit, dataHora, ref }
/empresas/{id}/pessoas/{id}       → { nome, tipo: cliente|fornecedor, telefone, email, endereco }
/empresas/{id}/clientes/{id}      → legado/backup (Pessoas é a fonte atual)
/empresas/{id}/orcamentos/{id}    → { clienteId, nomeOrcamento, itens[], subtotalProdutos,
                                      frete, total, prazoEntrega, cepDestino, dataCriacao }
/empresas/{id}/eventos/{id}       → { nome, local, dataInicio, dataFim, status: ativo|planejado|...,
                                      flyerUrl (opcional, Storage eventos/{empresaId}/{eventoId}/flyer_*),
                                      estoque: { {estoqueId}: { produtoId, corId, corNome, qtdLevada,
                                                                precoEvento, filamentoId } },
                                        // estoqueId NÃO é sempre produtoId: linha antiga (retrocompat,
                                        // sem cor) usa produtoId como chave; linha nova (com cor) usa
                                        // push key — pode haver 2+ linhas do mesmo produtoId (cores
                                        // diferentes). Em memória as telas agrupam por chave composta
                                        // produtoId+'|'+(corId||'').
                                      vendas: { {pushId}: { produtoId, corId, corNome, qtd, precoUnit,
                                                            pagamento, dataHora,
                                                            status: ativa|cancelada, clienteId, clienteNome } } }
/empresas/{id}/vendas_online/{id} → importação Shopee (idempotente por numeroPedido)
/empresas/{id}/tags/{slug}        → { slug, nome }
/empresas/{id}/cores/{corId}      → { nome, hex, dataCriacao } — semeado (idempotente) com as
                                      básicas na 1ª leitura (Preto, Branco, Cinza, Vermelho, Azul,
                                      Verde, Amarelo, Laranja, Roxo, Rosa, Marrom, Natural/Transparente)
/empresas/{id}/hueforges/{id}     → { idSequencial, nome, fonteUrl, cores: string[] (paleta canônica
                                      fixa de hueforge.js — 20 cores, sem hex), dataCriacao }
/empresas/{id}/hueforgeEstado     → { coresCarregadas: string[4] } — as 4 cores carregadas agora na
                                      impressora (usadas para recalcular quem é "imprimível agora")
/empresas/{id}/contador_produtos/proximoId
/empresas/{id}/contador_orcamentos/proximoId
/empresas/{id}/contador_clientes/proximoId · contador_pessoas/proximoId · contador_insumos/proximoId · contador_cores/proximoId · contador_hueforges/proximoId
```

**Firestore:**
```
/empresas/{id}                 → { ...dados, branding:{logoUrl,corPrimaria,corSecundaria,corDestaque}, licenca/expira }
/usuarios/{uid}                → vínculo usuário↔empresa, role, ativo
/config/ml_tokens · me_tokens
/tracked_products · /price_history · /deals
```

**Custom claims (Auth):** `empresaId`, `role` (superadmin/admin/user), `ativo`, `permissoes`, `licencaExpira`. `empresa.js` normaliza permissões (ausente = liberado, retrocompat).

---

## 8. Funcionalidades por Módulo

### Produtos + Receita
- Custo = **filamento** (precoRolo/1000 × peso) + **receita** (Σ insumos `custoUnitario×qtd` + Σ subprodutos `custoTotal×qtd`) + **energia** (W/1000 × h × kWh) + **outros custos** (`custoOutros`: bico, desgaste — R$ por peça).
- `precoVendaSugerido = custoTotal × (1 + margem%)`; `precoVenda` editável (default = sugerido, override detectado).
- **Imagem** redimensionada 200×200 (canvas) → Storage. **Código de barras** único por empresa.
- **Tipo de filamento** (2026-07-01): campo `tipoFilamento` (PLA/PLA Silk/PETG/ABS/ASA) nas 3 telas de preço (cadastro web, PDV, modal do orçamento). O "Preço do rolo" passa a ser a **média do PREÇO** (`precoUnitario`) dos filamentos **desse tipo** (`Estoque.precoRoloMedio(map, tipo)`); sem tipo → média geral (retrocompat).
- **Área de estoque (produção)** (2026-07-01): fieldset colapsável no cadastro web e no PDV — qtd + filamento/cor + preview de consumo (via `planejarProducao`); ao salvar faz produção atômica (estoque += X, baixa receita, log). Falta de insumo: salva o produto e pula a produção.
- **Modo de custo** (2026-07-06, `modoCusto`: `receita`|`simples`|`sem`, cadastro web + PWA): seletor no topo do formulário —
  **Receita completa** (comportamento de sempre: filamento + insumos/subprodutos + energia), **Custo simplificado**
  (default p/ produto novo — só valor do KG do filamento + peso; esconde a seção de Receita e ignora insumos/subprodutos
  no cálculo) e **Sem custo** (esconde Material/Energia/Margem/Receita; `custoTotal=0`). Trocar de modo fora de "receita"
  limpa as linhas de insumo/subproduto do formulário (evita custo residual escondido); os valores de Material/Energia
  ficam preservados nos campos ocultos (não perdidos) ao alternar entre "receita"/"simples". **Custo nunca é obrigatório
  para salvar** — `validarCampos()`/`salvarProduto()` só exigem o nome do produto; produtos antigos sem `modoCusto`
  salvo inferem o modo pela receita/custo (tem receita → `receita`; tem precoRolo/peso → `simples`; senão → `sem`).
- Retrocompatível: produtos antigos sem receita/código/tipo abrem normalmente.

### Cores (`cores.js`) (2026-07-01)
- Registro de cores **por empresa** em `/empresas/{id}/cores`, semeado (idempotente) com 12 cores
  básicas na primeira leitura. `Cores.montarSeletor({container, empresaRef, coresDisponiveis?,
  selecionadas, multi, permitirNovo, onChange})` é o **componente único** (chips + dropdown + "+
  Adicionar nova cor") reusado em toda tela que precise de cor — não duplicar a UI.
- **Cadastro de produto (web + PWA):** campo opcional "Cores" (multi-seleção) salvo em
  `produto.cores[{corId,nome,hex}]`; `listagem_produtos.html` mostra as cores em bolinhas
  (`Cores.renderBolinhas`).
- **PDV → "Adicionar Estoque"** (novo item de menu, `pdv/index.html`): escolhe o produto (busca +
  lista) e abre o mesmo fluxo de produção do fieldset de cadastro (`Estoque.planejarProducao`) —
  qtd, filamento/cor do insumo, preview de consumo. Se o produto tem `cores`, mostra um seletor
  **single-select informativo** (`permitirNovo:false`, restrito às cores do produto) para marcar
  qual cor foi produzida; grava em `movimentacoes_estoque/{id}.corProduzida` (não cria estoque
  separado por cor).

### HueForges (`hueforge.js`)
- Catálogo de artes HueForge (impressão 3D por troca de filamento, até 4 cores por vez) com
  **correlação de cores**: dado o conjunto das 4 cores carregadas agora na impressora
  (`hueforgeEstado.coresCarregadas`), calcula quais itens do catálogo são **imprimíveis sem trocar
  bobina** (`Hueforge.correlacionar` — subconjunto exato; >4 cores distintas = "impossível em 1
  carga"; expõe também quantas e quais cores faltam).
- **Paleta canônica fixa** (20 cores, sem hex, distinta do registro de cores por empresa do
  `cores.js`) + normalização de sinônimos de marca (ex.: "Jade White"→Branco, "Charcoal"→Preto,
  "Blue Gray"→Cinza, "Dark Gray"→Cinza escuro) em `Hueforge.normalizarCor/normalizarLista`.
- `listagem_hueforges.html`: 4 seletores da cor carregada (grava e recalcula ao vivo), contador
  "X de Y imprimíveis", botão "Sugerir melhor combinação" (guloso — `Hueforge.sugerirMelhorCombo`),
  filtros (só imprimíveis, faltando 1, por cor, por nº de cores, busca), e **importador de
  planilha** (SheetJS, mapeamento de colunas Nome/Cores/Link, mesmo padrão do importador Shopee).
- `cadastro_hueforges.html`: cadastro manual (chips sobre a paleta fixa) + "Detectar cores" a
  partir de um link colado — chama a Cloud Function `/api/hueforge/scrape` (faz o fetch da página
  no servidor, evitando CORS) e sugere cores pelo dicionário de sinônimos; o usuário confere antes
  de salvar.
- Reaproveita a permissão do módulo `produtos` (mesmo padrão de Insumos), sem nó novo em `permissoes`.

### Pessoas / Insumos
- "Clientes" virou **Pessoas** (cliente/fornecedor); migração idempotente. `/clientes` mantido como backup.
- Insumos alimentam a receita dos produtos. **Fornecedor rápido** (2026-07-01): botão "+ Novo" no cadastro de insumos abre modal que grava em `/pessoas` (fornecedor) e já seleciona no dropdown.
- **Filamento (2026-07-01):** `tipoFilamento` obrigatório; **unidade padrão KG** (troca p/ grama); dois valores — **Custo por KG** (`custoUnitario` R$/g = custo médio/produção) e **Preço por KG** (`precoUnitario` = base do preço de venda; se vazio, usa o custo). O sistema **converte tudo p/ grama** internamente (custo/preço ÷1000, estoque ×1000); a listagem exibe/recebe entrada reconvertendo p/ a unidade do cadastro.

### Eventos / Feiras
- Cada evento tem **estoque designado** (`qtdLevada` + `precoEvento` independente do preço normal),
  **segmentado por produto+cor** (2026-07-01, reaproveita o registro de Cores — ver §"Cores" acima).
  Retrocompat: linha antiga sem `corId` = "sem cor definida". `cadastro_eventos.html` identifica
  cada linha pela chave real do RTDB (`estoqueId`), não mais por `produtoId` — necessário pra não
  colidir quando o mesmo produto tem 2+ cores no evento.
- **Designar estoque do evento (`cadastro_eventos.html`) não bloqueia mais por falta de estoque
  livre do produto** (2026-07-01) — só continua bloqueando reduzir `qtdLevada` abaixo do já
  vendido. `produtos/{id}.estoque` pode ficar negativo, sinalizando produção pendente pro evento.
- POS de balcão (`evento_venda.html`) e PDV PWA gravam em `eventos/{id}/vendas` (com `corId`/`corNome`);
  disponível = levado − vendido **da mesma cor**, ao vivo (listener `.on('value')` em `/estoque`, não
  só em `/vendas`).
- `evento_relatorio.html` consolida as vendas por produto+cor (`"Produto — Cor"`). Há gate em
  orçamentos relacionado a eventos.
- **Flyer/imagem do evento (opcional):** `cadastro_eventos.html` faz upload p/ Storage (`eventos/{empresaId}/{eventoId}/flyer_*`) e salva a URL em `eventos/{id}.flyerUrl`.
- **Transferir produtos entre eventos** (`evento_transferir.html`, botão na `listagem_eventos.html`): escolhe o evento de destino + checklist do estoque de origem (produto+cor+disponível, qtd editável por item, default = disponível). Ao confirmar, releitura "a quente" de origem/destino (evita corrida) e `update()` atômico: só reduz `qtdLevada` na origem e incrementa a linha existente no destino (mesma chave produtoId+corId) ou cria uma nova preservando `corId/corNome/precoEvento/filamentoId` — **não mexe no estoque geral do produto** (só reassocia entre eventos).
- **Landing pública de captação** (`cadastro-cliente.html`, sem auth): aberta pelo **QR/link do estande** (`?e={empresaId}&ev={eventoId}`). Carrega via `GET /api/landing-info` (nome do evento + branding + `flyerUrl`) e grava o lead via `POST /api/cadastro-publico` (Admin SDK; rotas em `functions/src/routes/public.routes.js`). Se o evento tem `flyerUrl`, abre em **split 30/70** (imagem cobrindo a esquerda inteira / form à direita; vira banner no topo no mobile <820px); **sem flyer, mantém o layout antigo**.

### PDV PWA (`/pdv/`)
- Instalável (manifest/SW). **Online-only** (banner offline bloqueia finalizar). SW cacheia **só o app shell** (`kombinei-pdv-v3`: index, manifest, ícones, `../empresa.js`, `../tags.js`, `../barcode.js`); dados/imagens sempre na rede.
- Pós-login: **menu** "Vender (PDV)" + "Cadastrar Produto" (arquitetura aberta p/ mais itens).
- **Cadastrar Produto:** mesmo modelo de `cadastro_produtos.html` (receita, custos ao vivo, foto câmera/galeria → Storage, código de barras) — inclui **Tipo de filamento** e **Área de estoque (produção)** (2026-07-01). Oculto se `!temPermissao('produtos')`.
- **Vender:** seleção de evento → grade do estoque do evento (por produto+cor) → carrinho → finalizar. **Botão Escanear** (modo contínuo) procura o produto **só dentro do estoque do evento**; se o produto tem 2+ cores no evento e mais de uma tem espaço no carrinho, pede pra tocar a cor certa na grade em vez de adivinhar.
- **"+ Adicionar estoque" do evento** (2026-07-01, na tela de Venda): busca/escaneia produto (entre todos os produtos da empresa) → escolhe cor (`Cores.montarSeletor`, registro completo + criar nova) → quantidade → preço. Incrementa (ou cria) a linha produto+cor em `eventos/{id}/estoque` na hora — **não mexe no estoque geral do produto** (isso é só o "designar" da tela web). Diferente do card "Adicionar Estoque" do menu Home, que é produção geral fora de evento.

### Código de barras (`barcode.js`)
- `window.Barcode.open({continuous,onCode,title,hint})` / `isSupported()` / `close()`. Injeta próprio modal.
- **BarcodeDetector** nativo (Android/Chrome) → **fallback ZXing** via CDN (iOS/Safari). Câmera `environment`, `playsinline`. Trata permissão negada/sem câmera com mensagem + "Tentar novamente"; fecha por X/Esc; debounce 1,5s.
- Cadastro: leitura single-shot preenche o campo; valida duplicidade (`orderByChild('codigoBarras').equalTo`) antes de salvar. Venda: contínuo, mensagens "não está neste evento" / "sem estoque no evento".

### Vendas / Histórico + Dashboard
- **`vendas.js`** consolida vendas de evento + online numa lista única (`historico_vendas.html` + seção Vendas do `dashboard.html`).
- **Vendas canceladas (2026-07-01):** NÃO somem mais do histórico — cada linha carrega `status` (`ativa`/`cancelada`). `historico_vendas.html` mostra coluna/badge Status, linha atenuada + total riscado, filtro de status, e **soma só as ativas** (canceladas contam à parte). O **dashboard exclui** canceladas dos KPIs/gráficos.

### Multi-tenant (Fase 1 — concluída)
- `empresa.js`, `database.rules.json` (isolamento por empresa + fallback empresa 1), `admin.html` (empresas/usuários/licenças), API `/api/admin/*` protegida por JWT superadmin. Migração RTDB executada (produtos/clientes/orçamentos).

---

## 9. Próximas Tarefas (Backlog)

### Alta prioridade
1. **Testar código de barras em aparelho real** — Android (BarcodeDetector) e **iPhone/Safari (fallback ZXing)**; confirmar leitura no cadastro e na venda.
2. **Licença da empresa 1 vitalícia** — garantir que o job diário não trave o superadmin.

### Média prioridade
3. **Índice RTDB** em `produtos`: `.indexOn: ["codigoBarras", "maquinaId"]` em `database.rules.json` (silencia aviso de performance na validação de código de barras e na busca de produtos por máquina). Conferir as regras vivas no console antes de publicar.
4. **CEP no cadastro de Pessoas** — auto-preencher no orçamento.
5. Multi-tenant Fase 2 (auto-cadastro de empresas + checkout de licença) e Fase 3 (permissões por recurso — já há base via `permissoes`).

### Baixa prioridade / Futuro
6. Reativar integrações (ML/ME/Shopee) quando resolvidas — hoje desligadas via `config.js`.
7. ~~Node.js 20 → 22 nas Functions~~ — **feito** (functions em `nodejs22`, confirmado 2026-10-03).
8. ML: sair de "inativo"/70% no portal. ME: resolver `invalid_client`. Shopee: API direta (Partner ID/Key/Shop ID).

---

## 10. Comandos Úteis

```powershell
firebase functions:log --only monitorApiV2     # logs da function
firebase deploy --only hosting                  # publicar front-end
firebase deploy --only functions
git add <arquivos>; git commit -m "mensagem"
```

---

## 11. Observações Técnicas

- Front-end usa **Firebase Web SDK v8** (scripts globais), `empresa.js` injetado em todas as páginas internas → `empresaRef(path)` em vez de `database.ref()`.
- **PDV** tem auth gate próprio: checa `claims.ativo` antes de `initEmpresa()` (evita o redirect do `empresa.js` para `login.html` inexistente em `/pdv/`).
- **Caminhos absolutos `/pdv/...`** no manifest/sw/icon: o `serve` local dropa a barra final e quebraria caminhos relativos; no Firebase a barra é mantida.
- **Câmera exige HTTPS** (ok no Hosting e em `localhost`; não em IP `http://`). ZXing carrega de CDN (cross-origin, fora do cache do SW) — só no fallback.
- Dark mode via `postMessage({type:'SET_THEME'})` (não recarrega iframe). Branding custom só no modo claro.
- Frete é manual e entra no `total` do orçamento.
- Fluxo de dev/teste: Playwright + deploy + regressão no live (`--workers=2`); preview local com autoPort.
