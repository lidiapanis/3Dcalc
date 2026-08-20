# Módulo de Monitoramento de Preços — Mercado Livre

**Projeto:** calculo3d.web.app  
**Firebase Project:** `calculo3d`  
**Data:** Junho 2026  

---

## Visão Geral

Módulo integrado ao sistema 3DCalc para monitorar preços de produtos no Mercado Livre, com alertas de ofertas e histórico de preços. Utiliza Firebase Cloud Functions (Gen2), Firestore e Firebase Hosting.

---

## Arquitetura

```
Browser (calculo3d.web.app)
    │
    ├── busca_ml.html         → Explorador de destaques por categoria
    ├── monitoramento.html    → Gestão de produtos monitorados e ofertas
    └── ml-callback.html      → Callback OAuth do ML

Firebase Hosting (rewrites)
    └── /api/monitor/** → Cloud Run (monitorApiV2, us-central1)

Cloud Functions Gen2
    ├── monitorApiV2          → API REST Express (todas as rotas)
    └── priceMonitorJobV2     → Job agendado (a cada 1 hora)

Firestore Collections
    ├── tracked_products      → Produtos/categorias monitorados
    ├── price_history         → Histórico de preços
    ├── deals                 → Ofertas detectadas
    └── config/ml_tokens      → Tokens OAuth do Mercado Livre
```

---

## Arquivos Criados/Modificados

| Arquivo | Descrição |
|---|---|
| `functions/index.js` | Exports Gen2: `monitorApiV2` + `priceMonitorJobV2` |
| `functions/src/routes/crawler.routes.js` | Todas as rotas REST da API |
| `functions/src/services/mercadolivre.service.js` | Integração com API ML + OAuth |
| `functions/src/jobs/price-monitor.job.js` | Job de monitoramento de preços |
| `functions/package.json` | Node 20, firebase-functions v4, express, axios, cors |
| `busca_ml.html` | Explorador de destaques ML por categoria |
| `monitoramento.html` | Dashboard de monitoramento e ofertas |
| `ml-callback.html` | Callback do OAuth ML |
| `home.html` | Adicionado menu "Mercado Livre" na sidebar |
| `firebase.json` | Rewrites Gen2, headers no-cache HTML |
| `firestore.rules` | Regras de acesso (config/ml_tokens leitura autenticada) |

---

## Rotas da API (`/api/monitor/`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/categories` | Lista categorias ML disponíveis |
| GET | `/highlights/:categoryId` | Destaques de uma categoria |
| GET | `/products` | Lista produtos monitorados |
| POST | `/products` | Cadastrar produto/categoria |
| PUT | `/products/:id` | Atualizar |
| DELETE | `/products/:id` | Remover |
| GET | `/history/:mlId` | Histórico de preços de um item |
| GET | `/deals` | Listar ofertas |
| PATCH | `/deals/:id/read` | Marcar oferta como lida |
| POST | `/ml-auth` | Trocar código OAuth por token |
| GET | `/ml-status` | Status da autorização ML |
| GET | `/ml-test` | Diagnóstico completo de conectividade |
| POST | `/run` | Disparar job manualmente |

---

## App ML (Developer Portal)

| Campo | Valor |
|---|---|
| **Client ID** | `1479387515607586` |
| **Client Secret** | `LdtTfXqDOnAzCNwcHnfncDbnKxlejUys` |
| **Redirect URI** | `https://calculo3d.web.app/ml-callback.html` |
| **Auth URL** | `https://auth.mercadolivre.com.br/authorization` |
| **API Base** | `https://api.mercadolibre.com` *(Spanish — não .br)* |
| **Status do app** | **NOVA (70% confiança)** — pendente ativação |

---

## OAuth Flow

1. Usuário clica "Autorizar Mercado Livre" em `monitoramento.html`
2. Abre popup → `auth.mercadolivre.com.br` com `response_type=code`
3. Usuário aprova o app no ML
4. ML redireciona para `ml-callback.html?code=...`
5. `ml-callback.html` chama `POST /api/monitor/ml-auth` com o code
6. Cloud Function troca o code por `access_token` + `refresh_token`
7. Tokens salvos em Firestore: `config/ml_tokens`

**Scopes utilizados:** `read offline_access`

---

## Problemas Encontrados e Soluções

### 1. Domínio errado da API ML
- **Problema:** `api.mercadolivre.com` (português) → `ENOTFOUND`
- **Solução:** Usar `api.mercadolibre.com` (espanhol)

### 2. Node 18 decommissioned
- **Solução:** Atualizar `package.json` engines para `"node": "20"` e `firebase.json` para `"runtime": "nodejs20"`

### 3. Cloud Build API não ativada
- **Solução:** Ativar no GCP Console → APIs & Services

### 4. Upgrade Gen1 → Gen2 bloqueado
- **Problema:** "Upgrading from 1st Gen to 2nd Gen is not yet supported"
- **Solução:** Deletar funções Gen1 (`firebase functions:delete monitorApi priceMonitorJob`) e renomear para `monitorApiV2` / `priceMonitorJobV2`

### 5. Auth URL com domínio errado
- **Problema:** `auth.mercadolibre.com.br` → DNS error
- **Solução:** `auth.mercadolivre.com.br` (português para auth)

### 6. Redirect URI não registrada
- **Problema:** "não foi possível conectar o aplicativo"
- **Solução:** Adicionar `https://calculo3d.web.app/ml-callback.html` no portal ML

### 7. `refresh_token: undefined` no Firestore
- **Problema:** ML não retorna refresh_token sem `offline_access`
- **Solução:** Adicionar `&scope=read%2Coffline_access` na URL de auth + `data.refresh_token || null`

### 8. Cache de arquivos JS/HTML
- **Solução:** Adicionar headers no `firebase.json`:
  - JS/CSS: `max-age=3600`
  - HTML: `no-cache, no-store, must-revalidate`

---

## Status dos Endpoints ML (Diagnóstico)

| Endpoint | Status | Observação |
|---|---|---|
| `GET /users/me` | ✅ 200 | Token válido, user KOMBINEI (ID: 144057694) |
| `GET /highlights/MLB/category/{id}` | ✅ 200 | Funciona sem autenticação especial |
| `GET /sites/MLB/search` | ❌ 403 | App NOVA — sem permissão |
| `GET /items/{id}` | ❌ 403 | App NOVA — sem permissão |
| Scraping página ML | ❌ Bloqueado | GCP IP detectado como tráfego suspeito |

**Causa raiz:** App ML com status "NOVA" bloqueia todos os endpoints de produto. Apenas `/users/me` e `/highlights/` funcionam.

---

## Solução Atual (App NOVA)

Enquanto o app ML não é ativado, o sistema funciona com **destaques por categoria**:

- 14 categorias disponíveis (Games, Computadores, Celulares, etc.)
- Usuário seleciona uma categoria → vê 12 produtos em destaque
- Botão "Ver no ML" abre o produto com preço
- Botão 🔔 adiciona ao monitoramento
- **Preços ficam visíveis na interface quando o app for ativado** (zero mudança de código necessária)

---

## Como Ativar o App ML (Pendente)

Para sair do status "NOVA" e liberar os endpoints de produto:

1. Acessar https://developers.mercadolivre.com.br/devcenter
2. Abrir o app `1479387515607586`
3. Preencher os campos em falta (~30% do perfil):
   - [ ] Descrição do app
   - [ ] Logo/ícone (mín. 150×150px)
   - [ ] URL do site: `https://calculo3d.web.app`
   - [ ] Política de privacidade
   - [ ] Termos de uso
4. Ativar **Refresh Token** nas configurações OAuth
5. Salvar → status deve mudar de NOVA para ATIVA

Quando ativado, os preços aparecem automaticamente no sistema sem nenhuma alteração de código.

---

## Deploy

```bash
# Deploy completo
firebase deploy

# Só functions
firebase deploy --only functions

# Só hosting
firebase deploy --only hosting

# Só regras Firestore
firebase deploy --only firestore:rules
```

---

## Diagnóstico Rápido

```
# Testar conectividade ML
https://calculo3d.web.app/api/monitor/ml-test

# Ver status do token OAuth
https://calculo3d.web.app/api/monitor/ml-status
```

---

## Categorias ML Configuradas

| ID | Nome |
|---|---|
| MLB5672 | Games e Consoles |
| MLB1648 | Computadores e Acessórios |
| MLB1051 | Celulares e Smartphones |
| MLB1000 | Eletrônicos |
| MLB1459 | Eletrodomésticos |
| MLB1574 | Ferramentas e Construção |
| MLB1368 | Esportes e Fitness |
| MLB1132 | Casa e Decoração |
| MLB1182 | Câmeras e Fotografia |
| MLB1246 | Videogames |
| MLB1144 | Moda e Acessórios |
| MLB3937 | Brinquedos e Hobbies |
| MLB1953 | Automóveis |
| MLB1499 | Beleza e Cuidado |

---

## Próximos Passos

- [ ] Completar perfil do app ML para ativação
- [ ] Ativar Refresh Token nas configurações OAuth do app ML
- [ ] Reautorizar após ativação para obter novo token com permissões completas
- [ ] Testar busca por texto (`/sites/MLB/search`) após ativação
- [ ] Implementar alertas por e-mail quando oferta for detectada
