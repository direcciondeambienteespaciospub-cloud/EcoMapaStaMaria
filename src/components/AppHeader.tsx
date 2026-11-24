import {ArrowLeft, LogOut, WifiOff} from 'lucide-react';
import React, {useState} from 'react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import type {AppView, Employee} from '../types';
import {EcoLogo} from './EcoLogo';
import {PWAInstallButton} from './PWAInstallButton';

interface AppHeaderProps {
  view: AppView;
  currentEmployee: Employee | null;
  onChangeRole: () => void;
  onLogout: () => void;
  onExitAdmin: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  view,
  currentEmployee,
  onChangeRole,
  onLogout,
  onExitAdmin,
}) => {
  const isOnline = useOnlineStatus();
  const [muniImgError, setMuniImgError] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 h-14 border-b border-emerald-950/10 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Izquierda: Logo propio de la App + Nombre */}
          <div className="flex min-w-0 items-center gap-2.5">
            <EcoLogo className="h-9 w-9 shrink-0" />
            <span className="truncate font-display text-base font-bold tracking-tight text-[#1B5E20] sm:text-lg whitespace-nowrap">
              EcoMapa
            </span>
          </div>

          {/* Derecha: Acción contextual + Escudo Municipalidad de Santa María */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />

            {(view === 'barredor' || view === 'recolector') && (
              <button
                type="button"
                onClick={onChangeRole}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-900/15 bg-[#F1F8E9] px-3 py-1.5 text-xs font-semibold text-[#1B5E20] transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cambiar turno</span>
                <span className="sm:hidden">Turno</span>
              </button>
            )}

            {view === 'role-select' && currentEmployee && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Salir</span>
              </button>
            )}

            {view === 'admin' && (
              <button
                type="button"
                onClick={onExitAdmin}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Salir Admin</span>
              </button>
            )}

            {/* Escudo oficial de la Municipalidad de Santa María (discreto en esquina superior derecha) */}
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-[#1B2B5E]"
              title="Municipalidad de Santa María, Catamarca"
            >
              {!muniImgError ? (
                <img
                  src="/assets/aistudio/images_5e309c8c.jpg"
                  alt="Escudo Municipalidad de Santa María"
                  referrerPolicy="no-referrer"
                  onError={() => setMuniImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-bold text-white">MSM</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Modo sin conexión — Datos guardados en el dispositivo</span>
        </div>
      )}
    </>
  );
};
