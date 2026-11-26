import L from 'leaflet';
import {Calendar, ChevronDown, ChevronUp, MapPin, Phone, User} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {CONTAINER_STATUS_META, SANTA_MARIA_CENTER} from '../constants';
import {formatDateTimeAR, groupContainersByLocation, isTodayAR} from '../services/storage';
import type {
  ContainerRecord,
  Employee,
  LatLngPoint,
  ShiftRole,
  SweeperSession,
} from '../types';

interface BottomTrayProps {
  employee: Employee;
  role: ShiftRole;
  currentLocation?: LatLngPoint | null;
  sweeperSessions: SweeperSession[];
  containers: ContainerRecord[];
}

export const BottomTray: React.FC<BottomTrayProps> = ({
  employee,
  role,
  currentLocation,
  sweeperSessions,
  containers,
}) => {
  const [expanded, setExpanded] = useState(false);
  const trayMapContainerRef = useRef<HTMLDivElement | null>(null);
  const trayMapRef = useRef<L.Map | null>(null);
  const trayLayersRef = useRef<L.LayerGroup | null>(null);

  const todaySweptMeters = sweeperSessions
    .filter((s) => s.employeeId === employee.id && isTodayAR(s.startedAt))
    .reduce((acc, s) => acc + s.distanceMeters, 0);

  const todayContainersCount = containers.filter(
    (c) => c.employeeId === employee.id && isTodayAR(c.createdAt),
  ).length;

  // Inicializar mapa en vivo dentro de la bandeja al expandir
  useEffect(() => {
    if (!expanded) {
      if (trayMapRef.current) {
        trayMapRef.current.remove();
        trayMapRef.current = null;
        trayLayersRef.current = null;
      }
      return;
    }

    if (!trayMapContainerRef.current || trayMapRef.current) return;

    const center = currentLocation ?? SANTA_MARIA_CENTER;
    const map = L.map(trayMapContainerRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    trayMapRef.current = map;
    trayLayersRef.current = group;

    window.setTimeout(() => {
      map.invalidateSize();
    }, 80);

    return () => {
      map.remove();
      trayMapRef.current = null;
      trayLayersRef.current = null;
    };
  }, [expanded, currentLocation]);

  // Actualizar datos en tiempo real en el mapa de la bandeja
  useEffect(() => {
    if (!expanded || !trayLayersRef.current || !trayMapRef.current) return;
    const group = trayLayersRef.current;
    group.clearLayers();

    if (role === 'barredor') {
      for (const s of sweeperSessions) {
        if (!isTodayAR(s.startedAt) || s.points.length === 0) continue;
        if (s.points.length >= 2) {
          L.polyline(s.points, {
            color: s.employeeColor,
            weight: s.employeeId === employee.id ? 6 : 4,
            opacity: s.active ? 0.9 : 0.6,
          }).addTo(group);
        }
        const pt = s.points[s.points.length - 1];
        L.circleMarker(pt, {
          radius: 6,
          color: '#ffffff',
          weight: 2,
          fillColor: s.employeeColor,
          fillOpacity: 1,
        })
          .bindTooltip(`${s.employeeName} · ${s.distanceMeters} m`)
          .addTo(group);
      }
    } else {
      for (const item of groupContainersByLocation(containers)) {
        const meta = CONTAINER_STATUS_META[item.latest.status];
        L.circleMarker([item.lat, item.lng], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#0284C7',
          fillOpacity: 0.95,
        })
          .bindTooltip(
            `${item.barrio} · ${meta.shortLabel} (${formatDateTimeAR(item.latest.createdAt)})`,
          )
          .addTo(group);
      }
    }

    if (currentLocation) {
      L.circleMarker(currentLocation, {
        radius: 8,
        color: '#1B5E20',
        weight: 3,
        fillColor: employee.color,
        fillOpacity: 1,
      })
        .bindTooltip(`${employee.fullName} (Tu ubicación)`)
        .addTo(group);
    }
  }, [expanded, role, sweeperSessions, containers, currentLocation, employee]);

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}

      <section
        aria-label="Bandeja inferior de perfil y mapa en tiempo real"
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-emerald-950/15 bg-white/95 shadow-2xl backdrop-blur-md"
      >
        {/* Hoja expandida con ficha del empleado + mapa en tiempo real */}
        {expanded && (
          <div className="mx-auto max-h-[72vh] max-w-7xl overflow-y-auto px-4 pt-3 pb-4 sm:px-6">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              {/* Perfil completo del empleado */}
              <div className="rounded-2xl border border-emerald-950/10 bg-[#F1F8E9]/70 p-4 md:col-span-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white text-sm font-extrabold text-white shadow-xs"
                    style={{backgroundColor: employee.color}}
                  >
                    {employee.firstName.charAt(0)}
                    {employee.lastName.charAt(0) || ''}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-bold text-slate-900">
                      {employee.fullName}
                    </h3>
                    <p className="text-xs font-semibold text-[#1B5E20]">
                      Turno actual: {role === 'barredor' ? 'Barredor' : 'Recolector'}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                  <div>
                    <dt className="flex items-center gap-1 text-slate-500">
                      <User className="h-3.5 w-3.5" /> DNI / Legajo
                    </dt>
                    <dd className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                      {employee.dni}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-slate-500">
                      <Phone className="h-3.5 w-3.5" /> Teléfono
                    </dt>
                    <dd className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                      {employee.phone}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-slate-500">
                      <Calendar className="h-3.5 w-3.5" /> Nacimiento
                    </dt>
                    <dd className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                      {employee.birthDate || 'No informado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Actividad hoy</dt>
                    <dd className="mt-0.5 font-mono font-bold text-[#1B5E20] tabular-nums">
                      {role === 'barredor'
                        ? `${todaySweptMeters} m barridos`
                        : `${todayContainersCount} contenedores`}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Mapa en tiempo real dentro de la bandeja */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white md:col-span-7">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#1B5E20]" />
                    {role === 'barredor'
                      ? 'Mapa en vivo de calles barridas'
                      : 'Mapa en vivo de contenedores cargados'}
                  </span>
                  <span className="font-mono text-[11px] font-normal text-slate-500">
                    Santa María
                  </span>
                </div>
                <div
                  ref={trayMapContainerRef}
                  className="h-44 w-full sm:h-52"
                  aria-label="Mapa en tiempo real de la bandeja inferior"
                />
              </div>
            </div>
          </div>
        )}

        {/* Barra compacta inferior siempre visible */}
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-black/15"
              style={{backgroundColor: employee.color}}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 leading-tight">
                {employee.fullName}
              </p>
              <p className="truncate font-mono text-[11px] text-slate-600 tabular-nums">
                {role === 'barredor' ? 'Barredor' : 'Recolector'} · DNI {employee.dni}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#F1F8E9] px-3.5 py-2 text-xs font-bold text-[#1B5E20] border border-emerald-900/15 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{expanded ? 'Ocultar bandeja' : 'Perfil y Mapa'}</span>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </section>
    </>
  );
};
