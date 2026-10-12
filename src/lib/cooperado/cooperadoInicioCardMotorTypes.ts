/** Tipos do motor do card Início — sem dependência de política (evita ciclo no bundle). */

export type InicioCardMotorSnapshot = {
  mesLabel: string;
  valor: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
};
