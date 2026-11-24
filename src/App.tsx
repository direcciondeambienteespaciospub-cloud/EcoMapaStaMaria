/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {onAuthStateChanged, type User} from 'firebase/auth';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AdminDashboard} from './components/AdminDashboard';
import {AppHeader} from './components/AppHeader';
import {AuthScreen} from './components/AuthScreen';
import {CollectorMode} from './components/CollectorMode';
import {RoleSelectorScreen} from './components/RoleSelectorScreen';
import {SweeperMode} from './components/SweeperMode';
import {auth} from './firebase';
import {
  appendSweeperPointInCloud,
  checkIsAdminUser,
  fetchAllEmployeePrivateInfoForAdmin,
  finishSweeperSessionInCloud,
  registerContainerInCloud,
  registerEmployeeInCloud,
  seedDemoDataInCloud,
  startSweeperSessionInCloud,
  subscribeToEcoMapaData,
  updateAdminProfileInCloud,
  updateEmployeeInCloud,
  upsertCollectorLocationInCloud,
} from './services/firebaseDb';
import {
  assignUniqueColor,
  createDefaultAdminProfile,
  haversineDistanceMeters,
  loadCurrentEmployeeId,
  saveCurrentEmployeeId,
} from './services/storage';
import type {
  AdminProfile,
  AppDatabase,
  AppView,
  CollectorSession,
  ContainerRecord,
  ContainerStatus,
  Employee,
  LatLngPoint,
  ShiftRole,
  SweeperSession,
} from './types';

interface PrivatePiiMap {
  [uid: string]: {dni: string; phone: string; birthDate: string; pin: string};
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudError, setCloudError] = useState<Error | null>(null);

  const [employeesPublic, setEmployeesPublic] = useState<Employee[]>([]);
  const [ownPrivateInfo, setOwnPrivateInfo] = useState<{
    uid: string;
    dni: string;
    phone: string;
    birthDate: string;
    pin: string;
  } | null>(null);
  const [adminPrivateMap, setAdminPrivateMap] = useState<PrivatePiiMap>({});
  const [sweeperSessions, setSweeperSessions] = useState<SweeperSession[]>([]);
  const [collectorSessions, setCollectorSessions] = useState<CollectorSession[]>([]);
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>(() =>
    createDefaultAdminProfile(),
  );

  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(() =>
    loadCurrentEmployeeId(),
  );
  const [view, setView] = useState<AppView>('auth');

  // Refs to avoid stale closures in GPS watchers
  const sweeperSessionsRef = useRef<SweeperSession[]>([]);
  const collectorSessionsRef = useRef<CollectorSession[]>([]);
  const pendingPointsRef = useRef<Record<string, LatLngPoint[]>>({});
  const lastCollectorWriteRef = useRef<{lat: number; lng: number; at: number} | null>(null);

  sweeperSessionsRef.current = sweeperSessions;
  collectorSessionsRef.current = collectorSessions;

  if (cloudError) {
    throw cloudError;
  }

  // 1. Listen to Google Auth session state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const adminFlag = await checkIsAdminUser(user);
          setIsAdminUser(adminFlag);
        } catch {
          setIsAdminUser(false);
        }
      } else {
        setIsAdminUser(false);
        setEmployeesPublic([]);
        setOwnPrivateInfo(null);
        setAdminPrivateMap({});
        setSweeperSessions([]);
        setCollectorSessions([]);
        setContainers([]);
        setAdminProfile(createDefaultAdminProfile());
        setCloudLoaded(true);
        setCurrentEmployeeId(null);
        saveCurrentEmployeeId(null);
        setView('auth');
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // 2. Attach real-time Firestore listeners only when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      return;
    }

    let employeesArrived = false;
    let privateArrived = false;
    const markLoadedIfReady = () => {
      if (employeesArrived && privateArrived) {
        setCloudLoaded(true);
      }
    };

    const unsub = subscribeToEcoMapaData(firebaseUser, isAdminUser, {
      onEmployeesPublic: (list) => {
        setEmployeesPublic(list);
        employeesArrived = true;
        markLoadedIfReady();
      },
      onOwnPrivateInfo: (uid, priv) => {
        setOwnPrivateInfo(priv ? {uid, ...priv} : null);
        privateArrived = true;
        markLoadedIfReady();
      },
      onSweeperSessions: (sessions) => {
        setSweeperSessions(sessions);
        // Clear pending buffer when server snapshot confirms at least as many points
        for (const s of sessions) {
          const pending = pendingPointsRef.current[s.id];
          if (pending && s.points.length >= pending.length) {
            delete pendingPointsRef.current[s.id];
          }
        }
      },
      onCollectorSessions: (sessions) => {
        setCollectorSessions(sessions);
      },
      onContainers: (list) => {
        setContainers(list);
      },
      onAdminProfile: (profile) => {
        setAdminProfile(profile);
      },
      onError: (err) => {
        setCloudError(err);
      },
    });

    return unsub;
  }, [authReady, firebaseUser, isAdminUser]);

  // 3. When Admin opens Admin Panel, hydrate full employee PII for Perfil tab
  useEffect(() => {
    if (!isAdminUser || view !== 'admin' || employeesPublic.length === 0) return;
    let cancelled = false;
    void fetchAllEmployeePrivateInfoForAdmin(employeesPublic.map((e) => e.id))
      .then((map) => {
        if (!cancelled) {
          setAdminPrivateMap(map);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCloudError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminUser, view, employeesPublic]);

  // Merge public profiles with authorized private PII
  const employees = useMemo<Employee[]>(() => {
    return employeesPublic.map((pub) => {
      const ownPriv = ownPrivateInfo && ownPrivateInfo.uid === pub.id ? ownPrivateInfo : null;
      const adminPriv = adminPrivateMap[pub.id] ?? null;
      const priv = ownPriv ?? adminPriv;
      if (!priv) return pub;
      return {
        ...pub,
        dni: priv.dni,
        phone: priv.phone,
        birthDate: priv.birthDate,
        pin: priv.pin,
      };
    });
  }, [employeesPublic, ownPrivateInfo, adminPrivateMap]);

  const dbState = useMemo<AppDatabase>(
    () => ({
      employees,
      adminProfile,
      sweeperSessions,
      collectorSessions,
      containers,
    }),
    [employees, adminProfile, sweeperSessions, collectorSessions, containers],
  );

  const currentAccountEmployee = useMemo(
    () => (firebaseUser ? employees.find((e) => e.id === firebaseUser.uid) ?? null : null),
    [employees, firebaseUser],
  );

  const currentEmployee = useMemo(
    () => employees.find((e) => e.id === currentEmployeeId) ?? null,
    [employees, currentEmployeeId],
  );

  // Restore shift view on page reload if Google Auth & employee ID match
  useEffect(() => {
    if (!authReady || !cloudLoaded) return;
    if (
      view === 'auth' &&
      currentEmployeeId &&
      currentAccountEmployee &&
      currentAccountEmployee.id === currentEmployeeId
    ) {
      setView('role-select');
    }
  }, [authReady, cloudLoaded, view, currentEmployeeId, currentAccountEmployee]);

  useEffect(() => {
    if (!authReady || !cloudLoaded) return;
    if (view !== 'auth' && view !== 'admin' && !currentEmployee) {
      setCurrentEmployeeId(null);
      saveCurrentEmployeeId(null);
      setView('auth');
    }
  }, [authReady, cloudLoaded, view, currentEmployee]);

  const handleLoginSuccess = useCallback((employee: Employee) => {
    setCurrentEmployeeId(employee.id);
    saveCurrentEmployeeId(employee.id);
    setView('role-select');
  }, []);

  const handleRegisterSuccess = useCallback(
    async (data: {
      uid: string;
      firstName: string;
      lastName: string;
      dni: string;
      phone: string;
      birthDate: string;
      pin: string;
    }) => {
      const assignedColor =
        employeesPublic.find((e) => e.id === data.uid)?.color ??
        assignUniqueColor(employeesPublic);

      const created = await registerEmployeeInCloud(data.uid, {
        firstName: data.firstName,
        lastName: data.lastName,
        dni: data.dni,
        phone: data.phone,
        birthDate: data.birthDate,
        pin: data.pin,
        color: assignedColor,
      });

      setOwnPrivateInfo({
        uid: data.uid,
        dni: created.dni,
        phone: created.phone,
        birthDate: created.birthDate,
        pin: created.pin,
      });
      setCurrentEmployeeId(created.id);
      saveCurrentEmployeeId(created.id);
      setView('role-select');

      return {ok: true, employee: created};
    },
    [employeesPublic],
  );

  const handleAdminSuccess = useCallback((masterKeyValidated: boolean) => {
    if (!masterKeyValidated) return;
    setIsAdminUser(true);
    setView('admin');
  }, []);

  const handleSelectRole = useCallback((role: ShiftRole) => {
    setView(role);
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentEmployeeId(null);
    saveCurrentEmployeeId(null);
    setView('auth');
  }, []);

  const handleStartSweeping = useCallback(
    async (initialPoint: LatLngPoint): Promise<SweeperSession> => {
      if (!currentEmployee) {
        throw new Error('Empleado no autenticado');
      }
      const created = await startSweeperSessionInCloud(
        currentEmployee,
        initialPoint,
        sweeperSessionsRef.current,
      );
      pendingPointsRef.current[created.id] = created.points;
      return created;
    },
    [currentEmployee],
  );

  const handleAppendSweeperPoint = useCallback(
    async (sessionId: string, point: LatLngPoint): Promise<void> => {
      const session = sweeperSessionsRef.current.find((s) => s.id === sessionId);
      if (!session || !session.active) return;

      const latestPoints = pendingPointsRef.current[sessionId] ?? session.points;
      const last = latestPoints[latestPoints.length - 1];
      if (last && haversineDistanceMeters(last, point) < 6) {
        return;
      }

      const nextPoints = await appendSweeperPointInCloud(
        {...session, points: latestPoints},
        point,
      );
      pendingPointsRef.current[sessionId] = nextPoints;
    },
    [],
  );

  const handleFinishSweeping = useCallback(async (sessionId: string): Promise<void> => {
    delete pendingPointsRef.current[sessionId];
    await finishSweeperSessionInCloud(sessionId);
  }, []);

  const handleUpdateCollectorLocation = useCallback(
    async (location: LatLngPoint): Promise<void> => {
      if (!currentEmployee) return;
      const now = Date.now();
      const prev = lastCollectorWriteRef.current;
      if (
        prev &&
        now - prev.at < 4000 &&
        Math.abs(prev.lat - location[0]) < 0.00002 &&
        Math.abs(prev.lng - location[1]) < 0.00002
      ) {
        return;
      }
      lastCollectorWriteRef.current = {lat: location[0], lng: location[1], at: now};
      await upsertCollectorLocationInCloud(
        currentEmployee,
        location,
        collectorSessionsRef.current,
      );
    },
    [currentEmployee],
  );

  const handleRegisterContainer = useCallback(
    async (data: {
      barrio: string;
      reference: string;
      lat: number | null;
      lng: number | null;
      locationSource: 'gps' | 'manual';
      status: ContainerStatus;
      comment: string;
      photoDataUrl?: string;
    }): Promise<ContainerRecord> => {
      if (!currentEmployee) {
        throw new Error('Empleado no autenticado');
      }
      return registerContainerInCloud(currentEmployee, data);
    },
    [currentEmployee],
  );

  const handleUpdateAdminProfile = useCallback(async (profile: AdminProfile): Promise<void> => {
    await updateAdminProfileInCloud(profile);
    setAdminProfile(profile);
  }, []);

  const handleUpdateEmployee = useCallback(
    async (updated: Employee): Promise<void> => {
      await updateEmployeeInCloud(updated, sweeperSessions, collectorSessions, containers);
      setAdminPrivateMap((prev) => ({
        ...prev,
        [updated.id]: {
          dni: updated.dni,
          phone: updated.phone,
          birthDate: updated.birthDate,
          pin: updated.pin,
        },
      }));
    },
    [sweeperSessions, collectorSessions, containers],
  );

  const handleResetDemoData = useCallback(async (): Promise<void> => {
    await seedDemoDataInCloud();
  }, []);

  return (
    <div className="min-h-screen bg-[#F1F8E9] text-slate-900">
      <AppHeader
        view={view}
        currentEmployee={currentEmployee}
        onChangeRole={() => setView('role-select')}
        onLogout={handleLogout}
        onExitAdmin={() => setView(currentEmployee ? 'role-select' : 'auth')}
      />

      {view === 'auth' && (
        <AuthScreen
          firebaseUser={firebaseUser}
          authReady={authReady}
          currentAccountEmployee={currentAccountEmployee}
          onLoginSuccess={handleLoginSuccess}
          onRegisterSuccess={handleRegisterSuccess}
          onAdminSuccess={handleAdminSuccess}
        />
      )}

      {view === 'role-select' && currentEmployee && (
        <RoleSelectorScreen
          employee={currentEmployee}
          sweeperSessions={sweeperSessions}
          containers={containers}
          onSelectRole={handleSelectRole}
        />
      )}

      {view === 'barredor' && currentEmployee && (
        <SweeperMode
          employee={currentEmployee}
          sweeperSessions={sweeperSessions}
          containers={containers}
          onStartSession={handleStartSweeping}
          onAppendPoint={handleAppendSweeperPoint}
          onFinishSession={handleFinishSweeping}
        />
      )}

      {view === 'recolector' && currentEmployee && (
        <CollectorMode
          employee={currentEmployee}
          containers={containers}
          sweeperSessions={sweeperSessions}
          onRegisterContainer={handleRegisterContainer}
          onUpdateCollectorLocation={handleUpdateCollectorLocation}
        />
      )}

      {view === 'admin' && (
        <AdminDashboard
          db={dbState}
          onUpdateAdminProfile={handleUpdateAdminProfile}
          onUpdateEmployee={handleUpdateEmployee}
          onResetDemoData={handleResetDemoData}
        />
      )}
    </div>
  );
}
