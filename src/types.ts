export type ShiftRole = 'barredor' | 'recolector';

export type ContainerStatus = 'optimo' | 'lleno' | 'danado' | 'desbordado';

export type LatLngPoint = [number, number];

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dni: string;
  phone: string;
  birthDate: string;
  pin: string;
  color: string;
  createdAt: string;
}

export interface AdminProfile {
  fullName: string;
  roleTitle: string;
  phone: string;
  email: string;
  masterKey: string;
}

export interface SweeperSession {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeColor: string;
  role: 'barredor';
  active: boolean;
  startedAt: string;
  lastUpdatedAt: string;
  endedAt?: string;
  points: LatLngPoint[];
  distanceMeters: number;
}

export interface CollectorSession {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeColor: string;
  role: 'recolector';
  active: boolean;
  startedAt: string;
  lastUpdatedAt: string;
  endedAt?: string;
  currentLocation: LatLngPoint;
}

export interface ContainerRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
  barrio: string;
  reference: string;
  lat: number | null;
  lng: number | null;
  locationSource: 'gps' | 'manual';
  status: ContainerStatus;
  comment: string;
  photoDataUrl?: string;
}

export interface ContainerGroup {
  key: string;
  lat: number;
  lng: number;
  barrio: string;
  reference: string;
  latest: ContainerRecord;
  history: ContainerRecord[];
  hasTodayReport: boolean;
}

export interface AppDatabase {
  employees: Employee[];
  adminProfile: AdminProfile;
  sweeperSessions: SweeperSession[];
  collectorSessions: CollectorSession[];
  containers: ContainerRecord[];
}

export type AppView = 'auth' | 'role-select' | 'barredor' | 'recolector' | 'admin';

export type PresenceState = 'moving' | 'stopped' | 'offline';
