export interface GastoCategoriaConfig {
  nombre: string;
  subcategorias: string[];
}

/** Código ISO 4217 de la divisa principal del usuario. */
export type DivisaCode = (typeof DIVISAS_DISPONIBLES)[number]['code'];

export interface DivisaOption {
  code: string;
  symbol: string;
  label: string;
}

export const DIVISAS_DISPONIBLES: readonly DivisaOption[] = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dólar estadounidense' },
  { code: 'GBP', symbol: '£', label: 'Libra esterlina' },
  { code: 'CHF', symbol: 'Fr.', label: 'Franco suizo' },
  { code: 'MXN', symbol: '$', label: 'Peso mexicano' },
  { code: 'ARS', symbol: '$', label: 'Peso argentino' },
  { code: 'COP', symbol: '$', label: 'Peso colombiano' },
  { code: 'CLP', symbol: '$', label: 'Peso chileno' },
  { code: 'BRL', symbol: 'R$', label: 'Real brasileño' },
  { code: 'CAD', symbol: '$', label: 'Dólar canadiense' },
  { code: 'JPY', symbol: '¥', label: 'Yen japonés' },
  { code: 'PLN', symbol: 'zł', label: 'Złoty polaco' },
] as const;

export const DEFAULT_DIVISA = 'EUR';

export function isDivisaCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DIVISAS_DISPONIBLES.some((d) => d.code === value)
  );
}

export function symbolForDivisa(code: string): string {
  return DIVISAS_DISPONIBLES.find((d) => d.code === code)?.symbol ?? code;
}

export interface CategoriasConfig {
  gastos: GastoCategoriaConfig[];
  ingresos: string[];
  /** Divisa en la que se muestran e introducen los importes. */
  divisa: string;
  onboardingCompleted: boolean;
}

export const DEFAULT_CATEGORIAS_CONFIG: CategoriasConfig = {
  onboardingCompleted: false,
  divisa: DEFAULT_DIVISA,
  gastos: [
    {
      nombre: 'Ocio',
      subcategorias: [
        'Padel/Tenis',
        'Gimnasio',
        'Golf',
        'Salir de fiesta',
        'Otros Ocio',
      ],
    },
    { nombre: 'Viajes', subcategorias: [] },
    {
      nombre: 'Comida',
      subcategorias: ['Pluxee', 'Otros Comida', 'Comer fuera'],
    },
    {
      nombre: 'Bebida',
      subcategorias: ['Cerveza', 'Alcohol', 'Otros Bebida'],
    },
    {
      nombre: 'Transporte',
      subcategorias: ['Uber', 'Gasolina', 'Wible', 'Abono'],
    },
    {
      nombre: 'Gastos propios',
      subcategorias: ['Gastos Propios', 'Resto Gastos'],
    },
  ],
  ingresos: ['Nómina', 'Retribución flexible', 'Otros', 'Venta Inversiones'],
};
