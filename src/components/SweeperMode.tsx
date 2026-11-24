import L from 'leaflet';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Navigation,
  Play,
  Square,
} from 'lucide-react';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {SANTA_MARIA_CENTER} from '../constants';
import {computeRouteDistance, formatTimeAR, isTodayAR} from '../services/storage';
import type {ContainerRecord, Employee, LatLngPoint, SweeperSession} from '../types';
import {BottomTray} from './BottomTray';

interface SweeperModeProps {
  employee: Employee;
  sweeperSessions: SweeperSession[];
  containers: ContainerRecord[];
  onStartSession: (initialPoint: LatLngPoint) => Promise<SweeperSession>;
  onAppendPoint: (sessionId: string, point: LatLngPoint) => Promise<void>;
  onFinishSession: (sessionId: string) => Promise<void>;
}

export const SweeperMode: React.FC<SweeperModeProps> = ({
  employee,
  sweeperSessions,
  containers,
  onStartSession,
  onAppendPoint,
  onFinishSession,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{release: () => Promise<void>} | null>(null);

  const [startingSession, setStartingSession] = useState(false);
  const [liveGpsPoint, setLiveGpsPoint] = useState<LatLngPoint | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'tracking' | 'error'>('idle');
  const [gpsMessage, setGpsMessage] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const activeSession = useMemo(
    () => sweeperSessions.find((s) => s.employeeId === employee.id && s.active) ?? null,
    [sweeperSessions, employee.id],
  );

  const currentPoint = useMemo<LatLngPoint | null>(() => {
    if (activeSession && activeSession.points.length > 0) {
      return activeSession.points[activeSession.points.length - 1];
    }
    return liveGpsPoint ?? SANTA_MARIA_CENTER;
  }, [activeSession, liveGpsPoint]);

  const todaySessions = useMemo(
    () => sweeperSessions.filter((s) => isTodayAR(s.startedAt)),
    [sweeperSessions],
  );

  const myTodayMeters = useMemo(
    () =>
      todaySessions
        .filter((s) => s.employeeId === employee.id)
        .reduce((sum, s) => sum + s.distanceMeters, 0),
    [todaySessions, employee.id],
  );

  const legendEntries = useMemo(() => {
    const byEmp = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        color: string;
        active: boolean;
        meters: number;
      }
    >();
    for (const s of todaySessions) {
      const existing = byEmp.get(s.employeeId);
      if (!existing) {
        byEmp.set(s.employeeId, {
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          color: s.employeeColor,
          active: s.active,
          meters: s.distanceMeters,
        });
      } else {
        existing.active = existing.active || s.active;
        existing.meters += s.distanceMeters;
      }
    }
    return Array.from(byEmp.values());
  }, [todaySessions]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: SANTA_MARIA_CENTER,
      zoom: 16,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layersGroupRef.current = group;

    // Ubicar automáticamente la calle real del empleado al abrir el mapa
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt: LatLngPoint = [pos.coords.latitude, pos.coords.longitude];
          setLiveGpsPoint(pt);
          map.setView(pt, 17, {animate: true});
        },
        () => {
          // Mantiene centro de Santa María si no hay permiso aún
        },
        {enableHighAccuracy: true, maximumAge: 15000, timeout: 8000},
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
      layersGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layersGroupRef.current;
    if (!group) return;
    group.clearLayers();

    for (const session of todaySessions) {
      if (session.points.length === 0) continue;

      const isMine = session.employeeId === employee.id;
      if (session.points.length >= 2) {
        const line = L.polyline(session.points, {
          color: session.employeeColor,
          weight: isMine ? 8 : 6,
          opacity: session.active ? 0.92 : 0.65,
          lineCap: 'round',
          lineJoin: 'round',
        });

        line.bindPopup(
          `<div style="font-family:sans-serif;min-width:150px">
            <strong style="color:${session.employeeColor}">${session.employeeName}</strong><br/>
            <span>${session.active ? 'Barriendo ahora' : 'Tramo finalizado'}</span><br/>
            <span>Inicio: ${formatTimeAR(session.startedAt)} · ${session.distanceMeters} m</span>
          </div>`,
        );
        line.addTo(group);
      }

      const lastPt = session.points[session.points.length - 1];
      const markerIcon = L.divIcon({
        className: 'custom-sweeper-pin',
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:${session.employeeColor};border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
          <span style="width:6px;height:6px;border-radius:9999px;background:#fff;"></span>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker(lastPt, {icon: markerIcon});
      marker.bindTooltip(
        `${session.employeeName}${isMine ? ' (Vos)' : ''} · ${session.distanceMeters} m`,
        {direction: 'top', offset: [0, -10]},
      );
      marker.addTo(group);
    }

    // Mostrar ubicación GPS actual antes de iniciar el recorrido
    if (!activeSession && liveGpsPoint) {
      L.circleMarker(liveGpsPoint, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1B5E20',
        fillOpacity: 1,
      })
        .bindTooltip('Tu ubicación GPS actual')
        .addTo(group);
    }
  }, [todaySessions, employee.id, activeSession, liveGpsPoint]);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSec(0);
      return;
    }
    const updateTimer = () => {
      const diff = Math.max(
        0,
        Math.floor((Date.now() - new Date(activeSession.startedAt).getTime()) / 1000),
      );
      setElapsedSec(diff);
    };
    updateTimer();
    const id = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(id);
  }, [activeSession]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Mantener pantalla/GPS activos mientras camina (Screen Wake Lock)
  useEffect(() => {
    const releaseLock = () => {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };

    if (!activeSession) {
      releaseLock();
      return;
    }

    if ('wakeLock' in navigator) {
      const navWithWakeLock = navigator as Navigator & {
        wakeLock?: {request: (type: 'screen') => Promise<{release: () => Promise<void>}>};
      };
      void navWithWakeLock.wakeLock
        ?.request('screen')
        .then((sentinel) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {});
    }

    return releaseLock;
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsStatus('error');
      setGpsMessage('Este navegador no soporta GPS. Abrí EcoMapa desde Google Chrome en tu celular.');
      return;
    }

    setGpsStatus('tracking');
    setGpsMessage('Buscando señal GPS precisa...');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const accuracy = Math.round(pos.coords.accuracy || 0);
        const pt: LatLngPoint = [pos.coords.latitude, pos.coords.longitude];
        setLiveGpsPoint(pt);

        // Filtrar saltos de antena celular muy imprecisos (> 65 m) para no deformar la calle
        if (accuracy > 65 && activeSession.points.length >= 1) {
          setGpsStatus('tracking');
          setGpsMessage(`Esperando mejor señal GPS (precisión actual ±${accuracy} m)...`);
          return;
        }

        setGpsStatus('tracking');
        setGpsMessage(`GPS en vivo conectado (precisión ±${accuracy || 10} m)`);
        void onAppendPoint(activeSession.id, pt);
        mapRef.current?.panTo(pt, {animate: true});
      },
      () => {
        setGpsStatus('error');
        setGpsMessage(
          'Sin señal GPS o permiso denegado. Verificá que la Ubicación del celular esté encendida.',
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeSession?.id, activeSession?.points.length, onAppendPoint]);

  const handleStartSweeping = async () => {
    if (startingSession) return;
    setGpsMessage('');
    setStartingSession(true);

    if (!('geolocation' in navigator)) {
      setStartingSession(false);
      setGpsStatus('error');
      setGpsMessage('Este dispositivo no tiene GPS. Usá la app desde un celular con ubicación activa.');
      return;
    }

    setGpsStatus('tracking');
    setGpsMessage('Obteniendo tu ubicación GPS real para iniciar...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const pt: LatLngPoint = [pos.coords.latitude, pos.coords.longitude];
        setLiveGpsPoint(pt);
        try {
          await onStartSession(pt);
          mapRef.current?.setView(pt, 17);
          setGpsMessage(`Recorrido iniciado con GPS real (±${Math.round(pos.coords.accuracy)} m).`);
        } finally {
          setStartingSession(false);
        }
      },
      () => {
        setStartingSession(false);
        setGpsStatus('error');
        setGpsMessage(
          'No se pudo obtener tu GPS. Activá la Ubicación del celular y permití el acceso en Chrome.',
        );
      },
      {enableHighAccuracy: true, maximumAge: 10000, timeout: 10000},
    );
  };

  const handleFinishSweeping = async () => {
    if (!activeSession) return;
    setGpsStatus('idle');
    setGpsMessage('Jornada guardada en la nube en tu historial del día.');
    await onFinishSession(activeSession.id);
  };

  const handleCenterOnMe = () => {
    if (activeSession && activeSession.points.length > 0) {
      mapRef.current?.setView(activeSession.points[activeSession.points.length - 1], 17, {
        animate: true,
      });
      return;
    }
    if (liveGpsPoint) {
      mapRef.current?.setView(liveGpsPoint, 17, {animate: true});
      return;
    }
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt: LatLngPoint = [pos.coords.latitude, pos.coords.longitude];
          setLiveGpsPoint(pt);
          mapRef.current?.setView(pt, 17, {animate: true});
        },
        () => {
          mapRef.current?.setView(SANTA_MARIA_CENTER, 16, {animate: true});
        },
        {enableHighAccuracy: true, timeout: 6000},
      );
    } else {
      mapRef.current?.setView(SANTA_MARIA_CENTER, 16, {animate: true});
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const activeDistance = activeSession ? computeRouteDistance(activeSession.points) : 0;

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-4 pt-4 pb-24 sm:px-6 lg:pt-6">
        <section className="rounded-3xl border border-emerald-950/10 bg-white p-4 shadow-xs sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                className="h-6 w-6 shrink-0 rounded-full border-2 border-white shadow-xs"
                style={{backgroundColor: employee.color}}
                aria-hidden="true"
              />
              <div>
                <h1 className="font-display text-lg font-extrabold text-slate-900 sm:text-xl">
                  Modo Barredor · {employee.fullName}
                </h1>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Tramo actual</p>
                <p className="font-mono text-base font-bold text-[#1B5E20] tabular-nums">
                  {activeDistance} m
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Total hoy</p>
                <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                  {myTodayMeters} m
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Tiempo turno</p>
                <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                  {activeSession ? formatDuration(elapsedSec) : '00:00'}
                </p>
              </div>
            </div>
          </div>

          {gpsMessage && (
            <div
              role="status"
              className={`mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
                gpsStatus === 'error'
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-emerald-200 bg-[#F1F8E9] text-[#1B5E20]'
              }`}
            >
              {gpsStatus === 'error' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D32]" />
              )}
              <span>{gpsMessage}</span>
            </div>
          )}
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="space-y-3 lg:col-span-8">
            <div className="relative overflow-hidden rounded-3xl border border-emerald-950/15 bg-white shadow-xs">
              <div
                ref={mapContainerRef}
                className="h-[50vh] min-h-[320px] w-full sm:h-[56vh]"
                aria-label="Mapa de barrido de Santa María, Catamarca"
              />
              <button
                type="button"
                onClick={handleCenterOnMe}
                title="Centrar mapa"
                className="absolute right-3 bottom-3 z-30 flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-md backdrop-blur-xs hover:bg-white cursor-pointer"
              >
                <Crosshair className="h-4 w-4 text-[#1B5E20]" />
                <span>Centrar</span>
              </button>
            </div>

            <div>
              {!activeSession ? (
                <button
                  type="button"
                  disabled={startingSession}
                  onClick={handleStartSweeping}
                  className="flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#1B5E20] px-5 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#2E7D32] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                >
                  <Play className="h-5 w-5 fill-current" />
                  <span>
                    {startingSession ? 'Iniciando recorrido...' : 'Iniciar Recorrido de Barrido'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinishSweeping}
                  className="flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 px-5 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-slate-800 active:scale-[0.99] cursor-pointer"
                >
                  <Square className="h-5 w-5 fill-current" />
                  <span>Finalizar Jornada de Barrido</span>
                </button>
              )}
            </div>
          </section>

          <aside className="rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-xs lg:col-span-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900">
                Calles pintadas hoy
              </h2>
              <Navigation className="h-4 w-4 text-[#2E7D32]" />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Visualización colaborativa en tiempo real. Evitá repasar calles ya pintadas por otro
              compañero.
            </p>

            <div className="mt-4 divide-y divide-slate-100">
              {legendEntries.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  Todavía no hay recorridos registrados hoy.
                </p>
              ) : (
                legendEntries.map((entry) => (
                  <div
                    key={entry.employeeId}
                    className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                        style={{backgroundColor: entry.color}}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {entry.employeeName}
                          {entry.employeeId === employee.id ? ' (Vos)' : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.active ? 'En recorrido activo' : 'Jornada finalizada'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-800 tabular-nums shrink-0">
                      {entry.meters} m
                    </span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </main>

      <BottomTray
        employee={employee}
        role="barredor"
        currentLocation={currentPoint}
        sweeperSessions={sweeperSessions}
        containers={containers}
      />
    </>
  );
};
