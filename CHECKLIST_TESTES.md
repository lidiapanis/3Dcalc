# KOMBINEI — Checklist de Testes Manuais
> Funcionalidades alteradas/implementadas em 16–18/06/2026.
> Lembrete: o **PWA tem cache** — feche e reabra (ou recarregue) para pegar a versão nova (Service Worker atual: `kombinei-pdv-v5`).

---

## 1. PWA do PDV — Cadastro de Produto
- [ ] Após login, o menu inicial mostra **"Vender (PDV)"** e **"Cadastrar Produto"**
- [ ] Criar produto pelo celular → aparece no sistema web (mesma base) e vice-versa
- [ ] Receita calcula custo ao vivo; preço de venda inicia no sugerido e aceita override
- [ ] Foto via **câmera** OU **galeria** sobe pro Storage e fica vinculada ao produto
- [ ] Lista/busca de produtos abre um produto existente para editar
- [ ] "Cadastrar Produto" some do menu se o usuário não tem permissão de produtos

## 2. Código de barras
- [ ] Cadastro web (`cadastro_produtos.html`): botão **"Ler"** abre a câmera e preenche o código
- [ ] Cadastro no PWA: botão da câmera lê e preenche
- [ ] Salvar com código já usado em outro produto da empresa é **bloqueado/avisado**
- [ ] Funciona em **Android/Chrome** (BarcodeDetector) e **iPhone/Safari** (fallback ZXing)
- [ ] Na venda do PWA: botão **Escanear** (modo contínuo)
- [ ] Bipar produto do evento adiciona ao carrinho; fora do evento → "não está neste evento"; sem estoque → "sem estoque"

## 3. PDV — Desconto, Brinde e estoque no bipe
- [ ] Cada item do carrinho (web `evento_venda.html` e PWA) tem checkbox **Brinde** (zera o preço) e campo **Desconto** (R$ por unidade ou %)
- [ ] O total reflete descontos/brindes; o que vai pra `vendas` é o `precoUnit` líquido
- [ ] **Correção:** bipar não deixa mais vender acima do disponível — bloqueia com "sem estoque suficiente no evento"

## 4. PDV — Caixa, Troco, Extrato e Estorno
- [ ] Ao abrir a venda no 1º acesso do dia, aparece o modal **"Abertura de Caixa"** (troco inicial); "Pular" registra 0
- [ ] Pagamento **Dinheiro** mostra "Valor pago" + **Troco** ao vivo; finalizar é bloqueado se pago < total; `valorPago`/`troco` ficam salvos na venda
- [ ] **Extrato do Caixa**: resumo (Troco inicial + Dinheiro + Cartão/Pix = Total em caixa) e lista das vendas do dia (mais recentes primeiro) com status
- [ ] **Cancelar venda** pede confirmação, marca como "Cancelada" (não deleta), **devolve o estoque** à grade e atualiza o resumo na hora
- [ ] O **relatório do evento** ignora vendas canceladas (faturamento, nº de vendas, ticket, sobra)
- [ ] Testar tanto no **balcão web** quanto no **PWA**

## 5. Orçamentos (`cadastro_orcamentos.html`)
- [ ] Botão **"+"** de criar produto fica **dentro** do campo de busca, com tooltip "Criar Produto"
- [ ] O modal de criar produto tem **todos os campos** (material, energia, margem, receita, custos ao vivo, preço)
- [ ] Cada item tem checkbox **"Brinde?"** → preço 0 no total, item mantido
- [ ] Telefone no "Novo Cliente" formata **(XX) XXXXX-XXXX** ao digitar
- [ ] Adicionar um produto **já presente** soma à quantidade (não cria linha duplicada)

## 6. Produtos (cadastro e listagem)
- [ ] Insumo da receita escolhido por **"Buscar Insumo"** → modal com busca e tabela (Nome, Fornecedor, Unidade, Custo)
- [ ] Campos de **Preço de Venda** e **Margem** sem setas (spinners)
- [ ] Digitar o **Preço de Venda** recalcula a **Margem (%)** ao vivo (cálculo reverso); editar a margem volta a sugerir o preço
- [ ] Botão de salvar no **rodapé**, com texto **"Salvar Cadastro"** (edição: "Atualizar Cadastro")
- [ ] Busca da listagem filtra por **nome ou tag**

## 7. Insumos (`listagem_insumos.html`)
- [ ] **Funil** ao lado de "Fornecedor" abre dropdown com fornecedores únicos (vindos de `/pessoas`)
- [ ] Selecionar um fornecedor filtra a tabela; **"Todos"** limpa o filtro

## 8. Pessoas — tipo por dropdown
- [ ] O tipo agora é um **dropdown** com **Cliente / Fornecedor / Cliente/Fornecedor**
- [ ] Salvar grava `tipo` ("cliente"/"fornecedor"/"ambos") + `tipos` sincronizado
- [ ] Editar uma pessoa (inclusive registros antigos) abre o dropdown na opção correta
- [ ] **Orçamentos**: no autocomplete de cliente aparecem Cliente **e** Cliente/Fornecedor
- [ ] **Insumos**: no dropdown de fornecedor aparecem Fornecedor **e** Cliente/Fornecedor

## 9. Landing de captação por evento (QR)
- [ ] **Eventos** → "Gerar link de cadastro" (ícone QR): confere link, QR, **copiar** e **baixar PNG**
- [ ] Abrir o link/QR no celular: a landing mostra **nome do evento** + **logo/cores da empresa** (sem branding → fallback KOMBINEI)
- [ ] Preencher **nome + telefone** (e-mail opcional) → tela de obrigado; **"Novo cadastro"** reusa sem recarregar
- [ ] Em **Pessoas**: a pessoa entra como **Cliente** com a coluna **Origem** preenchida
- [ ] Reenviar o **mesmo telefone** → não duplica (completa a origem se vazia)
- [ ] `cadastro_pessoas` manual: dropdown **"Evento de origem"** lista eventos e grava/relê na edição
- [ ] Link sem `e`/`ev` ou evento inexistente → mensagem amigável de "link indisponível"

---

### Notas
- Vários fluxos não puderam ser testados logados durante o desenvolvimento (o preview não passa pelo login Firebase) — foram validados em estrutura, parsing e cálculos. Daí a importância deste checklist.
- Item já testado ao vivo: `GET /api/landing-info` (seção 9). O restante vale percorrer manualmente.
