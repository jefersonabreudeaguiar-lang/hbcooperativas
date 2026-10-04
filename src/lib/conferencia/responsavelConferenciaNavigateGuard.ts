/**
 * HX 8.2 (início) — navegação da conferência não reage a sync em background.
 */

export function responsavelPreservarAbaDuranteSync(input: {
  syncingForUi: boolean;
  vistaCooperado: boolean;
  temFiltroOuAba: boolean;
}): boolean {
  return input.syncingForUi && input.vistaCooperado && input.temFiltroOuAba;
}

export function responsavelBloquearNavegacaoConferencia(input: {
  syncingForUi: boolean;
  conferirModal: boolean;
  lancando: boolean;
}): boolean {
  return (input.syncingForUi && input.conferirModal) || input.lancando;
}
