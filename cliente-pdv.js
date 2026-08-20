/* KOMBINEI — Identificação de cliente no PDV (web + PWA)
 *
 * Lógica COMPARTILHADA entre o POS web (evento_venda.html) e o PWA (pdv/index.html):
 * dado um telefone (obrigatório), reconhece um cliente já cadastrado em
 * /empresas/{id}/pessoas ou cadastra um novo (tipo cliente). A UI (modal/bloco) fica
 * em cada superfície; aqui mora só a regra de negócio — espelha o servidor
 * (functions/.../public.routes.js: dedup por empresa+telefone, só dígitos).
 *
 * Pré-requisito: `empresaRef` global (empresa.js) já carregado e com contexto da empresa.
 */
(function (global) {
  'use strict';

  function soDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  // Procura uma pessoa da empresa cujo telefone (só dígitos) bata com telDigits.
  async function buscarPorTelefone(telDigits) {
    if (!telDigits) return null;
    const snap = await empresaRef('pessoas').once('value');
    let achado = null;
    snap.forEach(function (c) {
      const d = c.val() || {};
      if (soDigitos(d.telefone) === telDigits) {
        achado = { id: c.key, nome: d.nome || ('#' + c.key), dados: d };
      }
    });
    return achado;
  }

  // Cria uma pessoa tipo cliente (ID sequencial transacional, igual ao cadastro_pessoas).
  async function criar(opts) {
    const txn = await empresaRef('contador_pessoas/proximoId')
      .transaction(function (cur) { return cur === null ? 1 : cur + 1; });
    const novoId = txn.snapshot.val();
    const pessoa = {
      idSequencial: novoId,
      nome: opts.nome,
      telefone: opts.telefone || '',
      email: opts.email || '',
      documento: '', endereco: '', cep: '', observacoes: '',
      tipo: 'cliente',
      tipos: { cliente: true, fornecedor: false },
      eventoOrigemId: opts.eventoId || null,
      eventoOrigemNome: opts.eventoNome || null,
      origem: 'pdv',
      dataCriacao: new Date().toISOString()
    };
    await empresaRef('pessoas/' + novoId).set(pessoa);
    return { id: String(novoId), nome: opts.nome };
  }

  /* identificar({ nome, telefone, email }, { eventoId, eventoNome }) →
   *   { erro }                               se inválido
   *   { id, nome, telefone, novo:false }     telefone já cadastrado → só reconhece
   *   { id, nome, telefone, novo:true }      telefone novo → cadastra cliente
   * Telefone é sempre obrigatório; nome só é exigido para um cadastro novo. */
  async function identificar(dados, opts) {
    dados = dados || {}; opts = opts || {};
    const nome = (dados.nome || '').trim();
    const telefone = (dados.telefone || '').trim();
    const email = (dados.email || '').trim();
    const telDigits = soDigitos(telefone);

    if (!telDigits) return { erro: 'Informe o telefone do cliente.' };
    if (telDigits.length < 10 || telDigits.length > 11)
      return { erro: 'Telefone inválido. Use DDD + número (10 ou 11 dígitos).' };
    if (email && !emailValido(email)) return { erro: 'E-mail inválido.' };

    const achado = await buscarPorTelefone(telDigits);
    if (achado) {
      return { id: achado.id, nome: achado.nome, telefone: achado.dados.telefone || telefone, novo: false };
    }

    if (!nome) return { erro: 'Cliente novo: informe o nome para cadastrar.' };
    const novo = await criar({ nome: nome, telefone: telefone, email: email, eventoId: opts.eventoId, eventoNome: opts.eventoNome });
    return { id: novo.id, nome: nome, telefone: telefone, novo: true };
  }

  // Máscara de telefone BR aplicada ao vivo no input (10 ou 11 dígitos).
  function mascararTelefone(el) {
    let v = soDigitos(el.value).slice(0, 11);
    if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
    else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    else if (v.length > 0) v = v.replace(/(\d{0,2})/, '($1');
    el.value = v;
  }

  global.ClientePDV = {
    soDigitos: soDigitos,
    buscarPorTelefone: buscarPorTelefone,
    criar: criar,
    identificar: identificar,
    mascararTelefone: mascararTelefone
  };
})(window);
