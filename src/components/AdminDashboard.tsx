import L from 'leaflet';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Footprints,
  Image as ImageIcon,
  Map as MapIcon,
  PowerOff,
  RotateCcw,
  Save,
  Search,
  Shield,
  Truck,
  UserCheck,
  UserCog,
  X,
} from 'lucide-react';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CONTAINER_STATUS_META, EMPLOYEE_COLORS, SANTA_MARIA_CENTER} from '../constants';
import {
  escapeHtml,
  exportContainersToCSV,
  exportEmployeesToCSV,
  exportSweepersToCSV,
  formatDateTimeAR,
  formatTimeAR,
  getLocalDateKeyAR,
  getPresenceState,
  groupContainersByLocation,
  isTodayAR,
} from '../services/storage';
import {grantAdminAccessInCloud} from '../services/firebaseDb';
import type {
  AdminProfile,
  AppDatabase,
  ContainerStatus,
  Employee,
  LatLngPoint,
  PresenceState,
} from '../types';

interface AdminDashboardProps {
  db: AppDatabase;
  onUpdateAdminProfile: (profile: AdminProfile) => Promise<void>;
  onUpdateEmployee: (employee: Employee) => Promise<void>;
  onResetDemoData: () => Promise<void>;
}

interface WorkerSummary {
  id: string;
  employeeId: string;
  employeeName: string;
  color: string;
  role: 'barredor' | 'recolector';
  active: boolean;
  startedAt: string;
  lastUpdatedAt: string;
  location: LatLngPoint;
  presence: PresenceState;
  presenceLabel: string;
  minutesIdle: number;
  distanceMeters?: number;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  db,
  onUpdateAdminProfile,
  onUpdateEmployee,
  onResetDemoData,
}) => {
  // 3 pestañas principales solicitadas: Recorridos en Tiempo Real, Barrido y Perfil
  const [activeTab, setActiveTab] = useState<'recorridos' | 'barrido' | 'perfil'>('recorridos');
  const [showContainersOnMap, setShowContainersOnMap] = useState<boolean>(true);
  const [onlyTodayOnMap, setOnlyTodayOnMap] = useState<boolean>(true);
  const [sweepDateFilter, setSweepDateFilter] = useState<string>('');
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Filtros de base de datos de contenedores
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContainerStatus>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Formularios de pestaña Perfil
  const [adminForm, setAdminForm] = useState<AdminProfile>(db.adminProfile);
  const [adminSavedMsg, setAdminSavedMsg] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string>(db.employees[0]?.id ?? '');
  const [empForm, setEmpForm] = useState<Employee | null>(db.employees[0] ?? null);
  const [empSavedMsg, setEmpSavedMsg] = useState('');
  const [empSaving, setEmpSaving] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [grantUid, setGrantUid] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantMsg, setGrantMsg] = useState('');
  const [grantError, setGrantError] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const sweepMapContainerRef = useRef<HTMLDivElement | null>(null);
  const sweepMapRef = useRef<L.Map | null>(null);
  const sweepLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const containersTableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setAdminForm(db.adminProfile);
  }, [db.adminProfile]);

  useEffect(() => {
    const found = db.employees.find((e) => e.id === selectedEmpId) ?? db.employees[0] ?? null;
    if (found && found.id !== selectedEmpId) {
      setSelectedEmpId(found.id);
    }
    setEmpForm(found);
  }, [selectedEmpId, db.employees]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const visibleSweeperSessions = useMemo(
    () =>
      onlyTodayOnMap
        ? db.sweeperSessions.filter((s) => isTodayAR(s.startedAt))
        : db.sweeperSessions,
    [db.sweeperSessions, onlyTodayOnMap],
  );

  const visibleCollectorSessions = useMemo(
    () =>
      onlyTodayOnMap
        ? db.collectorSessions.filter((c) => isTodayAR(c.lastUpdatedAt))
        : db.collectorSessions,
    [db.collectorSessions, onlyTodayOnMap],
  );

  const permanentContainerGroups = useMemo(
    () => groupContainersByLocation(db.containers),
    [db.containers],
  );

  const filteredSweeperSessions = useMemo(() => {
    if (!sweepDateFilter) return visibleSweeperSessions;
    return db.sweeperSessions.filter((s) => getLocalDateKeyAR(s.startedAt) === sweepDateFilter);
  }, [db.sweeperSessions, visibleSweeperSessions, sweepDateFilter]);

  const workerSummaries = useMemo<WorkerSummary[]>(() => {
    const latestByEmployee = new Map<string, WorkerSummary>();

    for (const s of visibleSweeperSessions) {
      const pt = s.points.length > 0 ? s.points[s.points.length - 1] : SANTA_MARIA_CENTER;
      const pres = getPresenceState(s.active, s.lastUpdatedAt, nowTick);
      const existing = latestByEmployee.get(s.employeeId);
      if (
        !existing ||
        new Date(s.lastUpdatedAt).getTime() > new Date(existing.lastUpdatedAt).getTime()
      ) {
        latestByEmployee.set(s.employeeId, {
          id: s.id,
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          color: s.employeeColor,
          role: 'barredor',
          active: s.active,
          startedAt: s.startedAt,
          lastUpdatedAt: s.lastUpdatedAt,
          location: pt,
          presence: pres.state,
          presenceLabel: pres.label,
          minutesIdle: pres.minutesIdle,
          distanceMeters: s.distanceMeters,
        });
      }
    }

    for (const c of visibleCollectorSessions) {
      const pres = getPresenceState(c.active, c.lastUpdatedAt, nowTick);
      const existing = latestByEmployee.get(c.employeeId);
      if (
        !existing ||
        new Date(c.lastUpdatedAt).getTime() > new Date(existing.lastUpdatedAt).getTime()
      ) {
        latestByEmployee.set(c.employeeId, {
          id: c.id,
          employeeId: c.employeeId,
          employeeName: c.employeeName,
          color: c.employeeColor,
          role: 'recolector',
          active: c.active,
          startedAt: c.startedAt,
          lastUpdatedAt: c.lastUpdatedAt,
          location: c.currentLocation,
          presence: pres.state,
          presenceLabel: pres.label,
          minutesIdle: pres.minutesIdle,
        });
      }
    }

    const weight: Record<PresenceState, number> = {
      stopped: 0,
      moving: 1,
      offline: 2,
    };

    return Array.from(latestByEmployee.values()).sort(
      (a, b) => weight[a.presence] - weight[b.presence],
    );
  }, [visibleSweeperSessions, visibleCollectorSessions, nowTick]);

  // Mapa pestaña 1: Recorridos en Tiempo Real
  useEffect(() => {
    if (activeTab !== 'recorridos') {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerGroupRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: SANTA_MARIA_CENTER,
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'recorridos' || !layerGroupRef.current) return;
    const group = layerGroupRef.current;
    group.clearLayers();

    for (const s of visibleSweeperSessions) {
      if (s.points.length < 2) continue;
      L.polyline(s.points, {
        color: s.employeeColor,
        weight: 6,
        opacity: s.active ? 0.9 : 0.55,
        lineCap: 'round',
        lineJoin: 'round',
      })
        .bindPopup(
          `<div style="font-family:sans-serif">
            <strong style="color:${s.employeeColor}">${s.employeeName}</strong><br/>
            <span>Barredor · ${s.distanceMeters} m recorridos</span><br/>
            <span>Inicio: ${formatTimeAR(s.startedAt)}</span>
          </div>`,
        )
        .addTo(group);
    }

    for (const w of workerSummaries) {
      const roleGlyph = w.role === 'barredor' ? 'B' : 'R';
      const borderColor = w.presence === 'stopped' ? '#DC2626' : '#FFFFFF';
      const icon = L.divIcon({
        className: 'admin-worker-marker',
        html: `<div style="position:relative;width:34px;height:34px;border-radius:9999px;background:${w.color};border:3px solid ${borderColor};box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;font-family:sans-serif;">
          ${roleGlyph}
        </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker(w.location, {icon})
        .bindTooltip(w.employeeName, {permanent: w.active, direction: 'top', offset: [0, -16]})
        .bindPopup(
          `<div style="font-family:sans-serif;min-width:185px">
            <strong style="font-size:13px">${w.employeeName}</strong><br/>
            <span style="color:#475569">${w.role === 'barredor' ? 'Barredor' : 'Recolector'}</span><br/>
            <span>Inicio: <strong>${formatTimeAR(w.startedAt)}</strong></span><br/>
            <span>Último mov: <strong>${formatTimeAR(w.lastUpdatedAt)}</strong></span><br/>
            <span style="color:${w.presence === 'stopped' ? '#DC2626' : '#16A34A'};font-weight:700">${w.presenceLabel}</span>
          </div>`,
        )
        .addTo(group);
    }

    if (showContainersOnMap) {
      for (const item of permanentContainerGroups) {
        const latestMeta = CONTAINER_STATUS_META[item.latest.status];
        const dotColor = item.hasTodayReport ? latestMeta.hex : '#94A3B8';
        const icon = L.divIcon({
          className: 'admin-container-pin',
          html: `<div style="position:relative;width:22px;height:22px;border-radius:6px;background:#0284C7;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:10px;font-family:sans-serif;">C<span style="position:absolute;right:-3px;bottom:-3px;width:9px;height:9px;border-radius:9999px;background:${dotColor};border:2px solid #fff;"></span></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        const historyHtml = item.history
          .slice(0, 15)
          .map((h) => {
            const meta = CONTAINER_STATUS_META[h.status];
            const photoHtml = h.photoDataUrl
              ? `<img src="${h.photoDataUrl}" alt="Foto" style="margin-top:4px;width:100%;max-height:85px;object-fit:cover;border-radius:6px;" />`
              : '';
            return `<div style="padding:6px 0;border-top:1px solid #e2e8f0;">
              <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">
                <span style="color:${meta.hex};font-weight:700;font-size:11px;">${escapeHtml(meta.shortLabel)}</span>
                <span style="font-size:10px;color:#64748b;">${escapeHtml(formatDateTimeAR(h.createdAt))}</span>
              </div>
              <div style="font-size:11px;color:#334155;">${escapeHtml(h.employeeName)}</div>
              <div style="font-size:11px;color:#475569;">${escapeHtml(h.comment)}</div>
              ${photoHtml}
            </div>`;
          })
          .join('');

        L.marker([item.lat, item.lng], {icon})
          .bindPopup(
            `<div style="font-family:sans-serif;min-width:210px;max-width:255px;">
              <div style="font-size:11px;font-weight:800;color:#0284C7;">CONTENEDOR FIJO · ${escapeHtml(item.barrio)}</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(item.reference)}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px;">${item.history.length} reporte(s) diarios · ${item.hasTodayReport ? 'Actualizado hoy' : 'Pendiente hoy'}</div>
              <div style="margin-top:6px;max-height:190px;overflow-y:auto;">${historyHtml}</div>
            </div>`,
          )
          .addTo(group);
      }
    }
  }, [activeTab, visibleSweeperSessions, permanentContainerGroups, workerSummaries, showContainersOnMap]);

  // Mapa pestaña 2: Barrido en Tiempo Real
  useEffect(() => {
    if (activeTab !== 'barrido') {
      if (sweepMapRef.current) {
        sweepMapRef.current.remove();
        sweepMapRef.current = null;
        sweepLayerGroupRef.current = null;
      }
      return;
    }

    if (!sweepMapContainerRef.current || sweepMapRef.current) return;

    const map = L.map(sweepMapContainerRef.current, {
      center: SANTA_MARIA_CENTER,
      zoom: 16,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    sweepMapRef.current = map;
    sweepLayerGroupRef.current = group;

    return () => {
      map.remove();
      sweepMapRef.current = null;
      sweepLayerGroupRef.current = null;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'barrido' || !sweepLayerGroupRef.current) return;
    const group = sweepLayerGroupRef.current;
    group.clearLayers();

    for (const s of filteredSweeperSessions) {
      if (s.points.length === 0) continue;
      if (s.points.length >= 2) {
        L.polyline(s.points, {
          color: s.employeeColor,
          weight: 8,
          opacity: s.active ? 0.95 : 0.65,
          lineCap: 'round',
        })
          .bindPopup(
            `<strong>${s.employeeName}</strong><br/>${s.distanceMeters} m barridos<br/>Inicio: ${formatTimeAR(s.startedAt)}`,
          )
          .addTo(group);
      }
      const pt = s.points[s.points.length - 1];
      L.circleMarker(pt, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: s.employeeColor,
        fillOpacity: 1,
      })
        .bindTooltip(`${s.employeeName} (${s.distanceMeters} m)`, {
          permanent: s.active,
          direction: 'top',
          offset: [0, -8],
        })
        .addTo(group);
    }
  }, [activeTab, filteredSweeperSessions]);

  const handleJumpToContainers = () => {
    if (activeTab !== 'recorridos') {
      setActiveTab('recorridos');
      window.setTimeout(() => {
        containersTableRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
      }, 120);
    } else {
      containersTableRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  };

  const filteredContainers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return db.containers.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (employeeFilter !== 'all' && c.employeeId !== employeeFilter) return false;
      if (dateFilter) {
        const recordDate = getLocalDateKeyAR(c.createdAt);
        if (recordDate !== dateFilter) return false;
      }
      if (q) {
        const haystack =
          `${c.barrio} ${c.reference} ${c.comment} ${c.employeeName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [db.containers, searchTerm, statusFilter, employeeFilter, dateFilter]);

  const stats = useMemo(() => {
    return {
      total: db.containers.length,
      optimo: db.containers.filter((c) => c.status === 'optimo').length,
      lleno: db.containers.filter((c) => c.status === 'lleno').length,
      alerta: db.containers.filter((c) => c.status === 'danado' || c.status === 'desbordado')
        .length,
    };
  }, [db.containers]);

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminForm.masterKey.trim() || adminSaving) return;
    setAdminSaving(true);
    try {
      await onUpdateAdminProfile({
        ...adminForm,
        fullName: adminForm.fullName.trim(),
        roleTitle: adminForm.roleTitle.trim(),
        phone: adminForm.phone.trim(),
        email: adminForm.email.trim(),
        masterKey: adminForm.masterKey.trim(),
      });
      setAdminSavedMsg('Perfil de Jefatura actualizado en la nube.');
      window.setTimeout(() => setAdminSavedMsg(''), 3500);
    } finally {
      setAdminSaving(false);
    }
  };

  const handleSaveEmployeeProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm || empSaving) return;
    setEmpSaving(true);
    const first = empForm.firstName.trim();
    const last = empForm.lastName.trim();
    try {
      await onUpdateEmployee({
        ...empForm,
        firstName: first,
        lastName: last,
        fullName: `${first}${last ? ` ${last}` : ''}`.trim(),
      });
      setEmpSavedMsg(`Datos de ${first} ${last} guardados en la nube.`);
      window.setTimeout(() => setEmpSavedMsg(''), 3500);
    } finally {
      setEmpSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:py-6">
      {/* Cabecera de 3 Pestañas */}
      <section className="flex flex-col gap-4 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#2E7D32]">
            {db.adminProfile.fullName} · {db.adminProfile.roleTitle}
          </p>
          <h1 className="font-display text-xl font-extrabold text-slate-900 sm:text-2xl">
            Panel de Administración
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-2xl border border-emerald-900/10 bg-[#F1F8E9] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('recorridos')}
              className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                activeTab === 'recorridos'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <MapIcon className="h-4 w-4" />
              <span>Recorridos en Tiempo Real</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('barrido')}
              className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                activeTab === 'barrido'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <Footprints className="h-4 w-4" />
              <span>Barrido</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('perfil')}
              className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                activeTab === 'perfil'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <UserCog className="h-4 w-4" />
              <span>Perfil</span>
            </button>
          </div>
        </div>
      </section>

      {/* PESTAÑA 1: RECORRIDOS EN TIEMPO REAL + BASE DE DATOS DE CONTENEDORES */}
      {activeTab === 'recorridos' && (
        <div className="mt-5 space-y-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <section className="space-y-3 lg:col-span-8">
              <div className="overflow-hidden rounded-3xl border border-emerald-950/15 bg-white shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3 font-semibold text-slate-700">
                    <span>B = Barredor</span>
                    <span aria-hidden="true">·</span>
                    <span>R = Recolector</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-red-700">Borde rojo = Detenido &gt; 15 min</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex items-center gap-1.5 font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyTodayOnMap}
                        onChange={(e) => setOnlyTodayOnMap(e.target.checked)}
                        className="h-4 w-4 accent-[#1B5E20]"
                      />
                      <span>Solo hoy</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showContainersOnMap}
                        onChange={(e) => setShowContainersOnMap(e.target.checked)}
                        className="h-4 w-4 accent-[#1B5E20]"
                      />
                      <span>Contenedores</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!mapRef.current) return;
                        const pts: LatLngPoint[] = [];
                        for (const w of workerSummaries) pts.push(w.location);
                        for (const s of visibleSweeperSessions) {
                          for (const p of s.points) pts.push(p);
                        }
                        if (showContainersOnMap) {
                          for (const c of permanentContainerGroups) {
                            pts.push([c.lat, c.lng]);
                          }
                        }
                        if (pts.length >= 2) {
                          mapRef.current.fitBounds(L.latLngBounds(pts), {padding: [32, 32], maxZoom: 17});
                        } else if (pts.length === 1) {
                          mapRef.current.setView(pts[0], 16, {animate: true});
                        } else {
                          mapRef.current.setView(SANTA_MARIA_CENTER, 15, {animate: true});
                        }
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Centrar todo
                    </button>
                    <button
                      type="button"
                      onClick={handleJumpToContainers}
                      className="rounded-lg bg-[#F1F8E9] px-2.5 py-1.5 text-xs font-bold text-[#1B5E20] hover:bg-emerald-100 cursor-pointer"
                    >
                      Ir a Base de Contenedores
                    </button>
                  </div>
                </div>
                <div
                  ref={mapContainerRef}
                  className="h-[52vh] min-h-[360px] w-full lg:h-[58vh]"
                  aria-label="Monitor GPS general de empleados en Santa María"
                />
              </div>
            </section>

            {/* Panel lateral de Control de Presentismo */}
            <aside className="rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-xs lg:col-span-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Control de Presentismo
                </h2>
                <span className="font-mono text-xs font-bold text-[#1B5E20] tabular-nums">
                  {workerSummaries.filter((w) => w.active).length} activos
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Tocá un empleado para centrar su ubicación y revisar su estado de movimiento.
              </p>

              <div className="mt-4 divide-y divide-slate-100">
                {workerSummaries.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => mapRef.current?.setView(w.location, 17, {animate: true})}
                    className="-mx-2 flex w-full items-start justify-between gap-3 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-[#F1F8E9]/60 first:pt-1 last:pb-1 cursor-pointer"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white shadow-xs"
                        style={{backgroundColor: w.color}}
                      >
                        {w.role === 'barredor' ? (
                          <UserCheck className="h-4 w-4" />
                        ) : (
                          <Truck className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {w.employeeName}
                        </p>
                        <p className="text-xs font-medium text-slate-600">
                          {w.role === 'barredor'
                            ? `Barredor · ${w.distanceMeters ?? 0} m`
                            : 'Recolector'}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                          Inicio: {formatTimeAR(w.startedAt)} · Últ. mov:{' '}
                          {formatTimeAR(w.lastUpdatedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {w.presence === 'moving' && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-900">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                          En movimiento
                        </span>
                      )}
                      {w.presence === 'stopped' && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-900">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
                          {w.presenceLabel}
                        </span>
                      )}
                      {w.presence === 'offline' && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                          <PowerOff className="h-3.5 w-3.5 text-slate-500" />
                          Fuera de servicio
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          </div>

          {/* Base de Datos de Contenedores y Exportación Excel/CSV integrada con acceso directo */}
          <section ref={containersTableRef} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4">
                <p className="text-xs font-medium text-slate-600">Total contenedores</p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
                  {stats.total}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4">
                <p className="text-xs font-medium text-emerald-800">Óptimos / Limpios</p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-emerald-700 tabular-nums">
                  {stats.optimo}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4">
                <p className="text-xs font-medium text-amber-800">Llenos (vaciar)</p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-amber-700 tabular-nums">
                  {stats.lleno}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4">
                <p className="text-xs font-medium text-red-800">Dañados / Desbordados</p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-red-700 tabular-nums">
                  {stats.alerta}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-950/10 bg-white p-4 shadow-xs sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor="admin-search"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Buscar barrio, calle o comentario
                    </label>
                    <div className="relative mt-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="admin-search"
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Ej: Chaquiago, tapa rota..."
                        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-status-filter"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Estado del contenedor
                    </label>
                    <div className="relative mt-1">
                      <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <select
                        id="admin-status-filter"
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(e.target.value as 'all' | ContainerStatus)
                        }
                        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                      >
                        <option value="all">Todos los estados</option>
                        <option value="optimo">Óptimo / Limpio</option>
                        <option value="lleno">Lleno / Requiere vaciado</option>
                        <option value="danado">Dañado / Roto</option>
                        <option value="desbordado">Desbordado / Basura alrededor</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-emp-filter"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Empleado
                    </label>
                    <select
                      id="admin-emp-filter"
                      value={employeeFilter}
                      onChange={(e) => setEmployeeFilter(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    >
                      <option value="all">Todo el personal</option>
                      {db.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-date-filter"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Fecha
                    </label>
                    <input
                      id="admin-date-filter"
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => exportContainersToCSV(filteredContainers)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#1B5E20] px-4 py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#2E7D32] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Exportar a Excel / CSV</span>
                </button>
              </div>

              {/* Tabla desktop */}
              <div className="mt-5 hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-600">
                      <th className="py-3 pr-4">Fecha / Hora</th>
                      <th className="py-3 pr-4">Empleado</th>
                      <th className="py-3 pr-4">Barrio / Ubicación</th>
                      <th className="py-3 pr-4">Estado</th>
                      <th className="py-3 pr-4">Foto</th>
                      <th className="py-3">Comentario detallado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredContainers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-500">
                          No hay registros que coincidan con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredContainers.map((c) => {
                        const meta = CONTAINER_STATUS_META[c.status];
                        const mapsUrl =
                          c.lat !== null && c.lng !== null
                            ? `https://www.google.com/maps?q=${c.lat.toFixed(6)},${c.lng.toFixed(6)}`
                            : null;
                        return (
                          <tr key={c.id} className="align-top hover:bg-[#F1F8E9]/45">
                            <td className="py-3.5 pr-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {formatDateTimeAR(c.createdAt)}
                            </td>
                            <td className="py-3.5 pr-4 font-semibold text-slate-900 whitespace-nowrap">
                              {c.employeeName}
                            </td>
                            <td className="py-3.5 pr-4">
                              <p className="font-bold text-slate-900">{c.barrio}</p>
                              <p className="text-xs text-slate-600">{c.reference}</p>
                              {mapsUrl && (
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#1B5E20] hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span>Abrir en Google Maps</span>
                                </a>
                              )}
                            </td>
                            <td className="py-3.5 pr-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeBg}`}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{backgroundColor: meta.hex}}
                                  aria-hidden="true"
                                />
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-3.5 pr-4 whitespace-nowrap">
                              {c.photoDataUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewPhotoUrl(c.photoDataUrl ?? null)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-[#1B5E20] hover:bg-emerald-50 cursor-pointer"
                                >
                                  <ImageIcon className="h-3.5 w-3.5" />
                                  <span>Ver foto</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="max-w-xs py-3.5 text-xs leading-relaxed text-slate-700">
                              {c.comment}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas mobile */}
              <div className="mt-4 divide-y divide-slate-100 md:hidden">
                {filteredContainers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No hay registros para mostrar.
                  </p>
                ) : (
                  filteredContainers.map((c) => {
                    const meta = CONTAINER_STATUS_META[c.status];
                    const mapsUrl =
                      c.lat !== null && c.lng !== null
                        ? `https://www.google.com/maps?q=${c.lat.toFixed(6)},${c.lng.toFixed(6)}`
                        : null;
                    return (
                      <article key={c.id} className="space-y-2 py-4 first:pt-1 last:pb-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{c.barrio}</p>
                            <p className="text-xs text-slate-600">{c.reference}</p>
                          </div>
                          <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                            <Clock className="h-3 w-3" />
                            {formatDateTimeAR(c.createdAt)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeBg}`}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{backgroundColor: meta.hex}}
                              aria-hidden="true"
                            />
                            {meta.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {c.employeeName}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700">{c.comment}</p>

                        <div className="flex flex-wrap items-center gap-3">
                          {mapsUrl && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-bold text-[#1B5E20] hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Google Maps</span>
                            </a>
                          )}
                          {c.photoDataUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewPhotoUrl(c.photoDataUrl ?? null)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-bold text-[#1B5E20] hover:underline cursor-pointer"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              <span>Ver foto adjunta</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* PESTAÑA 2: BARRIDO EN TIEMPO REAL */}
      {activeTab === 'barrido' && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section className="overflow-hidden rounded-3xl border border-emerald-950/15 bg-white shadow-xs lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Calles Barridas en Tiempo Real
                </h2>
                <p className="text-xs text-slate-600">
                  Trazado exclusivo de cuadrillas de barrido por color asignado.
                </p>
              </div>
              <button
                type="button"
                onClick={handleJumpToContainers}
                className="rounded-xl bg-[#F1F8E9] px-3 py-1.5 text-xs font-bold text-[#1B5E20] hover:bg-emerald-100 cursor-pointer"
              >
                Ir a Base de Contenedores
              </button>
            </div>
            <div
              ref={sweepMapContainerRef}
              className="h-[52vh] min-h-[360px] w-full"
              aria-label="Mapa en tiempo real de calles barridas"
            />
          </section>

          <aside className="rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-xs lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Detalle de Barrido por Empleado
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Tocá un recorrido para centrar el mapa o filtrá por fecha para descargar el informe.
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportSweepersToCSV(filteredSweeperSessions)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#1B5E20] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#2E7D32] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar Barrido (Excel)</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Filtrar barrido por fecha"
                value={sweepDateFilter}
                onChange={(e) => setSweepDateFilter(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-[#1B5E20] focus:outline-none"
              />
              {sweepDateFilter ? (
                <button
                  type="button"
                  onClick={() => setSweepDateFilter('')}
                  className="text-xs font-semibold text-[#1B5E20] hover:underline cursor-pointer"
                >
                  Volver a vista diaria
                </button>
              ) : (
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyTodayOnMap}
                    onChange={(e) => setOnlyTodayOnMap(e.target.checked)}
                    className="h-4 w-4 accent-[#1B5E20]"
                  />
                  <span>Solo hoy en mapa</span>
                </label>
              )}
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {filteredSweeperSessions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No hay jornadas de barrido registradas para este filtro.
                </p>
              ) : (
                filteredSweeperSessions.map((s) => {
                  const pres = getPresenceState(s.active, s.lastUpdatedAt, nowTick);
                  const lastPt =
                    s.points.length > 0 ? s.points[s.points.length - 1] : SANTA_MARIA_CENTER;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => sweepMapRef.current?.setView(lastPt, 17, {animate: true})}
                      className="-mx-2 flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3.5 text-left hover:bg-[#F1F8E9]/60 first:pt-1 last:pb-1 cursor-pointer"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                          style={{backgroundColor: s.employeeColor}}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {s.employeeName}
                          </p>
                          <p className="font-mono text-xs text-slate-600 tabular-nums">
                            {formatDateTimeAR(s.startedAt)} · Últ. {formatTimeAR(s.lastUpdatedAt)}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-700">
                            {pres.label}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-extrabold text-[#1B5E20] tabular-nums shrink-0">
                        {s.distanceMeters} m
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}

      {/* PESTAÑA 3: PERFIL (MODIFICAR DATOS DE JEFA O EMPLEADOS) */}
      {activeTab === 'perfil' && (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Perfil de Jefatura de Área */}
          <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs lg:col-span-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F8E9] text-[#1B5E20]">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Perfil de Jefatura de Área
                </h2>
                <p className="text-xs text-slate-600">
                  Editá los datos administrativos y la clave maestra de acceso.
                </p>
              </div>
            </div>

            {adminSavedMsg && (
              <div
                role="status"
                className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-950"
              >
                <CheckCircle2 className="h-4 w-4 text-[#1B5E20]" />
                <span>{adminSavedMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdminProfile} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nombre de la Jefa / Responsable
                </label>
                <input
                  type="text"
                  required
                  value={adminForm.fullName}
                  onChange={(e) => setAdminForm({...adminForm, fullName: e.target.value})}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Cargo / Dependencia
                </label>
                <input
                  type="text"
                  required
                  value={adminForm.roleTitle}
                  onChange={(e) => setAdminForm({...adminForm, roleTitle: e.target.value})}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Teléfono</label>
                  <input
                    type="tel"
                    value={adminForm.phone}
                    onChange={(e) => setAdminForm({...adminForm, phone: e.target.value})}
                    className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Correo institucional
                  </label>
                  <input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({...adminForm, email: e.target.value})}
                    className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Clave Maestra de Administración
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={adminForm.masterKey}
                  onChange={(e) => setAdminForm({...adminForm, masterKey: e.target.value})}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={adminSaving}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1B5E20] px-5 py-3 text-sm font-bold text-white hover:bg-[#2E7D32] disabled:opacity-60 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>{adminSaving ? 'Guardando...' : 'Guardar Perfil de Jefatura'}</span>
              </button>
            </form>

            {/* Reiniciar / Cargar datos de demostración en la nube */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Cargar / restaurar datos de prueba iniciales</span>
                </button>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-950">
                    ¿Cargar los 3 empleados y 4 contenedores de prueba en la nube?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={resettingDemo}
                      onClick={async () => {
                        setResettingDemo(true);
                        try {
                          await onResetDemoData();
                          setConfirmReset(false);
                        } finally {
                          setResettingDemo(false);
                        }
                      }}
                      className="min-h-[36px] rounded-lg bg-amber-700 px-3 py-1 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-60 cursor-pointer"
                    >
                      {resettingDemo ? 'Cargando...' : 'Sí, cargar en la nube'}
                    </button>
                    <button
                      type="button"
                      disabled={resettingDemo}
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Autorizar cuenta Google de la Oficina como Administradora */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Autorizar otra cuenta de Jefatura / Oficina
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Si la Jefa ingresa con su propio Gmail desde la PC de la oficina, pegá acá el ID
                de usuario que muestra la pantalla y su correo para darle acceso permanente.
              </p>

              {grantMsg && (
                <p className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-950">
                  {grantMsg}
                </p>
              )}
              {grantError && (
                <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
                  {grantError}
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={grantUid}
                  onChange={(e) => setGrantUid(e.target.value)}
                  placeholder="ID de usuario (UID)"
                  className="min-h-[42px] rounded-xl border border-slate-300 px-3 font-mono text-xs text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                />
                <input
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="Correo de la oficina (Gmail)"
                  className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={grantBusy}
                onClick={async () => {
                  setGrantMsg('');
                  setGrantError('');
                  setGrantBusy(true);
                  try {
                    await grantAdminAccessInCloud(grantUid, grantEmail);
                    setGrantMsg(`Acceso de Jefatura otorgado a ${grantEmail.trim()}.`);
                    setGrantUid('');
                    setGrantEmail('');
                  } catch (err) {
                    setGrantError(
                      err instanceof Error ? err.message : 'Verificá el UID y el correo.',
                    );
                  } finally {
                    setGrantBusy(false);
                  }
                }}
                className="mt-2.5 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#1B5E20] bg-[#F1F8E9] px-4 py-2 text-xs font-bold text-[#1B5E20] hover:bg-emerald-100 disabled:opacity-60 cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5" />
                <span>{grantBusy ? 'Autorizando...' : 'Autorizar cuenta administrativa'}</span>
              </button>
            </div>
          </section>

          {/* Edición de empleados registrados */}
          <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F8E9] text-[#1B5E20]">
                  <UserCog className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Personal Registrado ({db.employees.length})
                  </h2>
                  <p className="text-xs text-slate-600">
                    Seleccioná un empleado para actualizar sus datos, color asignado o PIN.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={db.employees.length === 0}
                onClick={() => exportEmployeesToCSV(db.employees)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1B5E20] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#2E7D32] disabled:opacity-50 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar Personal (Excel)</span>
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">
                Seleccionar empleado
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => {
                  setSelectedEmpId(e.target.value);
                  setEmpSavedMsg('');
                }}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-[#1B5E20] focus:outline-none"
              >
                {db.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} (DNI {emp.dni})
                  </option>
                ))}
              </select>
            </div>

            {empSavedMsg && (
              <div
                role="status"
                className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-950"
              >
                <CheckCircle2 className="h-4 w-4 text-[#1B5E20]" />
                <span>{empSavedMsg}</span>
              </div>
            )}

            {empForm && (
              <form onSubmit={handleSaveEmployeeProfile} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Nombre</label>
                    <input
                      type="text"
                      required
                      value={empForm.firstName}
                      onChange={(e) => setEmpForm({...empForm, firstName: e.target.value})}
                      className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Apellido</label>
                    <input
                      type="text"
                      required
                      value={empForm.lastName}
                      onChange={(e) => setEmpForm({...empForm, lastName: e.target.value})}
                      className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      DNI / Legajo
                    </label>
                    <input
                      type="text"
                      required
                      value={empForm.dni}
                      onChange={(e) => setEmpForm({...empForm, dni: e.target.value})}
                      className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Teléfono</label>
                    <input
                      type="tel"
                      required
                      value={empForm.phone}
                      onChange={(e) => setEmpForm({...empForm, phone: e.target.value})}
                      className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Fecha de nacimiento
                    </label>
                    <input
                      type="date"
                      value={empForm.birthDate}
                      onChange={(e) => setEmpForm({...empForm, birthDate: e.target.value})}
                      className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      PIN de acceso
                    </label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      value={empForm.pin}
                      onChange={(e) => setEmpForm({...empForm, pin: e.target.value})}
                      className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700">
                    Color identificatorio único
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {EMPLOYEE_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setEmpForm({...empForm, color: hex})}
                        aria-label={`Color ${hex}`}
                        className={`h-9 w-9 rounded-full border-2 transition-transform cursor-pointer ${
                          empForm.color === hex
                            ? 'scale-110 border-slate-900 ring-2 ring-[#1B5E20]/30'
                            : 'border-white shadow-xs'
                        }`}
                        style={{backgroundColor: hex}}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={empSaving}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#2E7D32] px-5 py-3 text-sm font-bold text-white hover:bg-[#1B5E20] disabled:opacity-60 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{empSaving ? 'Guardando...' : 'Guardar Datos del Empleado'}</span>
                </button>
              </form>
            )}
            {!empForm && (
              <p className="mt-6 text-center text-sm text-slate-500">
                Todavía no hay empleados registrados en la nube.
              </p>
            )}
          </section>

          {/* Nómina completa de personal registrado en la nube */}
          <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs lg:col-span-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Base de Datos del Personal Registrado
                </h2>
                <p className="text-xs text-slate-600">
                  Todos los empleados que completaron su alta en EcoMapa quedan guardados de forma
                  permanente en Firebase.
                </p>
              </div>
              <button
                type="button"
                disabled={db.employees.length === 0}
                onClick={() => exportEmployeesToCSV(db.employees)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#1B5E20] px-4 py-2 text-xs font-bold text-white hover:bg-[#2E7D32] disabled:opacity-50 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Descargar Nómina en Excel / CSV</span>
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold text-slate-600">
                    <th className="py-2.5 pr-4">Color</th>
                    <th className="py-2.5 pr-4">Nombre y Apellido</th>
                    <th className="py-2.5 pr-4">DNI / Legajo</th>
                    <th className="py-2.5 pr-4">Teléfono</th>
                    <th className="py-2.5 pr-4">Nacimiento</th>
                    <th className="py-2.5">Fecha de Alta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.employees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Aún no hay personal registrado en la base de datos.
                      </td>
                    </tr>
                  ) : (
                    db.employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-[#F1F8E9]/45">
                        <td className="py-3 pr-4">
                          <span
                            className="inline-block h-4 w-4 rounded-full border border-black/15"
                            style={{backgroundColor: emp.color}}
                          />
                        </td>
                        <td className="py-3 pr-4 font-bold text-slate-900 whitespace-nowrap">
                          {emp.fullName}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-700 tabular-nums">
                          {emp.dni || '—'}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-700 tabular-nums">
                          {emp.phone || '—'}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-700 tabular-nums">
                          {emp.birthDate || '—'}
                        </td>
                        <td className="py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatDateTimeAR(emp.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Visor modal de fotografía adjunta */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onClick={() => setPreviewPhotoUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              aria-label="Cerrar foto"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Fotografía adjunta del contenedor"
              className="max-h-[75vh] w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </main>
  );
};
