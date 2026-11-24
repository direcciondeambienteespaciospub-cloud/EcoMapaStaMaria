import type {ContainerStatus, LatLngPoint} from './types';

// ============================================================================
// CLAVE MAESTRA DE ADMINISTRACIÓN (Jefa de Área - Oficina de Ambiente)
// Modificar este valor si se requiere cambiar la contraseña maestra de ingreso.
// ============================================================================
export const ADMIN_MASTER_PASSWORD = 'ADMIN2026';

// Correo de Google principal autorizado como Jefa de Área / Administración en Firebase
export const BOOTSTRAP_ADMIN_EMAIL = 'direcciondeambienteespaciospub@gmail.com';

// Coordenadas centrales de Santa María, Catamarca, Argentina
export const SANTA_MARIA_CENTER: LatLngPoint = [-26.6939, -66.0494];

// Paleta de colores identificatorios únicos para empleados (alto contraste sobre OpenStreetMap)
export const EMPLOYEE_COLORS = [
  '#2563EB', // Azul
  '#EA580C', // Naranja
  '#7C3AED', // Violeta
  '#0284C7', // Celeste
  '#DB2777', // Magenta
  '#0D9488', // Turquesa
  '#B45309', // Ámbar oscuro
  '#4F46E5', // Índigo
  '#059669', // Esmeralda
  '#DC2626', // Carmesí
];

export const SANTA_MARIA_BARRIOS = [
  'Centro',
  'Chaquiago',
  'Loro Huasi',
  'San José',
  'Fuerte Quemado',
  'Chañar Punco',
  'Palo Seco',
  'Las Mojarras',
  'Lampacito',
  'El Puesto',
  'Medanitos',
  'La Soledad',
];

export const BARRIO_COORDS: Record<string, LatLngPoint> = {
  Centro: [-26.6939, -66.0494],
  Chaquiago: [-26.6835, -66.0462],
  'Loro Huasi': [-26.7138, -66.0575],
  'San José': [-26.7832, -66.0652],
  'Fuerte Quemado': [-26.6152, -66.0498],
  'Chañar Punco': [-26.7385, -66.0441],
  'Palo Seco': [-26.7052, -66.0385],
  'Las Mojarras': [-26.6522, -66.0472],
  Lampacito: [-26.6745, -66.0588],
  'El Puesto': [-26.7265, -66.0532],
  Medanitos: [-26.6885, -66.0321],
  'La Soledad': [-26.6988, -66.0604],
};

// Ruta de caminata simulada por calles céntricas de Santa María (para pruebas desde PC)
export const SIMULATION_WALK_PATH: LatLngPoint[] = [
  [-26.6939, -66.0494], // Plaza Manuel Belgrano / Esquiú
  [-26.6935, -66.0487],
  [-26.6931, -66.0480],
  [-26.6927, -66.0473], // Esquina Mitre
  [-26.6921, -66.0477],
  [-26.6915, -66.0481], // Av. 9 de Julio
  [-26.6919, -66.0489],
  [-26.6923, -66.0497],
  [-26.6927, -66.0505], // Belgrano y Sarmiento
  [-26.6933, -66.0501],
  [-26.6939, -66.0494],
  [-26.6945, -66.0490],
  [-26.6951, -66.0486],
  [-26.6955, -66.0494],
];

export const CONTAINER_STATUS_META: Record<
  ContainerStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    badgeBg: string;
    hex: string;
  }
> = {
  optimo: {
    label: 'Óptimo / Limpio',
    shortLabel: 'Óptimo',
    description: 'Contenedor en buen estado y con capacidad disponible.',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-600',
    textClass: 'text-emerald-900',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    hex: '#16A34A',
  },
  lleno: {
    label: 'Lleno / Requiere vaciado',
    shortLabel: 'Lleno',
    description: 'Capacidad al 90-100%. Programar recolección prioritaria.',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-600',
    textClass: 'text-amber-950',
    badgeBg: 'bg-amber-100 text-amber-950 border-amber-300',
    hex: '#D97706',
  },
  danado: {
    label: 'Dañado / Roto',
    shortLabel: 'Dañado',
    description: 'Tapa, ruedas o estructura averiada. Requiere reparación.',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-600',
    textClass: 'text-orange-950',
    badgeBg: 'bg-orange-100 text-orange-950 border-orange-300',
    hex: '#EA580C',
  },
  desbordado: {
    label: 'Desbordado / Basura alrededor',
    shortLabel: 'Desbordado',
    description: 'Residuos acumulados fuera del contenedor. Urgente.',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-600',
    textClass: 'text-red-950',
    badgeBg: 'bg-red-100 text-red-950 border-red-300',
    hex: '#DC2626',
  },
};
