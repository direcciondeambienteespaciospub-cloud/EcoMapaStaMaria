import L from 'leaflet';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Crosshair,
  Lock,
  MapPin,
  Navigation,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  BARRIO_COORDS,
  CONTAINER_STATUS_META,
  SANTA_MARIA_BARRIOS,
  SANTA_MARIA_CENTER,
} from '../constants';
import {
  compressImageToDataUrl,
  escapeHtml,
  formatDateTimeAR,
  formatTimeAR,
  groupContainersByLocation,
  isTodayAR,
} from '../services/storage';
import type {
  ContainerRecord,
  ContainerStatus,
  Employee,
  LatLngPoint,
  SweeperSession,
} from '../types';
import {BottomTray} from './BottomTray';

interface CollectorModeProps {
  employee: Employee;
  containers: ContainerRecord[];
  sweeperSessions: SweeperSession[];
  onRegisterContainer: (data: {
    barrio: string;
    reference: string;
    lat: number | null;
    lng: number | null;
    locationSource: 'gps' | 'manual';
    status: ContainerStatus;
    comment: string;
    photoDataUrl?: string;
  }) => Promise<ContainerRecord>;
  onUpdateCollectorLocation: (location: LatLngPoint) => Promise<void>;
}

const QUICK_COMMENTS = [
  'Tapa rota',
  'Falta rueda izquierda',
  'Basura acumulada alrededor',
  'Requiere lavado urgente',
  'Sin novedades',
];

export const CollectorMode: React.FC<CollectorModeProps> = ({
  employee,
  containers,
  sweeperSessions,
  onRegisterContainer,
  onUpdateCollectorLocation,
}) => {
  const liveMapContainerRef = useRef<HTMLDivElement | null>(null);
  const liveMapRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [locationMode, setLocationMode] = useState<'gps' | 'manual'>('gps');
  const [barrio, setBarrio] = useState<string>('Centro');
  const [reference, setReference] = useState<string>('');
  const [coords, setCoords] = useState<LatLngPoint | null>(null);
  const [currentEmpLoc, setCurrentEmpLoc] = useState<LatLngPoint>(SANTA_MARIA_CENTER);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsFeedback, setGpsFeedback] = useState<string>('');
  const [status, setStatus] = useState<ContainerStatus>('optimo');
  const [comment, setComment] = useState<string>('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [photoProcessing, setPhotoProcessing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [systemNow, setSystemNow] = useState<string>(new Date().toISOString());

  const [mapScope, setMapScope] = useState<'all' | 'today'>('all');
  const [selectedSpotLabel, setSelectedSpotLabel] = useState<string>('');

  useEffect(() => {
    const id = window.setInterval(() => {
      setSystemNow(new Date().toISOString());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let wakeLockSentinel: {release: () => Promise<void>} | null = null;
    if ('wakeLock' in navigator) {
      const navWithWakeLock = navigator as Navigator & {
        wakeLock?: {request: (type: 'screen') => Promise<{release: () => Promise<void>}>};
      };
      void navWithWakeLock.wakeLock
        ?.request('screen')
        .then((sentinel) => {
          wakeLockSentinel = sentinel;
        })
        .catch(() => {});
    }

    if (!('geolocation' in navigator)) {
      void onUpdateCollectorLocation(SANTA_MARIA_CENTER);
      return () => {
        if (wakeLockSentinel) void wakeLockSentinel.release().catch(() => {});
      };
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy && pos.coords.accuracy > 65) return;
        const pt: LatLngPoint = [pos.coords.latitude, pos.coords.longitude];
        setCurrentEmpLoc(pt);
        void onUpdateCollectorLocation(pt);
      },
      () => {
        // Mantiene última ubicación conocida si falla momentáneamente el GPS
      },
      {enableHighAccuracy: true, maximumAge: 5000, timeout: 12000},
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (wakeLockSentinel) {
        void wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [onUpdateCollectorLocation]);

  // Mapa en tiempo real mostrando TODOS los contenedores cargados simultáneamente + pin nuevo
  useEffect(() => {
    if (!liveMapContainerRef.current || liveMapRef.current) return;

    const map = L.map(liveMapContainerRef.current, {
      center: SANTA_MARIA_CENTER,
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickedPt: LatLngPoint = [e.latlng.lat, e.latlng.lng];
      setCoords(clickedPt);
      setCurrentEmpLoc(clickedPt);
      setLocationMode('gps');
      setGpsFeedback('Punto marcado sobre el mapa de Santa María.');
      onUpdateCollectorLocation(clickedPt);
    });

    const group = L.layerGroup().addTo(map);
    liveMapRef.current = map;
    layersGroupRef.current = group;

    return () => {
      map.remove();
      liveMapRef.current = null;
      layersGroupRef.current = null;
    };
  }, [onUpdateCollectorLocation]);

  const containerGroups = useMemo(() => {
    const baseGroups = groupContainersByLocation(containers);
    if (mapScope === 'today') {
      return baseGroups.filter((g) => g.hasTodayReport);
    }
    return baseGroups;
  }, [containers, mapScope]);

  // Renderizar contenedores fijos celestes en tiempo real + historial diario al hacer clic
  useEffect(() => {
    const group = layersGroupRef.current;
    const map = liveMapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    for (const item of containerGroups) {
      const latestMeta = CONTAINER_STATUS_META[item.latest.status];
      const dotColor = item.hasTodayReport ? latestMeta.hex : '#94A3B8';
      const icon = L.divIcon({
        className: 'collector-permanent-pin',
        html: `<div style="position:relative;width:24px;height:24px;border-radius:7px;background:#0284C7;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;font-family:sans-serif;">C<span style="position:absolute;right:-4px;bottom:-4px;width:10px;height:10px;border-radius:9999px;background:${dotColor};border:2px solid #ffffff;"></span></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const historyHtml = item.history
        .slice(0, 12)
        .map((h) => {
          const meta = CONTAINER_STATUS_META[h.status];
          const photoHtml = h.photoDataUrl
            ? `<img src="${h.photoDataUrl}" alt="Foto" style="margin-top:4px;width:100%;max-height:80px;object-fit:cover;border-radius:6px;" />`
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

      const btnId = `select-cont-${item.key.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const popupHtml = `<div style="font-family:sans-serif;min-width:210px;max-width:250px;">
        <div style="font-size:11px;font-weight:800;color:#0284C7;">CONTENEDOR FIJO · ${escapeHtml(item.barrio)}</div>
        <div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(item.reference)}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">${item.history.length} reporte(s) diarios · ${item.hasTodayReport ? 'Actualizado hoy' : 'Pendiente hoy'}</div>
        <button id="${btnId}" type="button" style="margin-top:8px;width:100%;padding:7px 10px;border-radius:8px;border:none;background:#0284C7;color:#ffffff;font-weight:700;font-size:11px;cursor:pointer;">
          Cargar reporte de hoy aquí
        </button>
        <div style="margin-top:8px;max-height:175px;overflow-y:auto;">${historyHtml}</div>
      </div>`;

      const marker = L.marker([item.lat, item.lng], {icon}).bindPopup(popupHtml);
      marker.on('popupopen', () => {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.onclick = () => {
            setBarrio(item.barrio);
            setReference(item.reference);
            setCoords([item.lat, item.lng]);
            setCurrentEmpLoc([item.lat, item.lng]);
            setLocationMode('gps');
            setSelectedSpotLabel(`${item.barrio} · ${item.reference}`);
            setGpsFeedback('Contenedor fijo seleccionado. Elegí el estado de hoy y guardá.');
            setSavedNotice('');
            setFormError('');
            marker.closePopup();
          };
        }
      });
      marker.addTo(group);
    }

    if (coords) {
      const selectedIcon = L.divIcon({
        className: 'collector-new-pin',
        html: `<div style="width:26px;height:26px;border-radius:9999px;background:#1B5E20;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;">+</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker(coords, {icon: selectedIcon})
        .bindTooltip(selectedSpotLabel ? 'Contenedor fijo seleccionado' : 'Nuevo contenedor a registrar')
        .addTo(group);
      map.panTo(coords, {animate: true});
    }
  }, [containerGroups, coords, selectedSpotLabel]);

  const myTodayRecords = useMemo(
    () =>
      containers.filter(
        (c) => c.employeeId === employee.id && isTodayAR(c.createdAt),
      ),
    [containers, employee.id],
  );

  const handleCaptureGPS = () => {
    setFormError('');
    setSavedNotice('');
    setLocationMode('gps');

    if (!('geolocation' in navigator)) {
      const fallback = BARRIO_COORDS[barrio] ?? SANTA_MARIA_CENTER;
      setCoords(fallback);
      setCurrentEmpLoc(fallback);
      setGpsFeedback(
        'Sin GPS del navegador: se ubicó el punto aproximado en Santa María. Tocá el mapa para ajustarlo.',
      );
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt: LatLngPoint = [pos.coords.latitude, pos.coords.longitude];
        setCoords(pt);
        setCurrentEmpLoc(pt);
        setGpsLoading(false);
        setGpsFeedback(
          `Ubicación GPS capturada con éxito (precisión ±${Math.round(pos.coords.accuracy)} m).`,
        );
        liveMapRef.current?.setView(pt, 17, {animate: true});
        void onUpdateCollectorLocation(pt);
      },
      () => {
        setGpsLoading(false);
        const fallback = BARRIO_COORDS[barrio] ?? SANTA_MARIA_CENTER;
        setCoords(fallback);
        setCurrentEmpLoc(fallback);
        setGpsFeedback(
          'No se pudo obtener señal GPS precisa. Tocá el mapa para ajustar el punto o usá carga manual.',
        );
      },
      {enableHighAccuracy: true, maximumAge: 10000, timeout: 10000},
    );
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError('');
    setPhotoProcessing(true);
    try {
      const compressed = await compressImageToDataUrl(file, 640, 0.68);
      setPhotoDataUrl(compressed);
    } catch {
      setFormError('No se pudo procesar la foto seleccionada. Probá con otra imagen.');
    } finally {
      setPhotoProcessing(false);
      e.target.value = '';
    }
  };

  const handleQuickComment = (text: string) => {
    setComment((prev) => {
      if (!prev.trim()) return text;
      if (prev.toLowerCase().includes(text.toLowerCase())) return prev;
      return `${prev.trim()}. ${text}`;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError('');
    setSavedNotice('');

    if (locationMode === 'gps' && !coords && !reference.trim()) {
      setFormError(
        'Capturá la ubicación GPS (o tocá un punto en el mapa) o cambiá a Carga Manual por Barrio.',
      );
      return;
    }

    if (locationMode === 'manual' && !reference.trim()) {
      setFormError('Escribí la calle o referencia del contenedor para ubicarlo fácilmente.');
      return;
    }

    const fallbackCoords = BARRIO_COORDS[barrio] ?? SANTA_MARIA_CENTER;
    const finalLat = coords ? coords[0] : fallbackCoords[0];
    const finalLng = coords ? coords[1] : fallbackCoords[1];

    setSaving(true);
    try {
      const created = await onRegisterContainer({
        barrio,
        reference:
          reference.trim() ||
          `Punto GPS en ${barrio} (${finalLat.toFixed(5)}, ${finalLng.toFixed(5)})`,
        lat: finalLat,
        lng: finalLng,
        locationSource: locationMode,
        status,
        comment: comment.trim() || CONTAINER_STATUS_META[status].label,
        photoDataUrl,
      });

      void onUpdateCollectorLocation([finalLat, finalLng]);
      setCurrentEmpLoc([finalLat, finalLng]);
      setReference('');
      setComment('');
      setPhotoDataUrl(undefined);
      setCoords(null);
      setSelectedSpotLabel('');
      setGpsFeedback('');
      setStatus('optimo');
      setSavedNotice(
        `Contenedor guardado en la nube a las ${formatTimeAR(created.createdAt)}.`,
      );
    } catch {
      setFormError('No se pudo guardar el registro en la nube. Intentá nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-4 pt-4 pb-24 sm:px-6 lg:pt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Formulario de registro de contenedor */}
          <section className="rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-xs sm:p-7 lg:col-span-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-xl font-extrabold text-slate-900 sm:text-2xl">
                  Registro de Contenedor
                </h1>
                <p className="mt-0.5 text-xs text-slate-600">
                  Modo Recolector · Oficina de Ambiente Santa María
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F1F8E9] text-[#1B5E20]">
                <Trash2 className="h-6 w-6" />
              </div>
            </div>

            {savedNotice && (
              <div
                role="status"
                className="mt-4 flex items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-950"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B5E20]" />
                <span>{savedNotice}</span>
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="mt-4 flex items-center gap-2.5 rounded-2xl border border-red-300 bg-red-50 p-3.5 text-sm font-semibold text-red-900"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-700" />
                <span>{formError}</span>
              </div>
            )}

            {selectedSpotLabel && (
              <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-3.5 py-2.5 text-xs font-bold text-sky-950">
                <span className="truncate">
                  Actualizando contenedor fijo: {selectedSpotLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSpotLabel('');
                    setCoords(null);
                    setReference('');
                    setGpsFeedback('');
                  }}
                  className="shrink-0 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-100 cursor-pointer"
                >
                  Cargar uno nuevo
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-6">
              {/* 1. Ubicación */}
              <div>
                <span className="block text-sm font-bold text-slate-900">
                  1. Ubicación del contenedor
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-emerald-900/10 bg-[#F1F8E9] p-1.5">
                  <button
                    type="button"
                    onClick={() => setLocationMode('gps')}
                    className={`min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer sm:text-sm ${
                      locationMode === 'gps'
                        ? 'bg-[#1B5E20] text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    GPS / Mapa en vivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMode('manual')}
                    className={`min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer sm:text-sm ${
                      locationMode === 'manual'
                        ? 'bg-[#1B5E20] text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    Manual por Barrio
                  </button>
                </div>

                {locationMode === 'gps' && (
                  <div className="mt-3 space-y-3">
                    <button
                      type="button"
                      onClick={handleCaptureGPS}
                      disabled={gpsLoading}
                      className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#2E7D32] px-4 py-3 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#1B5E20] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                    >
                      <Crosshair className="h-5 w-5" />
                      <span>
                        {gpsLoading ? 'Obteniendo señal GPS...' : 'Capturar Ubicación GPS Actual'}
                      </span>
                    </button>

                    {gpsFeedback && (
                      <p className="text-xs font-medium text-[#1B5E20]">{gpsFeedback}</p>
                    )}

                    {coords && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-[#F1F8E9] px-3.5 py-2 font-mono text-xs text-slate-900 tabular-nums">
                        <span>
                          Lat: {coords[0].toFixed(5)} · Lng: {coords[1].toFixed(5)}
                        </span>
                        <span className="font-sans font-semibold text-[#1B5E20]">Marcado</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="cont-barrio"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Barrio / Zona
                    </label>
                    <select
                      id="cont-barrio"
                      value={barrio}
                      onChange={(e) => {
                        const nextBarrio = e.target.value;
                        setBarrio(nextBarrio);
                        if (BARRIO_COORDS[nextBarrio]) {
                          liveMapRef.current?.setView(BARRIO_COORDS[nextBarrio], 15);
                        }
                      }}
                      className="mt-1 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                    >
                      {SANTA_MARIA_BARRIOS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="cont-ref"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Calle / Referencia{' '}
                      {locationMode === 'manual' ? '(Obligatorio)' : '(Opcional)'}
                    </label>
                    <input
                      id="cont-ref"
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Ej: Mitre esq. Sarmiento"
                      className="mt-1 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Estado visual del contenedor */}
              <div>
                <span className="block text-sm font-bold text-slate-900">
                  2. Estado del contenedor
                </span>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {(Object.keys(CONTAINER_STATUS_META) as ContainerStatus[]).map((key) => {
                    const meta = CONTAINER_STATUS_META[key];
                    const selected = status === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStatus(key)}
                        aria-pressed={selected}
                        className={`flex min-h-[60px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all cursor-pointer ${
                          selected
                            ? `${meta.bgClass} ${meta.borderClass} ${meta.textClass} shadow-xs`
                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{backgroundColor: meta.hex}}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold leading-tight">{meta.label}</p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] opacity-80">
                            {meta.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Comentario y Foto adjunta (opcional) */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="cont-comment"
                    className="block text-sm font-bold text-slate-900"
                  >
                    3. Comentario (opcional)
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_COMMENTS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleQuickComment(preset)}
                        className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-[#F1F8E9] hover:text-[#1B5E20] cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="cont-comment"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ej: Tapa rota, falta rueda izquierda..."
                    className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>

                {/* Foto adjunta opcional comprimida */}
                <div>
                  <span className="block text-sm font-bold text-slate-900">
                    4. Foto adjunta (opcional)
                  </span>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-[#2E7D32] bg-[#F1F8E9] px-4 py-2.5 text-sm font-bold text-[#1B5E20] transition-colors hover:bg-emerald-100 cursor-pointer">
                      <Camera className="h-5 w-5" />
                      <span>
                        {photoProcessing
                          ? 'Optimizando foto...'
                          : photoDataUrl
                            ? 'Cambiar foto'
                            : 'Tomar o adjuntar foto'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoChange}
                        className="sr-only"
                      />
                    </label>

                    {photoDataUrl && (
                      <div className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                        <img
                          src={photoDataUrl}
                          alt="Vista previa del contenedor"
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotoDataUrl(undefined)}
                          aria-label="Quitar foto"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Datos automáticos ocultos/inalterables */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Lock className="h-3.5 w-3.5 text-slate-500" />
                  <span>Datos automáticos inalterables del registro</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <span className="block text-[11px] text-slate-500">Empleado responsable</span>
                    <span className="text-sm font-bold text-slate-900">{employee.fullName}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500">Fecha y hora exacta</span>
                    <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {formatDateTimeAR(systemNow)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || photoProcessing}
                className="flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#1B5E20] px-6 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#2E7D32] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
              >
                <Save className="h-5 w-5" />
                <span>{saving ? 'Guardando en la nube...' : 'Guardar Registro de Contenedor'}</span>
              </button>
            </form>
          </section>

          {/* Columna derecha: Mapa en tiempo real con todos los contenedores cargados + Historial del día */}
          <div className="space-y-6 lg:col-span-5">
            <section className="overflow-hidden rounded-3xl border border-emerald-950/15 bg-white shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Contenedores fijos ({containerGroups.length})
                  </h2>
                  <p className="text-xs text-slate-600">
                    Tocá un pin celeste para ver su historial diario y cargar el reporte de hoy.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-xl border border-emerald-900/10 bg-[#F1F8E9] p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setMapScope('all')}
                      className={`rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                        mapScope === 'all'
                          ? 'bg-[#0284C7] text-white'
                          : 'text-slate-700 hover:text-slate-950'
                      }`}
                    >
                      Fijos
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapScope('today')}
                      className={`rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                        mapScope === 'today'
                          ? 'bg-[#1B5E20] text-white'
                          : 'text-slate-700 hover:text-slate-950'
                      }`}
                    >
                      Hoy
                    </button>
                  </div>
                </div>
              </div>
              <div
                ref={liveMapContainerRef}
                className="h-64 w-full sm:h-72"
                aria-label="Mapa en tiempo real de contenedores en Santa María"
              />
            </section>

            <aside className="rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-xs sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Mis registros de hoy
                </h2>
                <span className="font-mono text-sm font-bold text-[#1B5E20] tabular-nums">
                  {myTodayRecords.length}
                </span>
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {myTodayRecords.length === 0 ? (
                  <div className="py-8 text-center">
                    <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      Aún no cargaste contenedores hoy.
                    </p>
                  </div>
                ) : (
                  myTodayRecords.map((item) => {
                    const meta = CONTAINER_STATUS_META[item.status];
                    return (
                      <article key={item.id} className="py-3.5 first:pt-1 last:pb-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{item.barrio}</p>
                            <p className="text-xs text-slate-600">{item.reference}</p>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums shrink-0">
                            {formatTimeAR(item.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-bold ${meta.badgeBg}`}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{backgroundColor: meta.hex}}
                              aria-hidden="true"
                            />
                            {meta.shortLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                            <Navigation className="h-3 w-3" />
                            {item.locationSource === 'gps' ? 'GPS' : 'Manual'}
                          </span>
                        </div>
                        {item.comment && (
                          <p className="mt-1.5 text-xs text-slate-700">{item.comment}</p>
                        )}
                        {item.photoDataUrl && (
                          <img
                            src={item.photoDataUrl}
                            alt={`Foto ${item.barrio}`}
                            className="mt-2 h-24 w-32 rounded-xl border border-slate-200 object-cover"
                          />
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>

      <BottomTray
        employee={employee}
        role="recolector"
        currentLocation={currentEmpLoc}
        sweeperSessions={sweeperSessions}
        containers={containers}
      />
    </>
  );
};
