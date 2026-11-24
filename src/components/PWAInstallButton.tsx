import {Download, X} from 'lucide-react';
import React, {useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#2E7D32] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1B5E20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B5E20] whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-800/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#1B5E20] transition-colors hover:bg-[#F1F8E9] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Instalar</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl border border-emerald-900/15 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-bold text-slate-900">
                  Instalar en iPhone o iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Cerrar guía"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-700">
                <li>
                  1. Tocá el botón <strong>Compartir</strong> en la barra inferior de Safari.
                </li>
                <li>
                  2. Deslizá hacia abajo y elegí <strong>Agregar a inicio</strong>.
                </li>
                <li>
                  3. Confirmá tocando <strong>Agregar</strong> para usar EcoMapa como app.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-xl bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2E7D32] cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
