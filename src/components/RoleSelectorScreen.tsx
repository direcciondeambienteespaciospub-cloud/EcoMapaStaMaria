import {ArrowRight, MapPin, Trash2, User} from 'lucide-react';
import React from 'react';
import {isTodayAR} from '../services/storage';
import type {ContainerRecord, Employee, ShiftRole, SweeperSession} from '../types';

interface RoleSelectorScreenProps {
  employee: Employee;
  sweeperSessions: SweeperSession[];
  containers: ContainerRecord[];
  onSelectRole: (role: ShiftRole) => void;
}

export const RoleSelectorScreen: React.FC<RoleSelectorScreenProps> = ({
  employee,
  sweeperSessions,
  containers,
  onSelectRole,
}) => {
  const todaySweptMeters = sweeperSessions
    .filter((s) => s.employeeId === employee.id && isTodayAR(s.startedAt))
    .reduce((acc, s) => acc + s.distanceMeters, 0);

  const todayContainersCount = containers.filter(
    (c) => c.employeeId === employee.id && isTodayAR(c.createdAt),
  ).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      {/* Perfil del empleado autenticado y color asignado */}
      <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-2.5">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#1B5E20]/20 bg-[#F1F8E9] text-[#1B5E20] shadow-xs"
              aria-hidden="true"
            >
              <User className="h-8 w-8" />
            </div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl text-balance">
              {employee.fullName}
            </h1>
          </div>

          <div className="inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-[#F1F8E9] px-5 py-3">
            <span className="text-sm font-semibold text-slate-800">Tu color asignado es</span>
            <span
              className="h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-xs"
              style={{backgroundColor: employee.color}}
              aria-label="Color asignado"
            />
          </div>
        </div>

        {/* Resumen rápido del día del empleado */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
          <div>
            <p className="text-xs font-medium text-slate-600">Barrido acumulado hoy</p>
            <p className="mt-0.5 font-mono text-xl font-bold text-[#1B5E20] tabular-nums">
              {todaySweptMeters} m
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600">Contenedores cargados hoy</p>
            <p className="mt-0.5 font-mono text-xl font-bold text-[#1B5E20] tabular-nums">
              {todayContainersCount}
            </p>
          </div>
        </div>
      </section>

      {/* Selector de Rol: Dos botones grandes táctiles */}
      <section className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelectRole('barredor')}
            className="group flex min-h-[120px] flex-col justify-between rounded-3xl border-2 border-[#1B5E20] bg-[#1B5E20] p-6 text-left text-white shadow-sm transition-transform hover:bg-[#2E7D32] active:scale-[0.99] cursor-pointer"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <ArrowRight className="h-6 w-6 text-white/80 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-4">
              <span className="font-display text-2xl font-extrabold tracking-tight">
                Barrendero
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectRole('recolector')}
            className="group flex min-h-[120px] flex-col justify-between rounded-3xl border-2 border-[#2E7D32] bg-white p-6 text-left text-slate-900 shadow-xs transition-all hover:bg-[#F1F8E9] active:scale-[0.99] cursor-pointer"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F8E9] text-[#1B5E20]">
                <Trash2 className="h-6 w-6" />
              </div>
              <ArrowRight className="h-6 w-6 text-[#1B5E20] transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-4">
              <span className="font-display text-2xl font-extrabold tracking-tight text-[#1B5E20]">
                Recolector
              </span>
            </div>
          </button>
        </div>
      </section>
    </main>
  );
};
