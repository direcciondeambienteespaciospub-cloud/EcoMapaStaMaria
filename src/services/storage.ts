import {ADMIN_MASTER_PASSWORD, EMPLOYEE_COLORS} from '../constants';
import type {
  AdminProfile,
  AppDatabase,
  CollectorSession,
  ContainerGroup,
  ContainerRecord,
  Employee,
  LatLngPoint,
  PresenceState,
  SweeperSession,
} from '../types';

const DB_KEY = 'ecogestion_santamaria_db_v1';
const CURRENT_EMP_KEY = 'ecogestion_santamaria_current_employee_v1';
const REMEMBERED_EMP_KEY = 'ecogestion_santamaria_remembered_employee_v1';
const SYNC_CHANNEL_NAME = 'ecogestion_santamaria_realtime_sync';

const broadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel(SYNC_CHANNEL_NAME)
    : null;

function minutesAgoISO(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function createDefaultAdminProfile(): AdminProfile {
  return {
    fullName: 'Jefa de Área Ambiente',
    roleTitle: 'Oficina de Ambiente · Municipalidad de Santa María',
    phone: '3838-420100',
    email: 'ambiente@santamaria.gob.ar',
    masterKey: ADMIN_MASTER_PASSWORD,
  };
}

export function createSeedDatabase(): AppDatabase {
  const emp1: Employee = {
    id: 'emp-carlos-mamani',
    firstName: 'Carlos',
    lastName: 'Mamani',
    fullName: 'Carlos Mamani',
    dni: '32456789',
    phone: '3838-412033',
    birthDate: '1988-05-14',
    pin: '1234',
    color: '#2563EB', // Azul
    createdAt: minutesAgoISO(240),
  };

  const emp2: Employee = {
    id: 'emp-laura-yapura',
    firstName: 'Laura',
    lastName: 'Yapura',
    fullName: 'Laura Yapura',
    dni: '35112233',
    phone: '3838-498120',
    birthDate: '1991-09-22',
    pin: '1234',
    color: '#EA580C', // Naranja
    createdAt: minutesAgoISO(240),
  };

  const emp3: Employee = {
    id: 'emp-martin-chaile',
    firstName: 'Martín',
    lastName: 'Chaile',
    fullName: 'Martín Chaile',
    dni: '29876543',
    phone: '3838-445566',
    birthDate: '1984-11-03',
    pin: '1234',
    color: '#7C3AED', // Violeta
    createdAt: minutesAgoISO(240),
  };

  const sweeper1: SweeperSession = {
    id: 'sweep-seed-1',
    employeeId: emp1.id,
    employeeName: emp1.fullName,
    employeeColor: emp1.color,
    role: 'barredor',
    active: true,
    startedAt: minutesAgoISO(75),
    lastUpdatedAt: minutesAgoISO(2),
    points: [
      [-26.6948, -66.0512],
      [-26.6942, -66.0504],
      [-26.6937, -66.0496],
      [-26.6932, -66.0488],
      [-26.6926, -66.0480],
      [-26.6920, -66.0474],
    ],
    distanceMeters: 495,
  };

  const sweeper2: SweeperSession = {
    id: 'sweep-seed-2',
    employeeId: emp2.id,
    employeeName: emp2.fullName,
    employeeColor: emp2.color,
    role: 'barredor',
    active: true,
    startedAt: minutesAgoISO(90),
    lastUpdatedAt: minutesAgoISO(22), // Detenido > 15 min
    points: [
      [-26.6956, -66.0482],
      [-26.6950, -66.0475],
      [-26.6943, -66.0468],
      [-26.6936, -66.0462],
    ],
    distanceMeters: 310,
  };

  const collector1: CollectorSession = {
    id: 'collect-seed-1',
    employeeId: emp3.id,
    employeeName: emp3.fullName,
    employeeColor: emp3.color,
    role: 'recolector',
    active: true,
    startedAt: minutesAgoISO(65),
    lastUpdatedAt: minutesAgoISO(4),
    currentLocation: [-26.6882, -66.0471],
  };

  const containers: ContainerRecord[] = [
    {
      id: 'cont-seed-1',
      employeeId: emp3.id,
      employeeName: emp3.fullName,
      createdAt: minutesAgoISO(58),
      barrio: 'Centro',
      reference: 'Av. 9 de Julio y Mitre (frente a Plaza Belgrano)',
      lat: -26.6934,
      lng: -66.0489,
      locationSource: 'gps',
      status: 'optimo',
      comment: 'Contenedor recién vaciado y lavado, tapa en perfecto estado.',
    },
    {
      id: 'cont-seed-2',
      employeeId: emp3.id,
      employeeName: emp3.fullName,
      createdAt: minutesAgoISO(41),
      barrio: 'Centro',
      reference: 'Calle San Martín 340, esquina Esquiú',
      lat: -26.6951,
      lng: -66.0474,
      locationSource: 'gps',
      status: 'lleno',
      comment: 'Al 95% de su capacidad tras feria vecinal. Requiere vaciado en turno tarde.',
    },
    {
      id: 'cont-seed-3',
      employeeId: emp3.id,
      employeeName: emp3.fullName,
      createdAt: minutesAgoISO(24),
      barrio: 'Chaquiago',
      reference: 'Ruta Provincial 39, acceso a Escuela de Chaquiago',
      lat: -26.6838,
      lng: -66.0465,
      locationSource: 'manual',
      status: 'danado',
      comment: 'Tapa rota y falta rueda trasera izquierda. Se mantiene estable pero necesita taller.',
    },
    {
      id: 'cont-seed-4',
      employeeId: emp3.id,
      employeeName: emp3.fullName,
      createdAt: minutesAgoISO(9),
      barrio: 'Loro Huasi',
      reference: 'Av. Calchaquí y calle Principal, parada de colectivo',
      lat: -26.7135,
      lng: -66.0572,
      locationSource: 'gps',
      status: 'desbordado',
      comment: 'Bolsas y restos de poda acumulados alrededor del contenedor. Se requiere camión auxiliar.',
    },
  ];

  return {
    employees: [emp1, emp2, emp3],
    adminProfile: createDefaultAdminProfile(),
    sweeperSessions: [sweeper1, sweeper2],
    collectorSessions: [collector1],
    containers,
  };
}

function normalizeEmployee(emp: Partial<Employee> & {id: string; fullName: string}): Employee {
  const parts = emp.fullName.trim().split(/\s+/);
  const firstName = emp.firstName?.trim() || parts[0] || emp.fullName;
  const lastName = emp.lastName?.trim() || parts.slice(1).join(' ') || '';
  return {
    id: emp.id,
    firstName,
    lastName,
    fullName: `${firstName}${lastName ? ` ${lastName}` : ''}`.trim(),
    dni: emp.dni ?? '',
    phone: emp.phone ?? '',
    birthDate: emp.birthDate ?? '1990-01-01',
    pin: emp.pin ?? '1234',
    color: emp.color ?? '#2563EB',
    createdAt: emp.createdAt ?? new Date().toISOString(),
  };
}

export function loadDatabase(): AppDatabase {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const seed = createSeedDatabase();
      localStorage.setItem(DB_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    if (!parsed.employees || parsed.employees.length === 0) {
      const seed = createSeedDatabase();
      localStorage.setItem(DB_KEY, JSON.stringify(seed));
      return seed;
    }
    return {
      employees: parsed.employees.map(normalizeEmployee),
      adminProfile: parsed.adminProfile
        ? {...createDefaultAdminProfile(), ...parsed.adminProfile}
        : createDefaultAdminProfile(),
      sweeperSessions: parsed.sweeperSessions ?? [],
      collectorSessions: parsed.collectorSessions ?? [],
      containers: parsed.containers ?? [],
    };
  } catch {
    return createSeedDatabase();
  }
}

export function saveDatabase(db: AppDatabase): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  broadcastChannel?.postMessage({type: 'DB_UPDATED', timestamp: Date.now()});
}

export function subscribeToDatabaseSync(onSync: (db: AppDatabase) => void): () => void {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === DB_KEY) {
      onSync(loadDatabase());
    }
  };

  const handleBroadcast = (e: MessageEvent) => {
    if (e.data?.type === 'DB_UPDATED') {
      onSync(loadDatabase());
    }
  };

  window.addEventListener('storage', handleStorage);
  broadcastChannel?.addEventListener('message', handleBroadcast);

  return () => {
    window.removeEventListener('storage', handleStorage);
    broadcastChannel?.removeEventListener('message', handleBroadcast);
  };
}

export function loadCurrentEmployeeId(): string | null {
  return localStorage.getItem(CURRENT_EMP_KEY);
}

export function saveCurrentEmployeeId(employeeId: string | null): void {
  if (employeeId) {
    localStorage.setItem(CURRENT_EMP_KEY, employeeId);
    localStorage.setItem(REMEMBERED_EMP_KEY, employeeId);
  } else {
    localStorage.removeItem(CURRENT_EMP_KEY);
  }
}

export function loadRememberedEmployeeId(): string | null {
  return localStorage.getItem(REMEMBERED_EMP_KEY);
}

export function saveRememberedEmployeeId(employeeId: string | null): void {
  if (employeeId) {
    localStorage.setItem(REMEMBERED_EMP_KEY, employeeId);
  } else {
    localStorage.removeItem(REMEMBERED_EMP_KEY);
  }
}

export function getTimeGreeting(firstName: string, date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 13) {
    return `Buenos días, ${firstName}`;
  }
  if (hour >= 13 && hour < 20) {
    return `Buenas tardes, ${firstName}`;
  }
  return `Buenas noches, ${firstName}`;
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension: number = 640,
  quality: number = 0.68,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no válido.'));
      img.onload = () => {
        let dim = maxDimension;
        let q = quality;
        let result = '';

        for (let attempt = 0; attempt < 4; attempt++) {
          const scale = Math.min(1, dim / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo procesar la imagen.'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          result = canvas.toDataURL('image/jpeg', q);
          if (result.length <= 340000) {
            resolve(result);
            return;
          }
          dim = Math.round(dim * 0.75);
          q = Math.max(0.35, q - 0.12);
        }

        if (result.length <= 350000) {
          resolve(result);
        } else {
          reject(new Error('La imagen supera el tamaño máximo permitido para la nube.'));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function assignUniqueColor(existingEmployees: Employee[]): string {
  const used = new Set(existingEmployees.map((e) => e.color.toUpperCase()));
  const available = EMPLOYEE_COLORS.find((c) => !used.has(c.toUpperCase()));
  if (available) return available;
  return EMPLOYEE_COLORS[existingEmployees.length % EMPLOYEE_COLORS.length];
}

export function haversineDistanceMeters(a: LatLngPoint, b: LatLngPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function computeRouteDistance(points: LatLngPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceMeters(points[i - 1], points[i]);
  }
  return Math.round(total);
}

export function getPresenceState(
  active: boolean,
  lastUpdatedAt: string,
  nowMs: number = Date.now(),
): {state: PresenceState; minutesIdle: number; label: string} {
  if (!active) {
    return {
      state: 'offline',
      minutesIdle: 0,
      label: 'Fuera de servicio',
    };
  }
  const diffMs = Math.max(0, nowMs - new Date(lastUpdatedAt).getTime());
  const minutesIdle = Math.floor(diffMs / 60_000);
  if (minutesIdle >= 15) {
    return {
      state: 'stopped',
      minutesIdle,
      label: `Detenido hace ${minutesIdle} min`,
    };
  }
  return {
    state: 'moving',
    minutesIdle,
    label: 'En movimiento',
  };
}

export function formatDateTimeAR(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatTimeAR(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getLocalDateKeyAR(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTodayAR(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function groupContainersByLocation(
  records: ContainerRecord[],
  radiusMeters: number = 25,
): ContainerGroup[] {
  // Anchor each permanent container using the earliest record's coordinates so pins never drift
  const chronological = [...records]
    .filter((r) => r.lat !== null && r.lng !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const groups: ContainerGroup[] = [];

  for (const r of chronological) {
    const lat = r.lat as number;
    const lng = r.lng as number;
    const match = groups.find(
      (g) => haversineDistanceMeters([g.lat, g.lng], [lat, lng]) <= radiusMeters,
    );
    if (match) {
      match.history.push(r);
    } else {
      groups.push({
        key: r.id,
        lat,
        lng,
        barrio: r.barrio,
        reference: r.reference,
        latest: r,
        history: [r],
        hasTodayReport: false,
      });
    }
  }

  // Sort each container's daily history newest first and refresh latest metadata
  for (const g of groups) {
    g.history.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    g.latest = g.history[0];
    g.barrio = g.latest.barrio;
    g.reference = g.latest.reference;
    g.hasTodayReport = g.history.some((item) => isTodayAR(item.createdAt));
  }

  return groups.sort(
    (a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime(),
  );
}

function escapeCsvCell(value: string): string {
  const clean = value.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${clean}"`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadCsvFile(filename: string, headers: string[], rows: string[][]): void {
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCsvCell).join(';'), ...rows.map((r) => r.map(escapeCsvCell).join(';'))].join(
      '\n',
    );
  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportContainersToCSV(records: ContainerRecord[]): void {
  const headers = [
    'ID Registro',
    'Fecha y Hora',
    'Empleado',
    'Barrio / Zona',
    'Calle / Referencia',
    'Origen Ubicación',
    'Latitud',
    'Longitud',
    'Enlace Google Maps',
    'Estado',
    'Foto Adjunta',
    'Comentario Detallado',
  ];

  const statusLabels: Record<ContainerRecord['status'], string> = {
    optimo: 'Óptimo / Limpio',
    lleno: 'Lleno / Requiere vaciado',
    danado: 'Dañado / Roto',
    desbordado: 'Desbordado / Basura alrededor',
  };

  const rows = records.map((r) => {
    const mapsUrl =
      r.lat !== null && r.lng !== null
        ? `https://www.google.com/maps?q=${r.lat.toFixed(6)},${r.lng.toFixed(6)}`
        : 'Sin coordenadas GPS';
    return [
      r.id,
      formatDateTimeAR(r.createdAt),
      r.employeeName,
      r.barrio,
      r.reference,
      r.locationSource === 'gps' ? 'GPS' : 'Manual',
      r.lat !== null ? r.lat.toFixed(6) : '',
      r.lng !== null ? r.lng.toFixed(6) : '',
      mapsUrl,
      statusLabels[r.status],
      r.photoDataUrl ? 'Sí' : 'No',
      r.comment,
    ];
  });

  const dateStamp = getLocalDateKeyAR(new Date().toISOString());
  downloadCsvFile(`EcoMapa_SantaMaria_Contenedores_${dateStamp}.csv`, headers, rows);
}

export function exportSweepersToCSV(sessions: SweeperSession[]): void {
  const headers = [
    'ID Jornada',
    'Empleado',
    'Inicio',
    'Último Movimiento',
    'Fin',
    'Estado',
    'Metros Recorridos',
    'Puntos GPS',
  ];

  const rows = sessions.map((s) => [
    s.id,
    s.employeeName,
    formatDateTimeAR(s.startedAt),
    formatDateTimeAR(s.lastUpdatedAt),
    s.endedAt ? formatDateTimeAR(s.endedAt) : 'En curso',
    s.active ? 'En recorrido activo' : 'Finalizado',
    String(s.distanceMeters),
    String(s.points.length),
  ]);

  const dateStamp = getLocalDateKeyAR(new Date().toISOString());
  downloadCsvFile(`EcoMapa_SantaMaria_Barrido_${dateStamp}.csv`, headers, rows);
}

export function exportEmployeesToCSV(employees: Employee[]): void {
  const headers = [
    'ID Usuario',
    'Nombre',
    'Apellido',
    'Nombre Completo',
    'DNI / Legajo',
    'Teléfono',
    'Fecha de Nacimiento',
    'Color Asignado',
    'Fecha de Registro',
  ];

  const rows = employees.map((e) => [
    e.id,
    e.firstName,
    e.lastName,
    e.fullName,
    e.dni,
    e.phone,
    e.birthDate,
    e.color,
    formatDateTimeAR(e.createdAt),
  ]);

  const dateStamp = getLocalDateKeyAR(new Date().toISOString());
  downloadCsvFile(`EcoMapa_SantaMaria_Personal_${dateStamp}.csv`, headers, rows);
}
