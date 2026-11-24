import type {User} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {ADMIN_MASTER_PASSWORD, BOOTSTRAP_ADMIN_EMAIL} from '../constants';
import {auth, db} from '../firebase';
import type {
  AdminProfile,
  CollectorSession,
  ContainerRecord,
  ContainerStatus,
  Employee,
  LatLngPoint,
  SweeperSession,
} from '../types';
import {
  computeRouteDistance,
  createDefaultAdminProfile,
  haversineDistanceMeters,
} from './storage';

export {BOOTSTRAP_ADMIN_EMAIL};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface FirestorePoint {
  lat: number;
  lng: number;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return new Date().toISOString();
}

function clampString(val: string, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = val.trim();
  if (trimmed.length < minLen) return fallback.slice(0, maxLen);
  return trimmed.slice(0, maxLen);
}

function toFirestorePoints(points: LatLngPoint[]): FirestorePoint[] {
  let bounded = points;
  if (bounded.length > 500) {
    const step = (bounded.length - 1) / 499;
    const sampled: LatLngPoint[] = [];
    for (let i = 0; i < 499; i++) {
      sampled.push(bounded[Math.round(i * step)]);
    }
    sampled.push(bounded[bounded.length - 1]);
    bounded = sampled;
  }
  return bounded.map(([lat, lng]) => ({lat, lng}));
}

function fromFirestorePoints(raw: unknown): LatLngPoint[] {
  if (!Array.isArray(raw)) return [];
  const pts: LatLngPoint[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as FirestorePoint).lat === 'number' &&
      typeof (item as FirestorePoint).lng === 'number'
    ) {
      pts.push([(item as FirestorePoint).lat, (item as FirestorePoint).lng]);
    }
  }
  return pts;
}

export async function checkIsAdminUser(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL) {
    return true;
  }
  const path = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface CloudSubscriptionsCallbacks {
  onEmployeesPublic: (employees: Employee[]) => void;
  onOwnPrivateInfo: (
    uid: string,
    priv: {dni: string; phone: string; birthDate: string; pin: string} | null,
  ) => void;
  onSweeperSessions: (sessions: SweeperSession[]) => void;
  onCollectorSessions: (sessions: CollectorSession[]) => void;
  onContainers: (containers: ContainerRecord[]) => void;
  onAdminProfile: (profile: AdminProfile) => void;
  onError: (err: Error) => void;
}

export function subscribeToEcoMapaData(
  user: User,
  isAdmin: boolean,
  callbacks: CloudSubscriptionsCallbacks,
): () => void {
  const unsubscribers: Array<() => void> = [];

  const safeReportError = (error: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(error, op, path);
    } catch (wrapped) {
      callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  // 1. Public operational employees list
  const empQuery = query(collection(db, 'employees'), where('uid', '>=', ''));
  unsubscribers.push(
    onSnapshot(
      empQuery,
      (snapshot) => {
        const list: Employee[] = snapshot.docs.map((d) => {
          const data = d.data({serverTimestamps: 'estimate'});
          return {
            id: d.id,
            firstName: String(data.firstName ?? ''),
            lastName: String(data.lastName ?? ''),
            fullName: String(data.fullName ?? ''),
            dni: '',
            phone: '',
            birthDate: '1990-01-01',
            pin: '',
            color: String(data.color ?? '#2563EB'),
            createdAt: toIsoString(data.createdAt),
          };
        });
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        callbacks.onEmployeesPublic(list);
      },
      (error) => safeReportError(error, OperationType.LIST, 'employees'),
    ),
  );

  // 2. Own private PII document (safe for any employee)
  const ownPrivPath = `employees/${user.uid}/private/info`;
  unsubscribers.push(
    onSnapshot(
      doc(db, 'employees', user.uid, 'private', 'info'),
      (snap) => {
        if (!snap.exists()) {
          callbacks.onOwnPrivateInfo(user.uid, null);
          return;
        }
        const d = snap.data();
        callbacks.onOwnPrivateInfo(user.uid, {
          dni: String(d.dni ?? ''),
          phone: String(d.phone ?? ''),
          birthDate: String(d.birthDate ?? '1990-01-01'),
          pin: String(d.pin ?? ''),
        });
      },
      (error) => safeReportError(error, OperationType.GET, ownPrivPath),
    ),
  );

  // 3. Real-time sweeping sessions
  const sweepQuery = query(
    collection(db, 'sweeperSessions'),
    where('role', '==', 'barredor'),
  );
  unsubscribers.push(
    onSnapshot(
      sweepQuery,
      (snapshot) => {
        const list: SweeperSession[] = snapshot.docs.map((d) => {
          const data = d.data({serverTimestamps: 'estimate'});
          return {
            id: d.id,
            employeeId: String(data.employeeId ?? ''),
            employeeName: String(data.employeeName ?? ''),
            employeeColor: String(data.employeeColor ?? '#2563EB'),
            role: 'barredor',
            active: Boolean(data.active),
            startedAt: toIsoString(data.startedAt),
            lastUpdatedAt: toIsoString(data.lastUpdatedAt),
            endedAt: data.endedAt ? toIsoString(data.endedAt) : undefined,
            points: fromFirestorePoints(data.points),
            distanceMeters: Number(data.distanceMeters ?? 0),
          };
        });
        list.sort(
          (a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime(),
        );
        callbacks.onSweeperSessions(list);
      },
      (error) => safeReportError(error, OperationType.LIST, 'sweeperSessions'),
    ),
  );

  // 4. Real-time collector sessions
  const collectQuery = query(
    collection(db, 'collectorSessions'),
    where('role', '==', 'recolector'),
  );
  unsubscribers.push(
    onSnapshot(
      collectQuery,
      (snapshot) => {
        const list: CollectorSession[] = snapshot.docs.map((d) => {
          const data = d.data({serverTimestamps: 'estimate'});
          return {
            id: d.id,
            employeeId: String(data.employeeId ?? ''),
            employeeName: String(data.employeeName ?? ''),
            employeeColor: String(data.employeeColor ?? '#7C3AED'),
            role: 'recolector',
            active: Boolean(data.active),
            startedAt: toIsoString(data.startedAt),
            lastUpdatedAt: toIsoString(data.lastUpdatedAt),
            currentLocation: [
              Number(data.currentLat ?? -26.6939),
              Number(data.currentLng ?? -66.0494),
            ],
          };
        });
        list.sort(
          (a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime(),
        );
        callbacks.onCollectorSessions(list);
      },
      (error) => safeReportError(error, OperationType.LIST, 'collectorSessions'),
    ),
  );

  // 5. Real-time waste containers
  const contQuery = query(
    collection(db, 'containers'),
    where('status', 'in', ['optimo', 'lleno', 'danado', 'desbordado']),
  );
  unsubscribers.push(
    onSnapshot(
      contQuery,
      (snapshot) => {
        const list: ContainerRecord[] = snapshot.docs.map((d) => {
          const data = d.data({serverTimestamps: 'estimate'});
          return {
            id: d.id,
            employeeId: String(data.employeeId ?? ''),
            employeeName: String(data.employeeName ?? ''),
            createdAt: toIsoString(data.createdAt),
            barrio: String(data.barrio ?? 'Centro'),
            reference: String(data.reference ?? ''),
            lat: typeof data.lat === 'number' ? data.lat : null,
            lng: typeof data.lng === 'number' ? data.lng : null,
            locationSource: data.locationSource === 'manual' ? 'manual' : 'gps',
            status: data.status as ContainerStatus,
            comment: String(data.comment ?? ''),
            photoDataUrl:
              typeof data.photoDataUrl === 'string' && data.photoDataUrl.length > 0
                ? data.photoDataUrl
                : undefined,
          };
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callbacks.onContainers(list);
      },
      (error) => safeReportError(error, OperationType.LIST, 'containers'),
    ),
  );

  // 6. Admin profile settings (STRICTLY only subscribed when isAdmin is true)
  if (isAdmin) {
    unsubscribers.push(
      onSnapshot(
        doc(db, 'settings', 'adminProfile'),
        (snap) => {
          if (!snap.exists()) {
            callbacks.onAdminProfile(createDefaultAdminProfile());
            return;
          }
          const d = snap.data();
          callbacks.onAdminProfile({
            fullName: String(d.fullName ?? 'Jefa de Área Ambiente'),
            roleTitle: String(d.roleTitle ?? 'Oficina de Ambiente · Municipalidad de Santa María'),
            phone: String(d.phone ?? ''),
            email: String(d.email ?? ''),
            masterKey: String(d.masterKey ?? ADMIN_MASTER_PASSWORD),
          });
        },
        (error) => safeReportError(error, OperationType.GET, 'settings/adminProfile'),
      ),
    );
  }

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

export async function fetchAllEmployeePrivateInfoForAdmin(
  employeeIds: string[],
): Promise<Record<string, {dni: string; phone: string; birthDate: string; pin: string}>> {
  const result: Record<string, {dni: string; phone: string; birthDate: string; pin: string}> = {};
  await Promise.all(
    employeeIds.map(async (empId) => {
      const path = `employees/${empId}/private/info`;
      try {
        const snap = await getDoc(doc(db, 'employees', empId, 'private', 'info'));
        if (snap.exists()) {
          const d = snap.data();
          result[empId] = {
            dni: String(d.dni ?? ''),
            phone: String(d.phone ?? ''),
            birthDate: String(d.birthDate ?? '1990-01-01'),
            pin: String(d.pin ?? ''),
          };
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }),
  );
  return result;
}

export async function grantAdminAccessInCloud(uid: string, email: string): Promise<void> {
  const cleanUid = uid.trim();
  const cleanEmail = email.trim().slice(0, 160);
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUid) || !cleanEmail.includes('@')) {
    throw new Error('UID o correo electrónico inválido para otorgar acceso administrativo.');
  }
  const path = `admins/${cleanUid}`;
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      email: cleanEmail,
      grantedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function ensureAdminProfileInCloud(): Promise<AdminProfile> {
  const path = 'settings/adminProfile';
  try {
    const ref = doc(db, 'settings', 'adminProfile');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      return {
        fullName: String(d.fullName ?? 'Jefa de Área Ambiente'),
        roleTitle: String(d.roleTitle ?? 'Oficina de Ambiente · Municipalidad de Santa María'),
        phone: String(d.phone ?? ''),
        email: String(d.email ?? ''),
        masterKey: String(d.masterKey ?? ADMIN_MASTER_PASSWORD),
      };
    }
    const defaults = createDefaultAdminProfile();
    await setDoc(ref, defaults);
    return defaults;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function registerEmployeeInCloud(
  uid: string,
  data: {
    firstName: string;
    lastName: string;
    dni: string;
    phone: string;
    birthDate: string;
    pin: string;
    color: string;
  },
): Promise<Employee> {
  const firstName = clampString(data.firstName, 2, 60, 'Empleado');
  const lastName = clampString(data.lastName, 1, 60, 'Municipal');
  const fullName = clampString(`${firstName} ${lastName}`, 2, 120, firstName);
  const dni = clampString(data.dni, 4, 20, '0000');
  const phone = clampString(data.phone, 6, 30, '3838-000000');
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(data.birthDate) ? data.birthDate : '1990-01-01';
  const pin = clampString(data.pin, 4, 32, '1234');
  const color = /^#[0-9A-Fa-f]{6}$/.test(data.color) ? data.color : '#2563EB';

  const pubRef = doc(db, 'employees', uid);
  const privRef = doc(db, 'employees', uid, 'private', 'info');

  try {
    const existingPub = await getDoc(pubRef);
    const batch = writeBatch(db);
    if (existingPub.exists()) {
      batch.update(pubRef, {firstName, lastName, fullName, color});
      const existingPriv = await getDoc(privRef);
      if (existingPriv.exists()) {
        batch.update(privRef, {dni, phone, birthDate, pin});
      } else {
        batch.set(privRef, {uid, dni, phone, birthDate, pin});
      }
    } else {
      batch.set(pubRef, {
        uid,
        firstName,
        lastName,
        fullName,
        color,
        createdAt: serverTimestamp(),
      });
      batch.set(privRef, {uid, dni, phone, birthDate, pin});
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `employees/${uid}`);
  }

  return {
    id: uid,
    firstName,
    lastName,
    fullName,
    dni,
    phone,
    birthDate,
    pin,
    color,
    createdAt: new Date().toISOString(),
  };
}

export async function startSweeperSessionInCloud(
  employee: Employee,
  initialPoint: LatLngPoint,
  existingSessions: SweeperSession[],
): Promise<SweeperSession> {
  const sessionId = `sweep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const activeMine = existingSessions.filter(
    (s) => s.employeeId === employee.id && s.active,
  );

  try {
    const batch = writeBatch(db);
    for (const old of activeMine) {
      batch.update(doc(db, 'sweeperSessions', old.id), {
        active: false,
        endedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
      });
    }
    batch.set(doc(db, 'sweeperSessions', sessionId), {
      employeeId: employee.id,
      employeeName: clampString(employee.fullName, 2, 120, 'Barrendero'),
      employeeColor: /^#[0-9A-Fa-f]{6}$/.test(employee.color) ? employee.color : '#2563EB',
      role: 'barredor',
      active: true,
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      points: [{lat: initialPoint[0], lng: initialPoint[1]}],
      distanceMeters: 0,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `sweeperSessions/${sessionId}`);
  }

  const now = new Date().toISOString();
  return {
    id: sessionId,
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeColor: employee.color,
    role: 'barredor',
    active: true,
    startedAt: now,
    lastUpdatedAt: now,
    points: [initialPoint],
    distanceMeters: 0,
  };
}

export async function appendSweeperPointInCloud(
  session: SweeperSession,
  point: LatLngPoint,
): Promise<LatLngPoint[]> {
  if (!session.active) return session.points;

  const last = session.points[session.points.length - 1];
  const moved = !last || haversineDistanceMeters(last, point) >= 6;

  const nextPoints = moved ? [...session.points, point] : session.points;
  const firestorePoints = toFirestorePoints(nextPoints);
  const normalizedPoints: LatLngPoint[] = firestorePoints.map((p) => [p.lat, p.lng]);
  const distanceMeters = Math.min(500000, Math.max(0, computeRouteDistance(normalizedPoints)));

  const path = `sweeperSessions/${session.id}`;
  try {
    await updateDoc(doc(db, 'sweeperSessions', session.id), {
      points: firestorePoints,
      distanceMeters,
      lastUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  return normalizedPoints;
}

export async function finishSweeperSessionInCloud(sessionId: string): Promise<void> {
  const path = `sweeperSessions/${sessionId}`;
  try {
    await updateDoc(doc(db, 'sweeperSessions', sessionId), {
      active: false,
      endedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function upsertCollectorLocationInCloud(
  employee: Employee,
  location: LatLngPoint,
  existingSessions: CollectorSession[],
): Promise<void> {
  const activeMine = existingSessions.find((c) => c.employeeId === employee.id && c.active);
  if (activeMine) {
    const path = `collectorSessions/${activeMine.id}`;
    try {
      await updateDoc(doc(db, 'collectorSessions', activeMine.id), {
        currentLat: location[0],
        currentLng: location[1],
        lastUpdatedAt: serverTimestamp(),
        active: true,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  const sessionId = `collect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `collectorSessions/${sessionId}`;
  try {
    await setDoc(doc(db, 'collectorSessions', sessionId), {
      employeeId: employee.id,
      employeeName: clampString(employee.fullName, 2, 120, 'Recolector'),
      employeeColor: /^#[0-9A-Fa-f]{6}$/.test(employee.color) ? employee.color : '#7C3AED',
      role: 'recolector',
      active: true,
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      currentLat: location[0],
      currentLng: location[1],
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function registerContainerInCloud(
  employee: Employee,
  data: {
    barrio: string;
    reference: string;
    lat: number | null;
    lng: number | null;
    locationSource: 'gps' | 'manual';
    status: ContainerStatus;
    comment: string;
    photoDataUrl?: string;
  },
): Promise<ContainerRecord> {
  const containerId = `cont-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const barrio = clampString(data.barrio, 2, 80, 'Centro');
  const reference = clampString(data.reference, 1, 200, `Punto en ${barrio}`);
  const comment = data.comment.trim().slice(0, 500);
  const validPhoto =
    data.photoDataUrl && data.photoDataUrl.length <= 350000 ? data.photoDataUrl : undefined;

  const payload: Record<string, unknown> = {
    employeeId: employee.id,
    employeeName: clampString(employee.fullName, 2, 120, 'Recolector'),
    createdAt: serverTimestamp(),
    barrio,
    reference,
    lat: data.lat,
    lng: data.lng,
    locationSource: data.locationSource,
    status: data.status,
    comment,
  };
  if (validPhoto) {
    payload.photoDataUrl = validPhoto;
  }

  const path = `containers/${containerId}`;
  try {
    await setDoc(doc(db, 'containers', containerId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: containerId,
    employeeId: employee.id,
    employeeName: employee.fullName,
    createdAt: new Date().toISOString(),
    barrio,
    reference,
    lat: data.lat,
    lng: data.lng,
    locationSource: data.locationSource,
    status: data.status,
    comment,
    photoDataUrl: validPhoto,
  };
}

export async function updateAdminProfileInCloud(profile: AdminProfile): Promise<void> {
  const path = 'settings/adminProfile';
  try {
    await setDoc(doc(db, 'settings', 'adminProfile'), {
      fullName: clampString(profile.fullName, 2, 120, 'Jefa de Área Ambiente'),
      roleTitle: clampString(
        profile.roleTitle,
        2,
        160,
        'Oficina de Ambiente · Municipalidad de Santa María',
      ),
      phone: profile.phone.trim().slice(0, 30),
      email: profile.email.trim().slice(0, 160),
      masterKey: clampString(profile.masterKey, 4, 64, ADMIN_MASTER_PASSWORD),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateEmployeeInCloud(
  updated: Employee,
  sweeperSessions: SweeperSession[],
  collectorSessions: CollectorSession[],
  containers: ContainerRecord[],
): Promise<void> {
  const firstName = clampString(updated.firstName, 2, 60, 'Empleado');
  const lastName = clampString(updated.lastName, 1, 60, 'Municipal');
  const fullName = clampString(`${firstName} ${lastName}`, 2, 120, firstName);
  const color = /^#[0-9A-Fa-f]{6}$/.test(updated.color) ? updated.color : '#2563EB';
  const dni = clampString(updated.dni, 4, 20, '0000');
  const phone = clampString(updated.phone, 6, 30, '3838-000000');
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(updated.birthDate)
    ? updated.birthDate
    : '1990-01-01';
  const pin = clampString(updated.pin, 4, 32, '1234');

  const path = `employees/${updated.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'employees', updated.id), {
      firstName,
      lastName,
      fullName,
      color,
    });
    batch.update(doc(db, 'employees', updated.id, 'private', 'info'), {
      dni,
      phone,
      birthDate,
      pin,
    });

    for (const s of sweeperSessions) {
      if (s.employeeId === updated.id && (s.employeeName !== fullName || s.employeeColor !== color)) {
        batch.update(doc(db, 'sweeperSessions', s.id), {
          employeeName: fullName,
          employeeColor: color,
          lastUpdatedAt: serverTimestamp(),
        });
      }
    }

    for (const c of collectorSessions) {
      if (c.employeeId === updated.id && (c.employeeName !== fullName || c.employeeColor !== color)) {
        batch.update(doc(db, 'collectorSessions', c.id), {
          employeeName: fullName,
          employeeColor: color,
          lastUpdatedAt: serverTimestamp(),
        });
      }
    }

    for (const r of containers) {
      if (r.employeeId === updated.id && r.employeeName !== fullName) {
        batch.update(doc(db, 'containers', r.id), {
          employeeName: fullName,
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function seedDemoDataInCloud(): Promise<void> {
  const ts = Date.now();
  const demoEmpIds = ['emp-carlos-mamani', 'emp-laura-yapura', 'emp-martin-chaile'];

  try {
    // Delete previous demo employee docs if they exist so batch.set acts cleanly as create
    for (const empId of demoEmpIds) {
      const privSnap = await getDoc(doc(db, 'employees', empId, 'private', 'info'));
      if (privSnap.exists()) {
        await deleteDoc(doc(db, 'employees', empId, 'private', 'info'));
      }
      const pubSnap = await getDoc(doc(db, 'employees', empId));
      if (pubSnap.exists()) {
        await deleteDoc(doc(db, 'employees', empId));
      }
    }

    // Remove previous seed sessions/containers created by demo seeder
    const prevSweeps = await getDocs(
      query(collection(db, 'sweeperSessions'), where('role', '==', 'barredor')),
    );
    for (const d of prevSweeps.docs) {
      if (d.id.startsWith('sweep-seed-')) {
        await deleteDoc(doc(db, 'sweeperSessions', d.id));
      }
    }
    const prevCollects = await getDocs(
      query(collection(db, 'collectorSessions'), where('role', '==', 'recolector')),
    );
    for (const d of prevCollects.docs) {
      if (d.id.startsWith('collect-seed-')) {
        await deleteDoc(doc(db, 'collectorSessions', d.id));
      }
    }
    const prevConts = await getDocs(
      query(
        collection(db, 'containers'),
        where('status', 'in', ['optimo', 'lleno', 'danado', 'desbordado']),
      ),
    );
    for (const d of prevConts.docs) {
      if (d.id.startsWith('cont-seed-')) {
        await deleteDoc(doc(db, 'containers', d.id));
      }
    }

    const batch = writeBatch(db);

    const demoEmployees = [
      {
        id: 'emp-carlos-mamani',
        firstName: 'Carlos',
        lastName: 'Mamani',
        fullName: 'Carlos Mamani',
        dni: '32456789',
        phone: '3838-412033',
        birthDate: '1988-05-14',
        pin: '1234',
        color: '#2563EB',
      },
      {
        id: 'emp-laura-yapura',
        firstName: 'Laura',
        lastName: 'Yapura',
        fullName: 'Laura Yapura',
        dni: '35112233',
        phone: '3838-498120',
        birthDate: '1991-09-22',
        pin: '1234',
        color: '#EA580C',
      },
      {
        id: 'emp-martin-chaile',
        firstName: 'Martín',
        lastName: 'Chaile',
        fullName: 'Martín Chaile',
        dni: '29876543',
        phone: '3838-445566',
        birthDate: '1984-11-03',
        pin: '1234',
        color: '#7C3AED',
      },
    ];

    for (const emp of demoEmployees) {
      batch.set(doc(db, 'employees', emp.id), {
        uid: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        fullName: emp.fullName,
        color: emp.color,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'employees', emp.id, 'private', 'info'), {
        uid: emp.id,
        dni: emp.dni,
        phone: emp.phone,
        birthDate: emp.birthDate,
        pin: emp.pin,
      });
    }

    batch.set(doc(db, 'sweeperSessions', `sweep-seed-1-${ts}`), {
      employeeId: 'emp-carlos-mamani',
      employeeName: 'Carlos Mamani',
      employeeColor: '#2563EB',
      role: 'barredor',
      active: true,
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      points: [
        {lat: -26.6948, lng: -66.0512},
        {lat: -26.6942, lng: -66.0504},
        {lat: -26.6937, lng: -66.0496},
        {lat: -26.6932, lng: -66.0488},
        {lat: -26.6926, lng: -66.0480},
        {lat: -26.6920, lng: -66.0474},
      ],
      distanceMeters: 495,
    });

    batch.set(doc(db, 'sweeperSessions', `sweep-seed-2-${ts}`), {
      employeeId: 'emp-laura-yapura',
      employeeName: 'Laura Yapura',
      employeeColor: '#EA580C',
      role: 'barredor',
      active: true,
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      points: [
        {lat: -26.6956, lng: -66.0482},
        {lat: -26.6950, lng: -66.0475},
        {lat: -26.6943, lng: -66.0468},
        {lat: -26.6936, lng: -66.0462},
      ],
      distanceMeters: 310,
    });

    batch.set(doc(db, 'collectorSessions', `collect-seed-1-${ts}`), {
      employeeId: 'emp-martin-chaile',
      employeeName: 'Martín Chaile',
      employeeColor: '#7C3AED',
      role: 'recolector',
      active: true,
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      currentLat: -26.6882,
      currentLng: -66.0471,
    });

    const demoContainers = [
      {
        id: `cont-seed-1-${ts}`,
        employeeId: 'emp-martin-chaile',
        employeeName: 'Martín Chaile',
        barrio: 'Centro',
        reference: 'Av. 9 de Julio y Mitre (frente a Plaza Belgrano)',
        lat: -26.6934,
        lng: -66.0489,
        locationSource: 'gps',
        status: 'optimo',
        comment: 'Contenedor recién vaciado y lavado, tapa en perfecto estado.',
      },
      {
        id: `cont-seed-2-${ts}`,
        employeeId: 'emp-martin-chaile',
        employeeName: 'Martín Chaile',
        barrio: 'Centro',
        reference: 'Calle San Martín 340, esquina Esquiú',
        lat: -26.6951,
        lng: -66.0474,
        locationSource: 'gps',
        status: 'lleno',
        comment: 'Al 95% de su capacidad tras feria vecinal. Requiere vaciado en turno tarde.',
      },
      {
        id: `cont-seed-3-${ts}`,
        employeeId: 'emp-martin-chaile',
        employeeName: 'Martín Chaile',
        barrio: 'Chaquiago',
        reference: 'Ruta Provincial 39, acceso a Escuela de Chaquiago',
        lat: -26.6838,
        lng: -66.0465,
        locationSource: 'manual',
        status: 'danado',
        comment: 'Tapa rota y falta rueda trasera izquierda. Se mantiene estable pero necesita taller.',
      },
      {
        id: `cont-seed-4-${ts}`,
        employeeId: 'emp-martin-chaile',
        employeeName: 'Martín Chaile',
        barrio: 'Loro Huasi',
        reference: 'Av. Calchaquí y calle Principal, parada de colectivo',
        lat: -26.7135,
        lng: -66.0572,
        locationSource: 'gps',
        status: 'desbordado',
        comment: 'Bolsas y restos de poda acumulados alrededor del contenedor. Se requiere camión auxiliar.',
      },
    ];

    for (const c of demoContainers) {
      batch.set(doc(db, 'containers', c.id), {
        employeeId: c.employeeId,
        employeeName: c.employeeName,
        createdAt: serverTimestamp(),
        barrio: c.barrio,
        reference: c.reference,
        lat: c.lat,
        lng: c.lng,
        locationSource: c.locationSource,
        status: c.status,
        comment: c.comment,
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedDemoData');
  }
}
