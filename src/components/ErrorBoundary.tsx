import {AlertTriangle, RefreshCw} from 'lucide-react';
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isPermissionError: boolean;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isPermissionError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'Ocurrió un error inesperado en la aplicación.';
    let isPermissionError = false;

    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        operationType?: string;
        path?: string | null;
      };
      if (parsed && typeof parsed.error === 'string') {
        isPermissionError =
          parsed.error.toLowerCase().includes('permission') ||
          parsed.error.toLowerCase().includes('insufficient');
        message = isPermissionError
          ? `No tenés permisos suficientes para realizar esta acción (${parsed.operationType ?? 'acceso'} en ${parsed.path ?? 'base de datos'}).`
          : parsed.error;
      }
    } catch {
      // Plain error message
    }

    return {
      hasError: true,
      message,
      isPermissionError,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('EcoMapa ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F1F8E9] p-4">
          <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-xl font-extrabold text-slate-900">
              {this.state.isPermissionError
                ? 'Permiso denegado en la nube'
                : 'Se interrumpió la conexión'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1B5E20] px-5 py-3 text-sm font-bold text-white hover:bg-[#2E7D32] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Recargar EcoMapa</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
