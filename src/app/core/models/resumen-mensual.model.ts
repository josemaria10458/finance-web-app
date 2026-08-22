export interface ResumenMensual {
  mesKey: string; // YYYY-MM
  mes: string; // "ene '26"
  ingresos: number;
  gastos: number;
  ahorroNeto: number;
  porcentajeAhorro: number;
  dineroInvertidoMes: number;
  resultadoNetoInversionesMes: number;
  rentabilidadMensualInversiones: number;
  impuestosProvisionados: number;
  balanceInversion: number;
  balancePatrimonio: number;
  dineroTotalFinMes: number;
}

export type RangoResumen = 'mes' | 'trimestre' | 'anio' | 'todo';
