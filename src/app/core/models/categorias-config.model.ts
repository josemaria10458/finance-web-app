export interface GastoCategoriaConfig {
  nombre: string;
  subcategorias: string[];
}

export interface CategoriasConfig {
  gastos: GastoCategoriaConfig[];
  ingresos: string[];
  onboardingCompleted: boolean;
}

export const DEFAULT_CATEGORIAS_CONFIG: CategoriasConfig = {
  onboardingCompleted: false,
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
