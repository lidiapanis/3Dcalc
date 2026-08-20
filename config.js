/* ──────────────────────────────────────────────────────────────────────────
 * KOMBINEI — Flags centrais de integrações externas
 *
 * Mantêm o código das integrações no repositório, mas permitem ligar/desligar
 * a UI e as chamadas às APIs de forma limpa e reversível.
 *
 * Para REATIVAR uma integração depois, basta trocar o valor para `true` aqui.
 * Nenhuma outra mudança é necessária — a UI antiga volta a aparecer.
 * ────────────────────────────────────────────────────────────────────────── */
window.KOMBINEI_FLAGS = {
  mercadoLivre: false,   // Busca ML, Monitoramento de Preços, OAuth ML
  melhorEnvio:  false,   // Cálculo de frete em tempo real (frete passa a ser manual)
  shopee:       false,   // Integração Shopee
};

// Helper opcional: leitura segura de uma flag (default = false se não definida).
window.flagAtiva = function (nome) {
  return !!(window.KOMBINEI_FLAGS && window.KOMBINEI_FLAGS[nome]);
};
