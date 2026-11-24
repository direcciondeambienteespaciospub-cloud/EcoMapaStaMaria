import type {User} from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Phone,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {signInWithGoogle} from '../firebase';
import {checkIsAdminUser, ensureAdminProfileInCloud} from '../services/firebaseDb';
import {getTimeGreeting} from '../services/storage';
import type {Employee} from '../types';
import {EcoLogo} from './EcoLogo';

interface AuthScreenProps {
  firebaseUser: User | null;
  authReady: boolean;
  currentAccountEmployee: Employee | null;
  onLoginSuccess: (employee: Employee) => void;
  onRegisterSuccess: (data: {
    uid: string;
    firstName: string;
    lastName: string;
    dni: string;
    phone: string;
    birthDate: string;
    pin: string;
  }) => Promise<{ok: boolean; error?: string; employee?: Employee}>;
  onAdminSuccess: (masterKeyValidated: boolean) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  firebaseUser,
  authReady,
  currentAccountEmployee,
  onLoginSuccess,
  onRegisterSuccess,
  onAdminSuccess,
}) => {
  const [step, setStep] = useState<'welcome' | 'choice' | 'login' | 'register'>('welcome');

  const activeSavedEmp = currentAccountEmployee ?? null;

  // Estado de autenticación Google en curso
  const [googleBusy, setGoogleBusy] = useState(false);
  const [choiceError, setChoiceError] = useState('');

  // Saludo / Acceso rápido con PIN
  const [quickPin, setQuickPin] = useState('');
  const [quickError, setQuickError] = useState('');

  // Registro completo (Nombre, Apellido, DNI/Legajo, Teléfono, Fecha de nacimiento, PIN)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [pin, setPin] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerBusy, setRegisterBusy] = useState(false);

  // Modal de Administración
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);

  const greetingText = useMemo(() => {
    if (!activeSavedEmp) return '';
    return getTimeGreeting(activeSavedEmp.firstName);
  }, [activeSavedEmp]);

  const ensureGoogleSignedIn = async (forcePicker: boolean = false): Promise<User | null> => {
    if (!forcePicker && firebaseUser) return firebaseUser;
    setGoogleBusy(true);
    try {
      const cred = await signInWithGoogle(forcePicker);
      return cred.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed-by-user')) {
        throw new Error('Cerraste la ventana de Google antes de completar el ingreso.');
      }
      if (msg.includes('popup-blocked')) {
        throw new Error(
          'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes e intentá de nuevo.',
        );
      }
      throw new Error('No se pudo conectar con tu cuenta de Google. Intentá nuevamente.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleChooseLogin = async () => {
    setChoiceError('');
    setQuickError('');
    setQuickPin('');
    try {
      await ensureGoogleSignedIn(false);
      setStep('login');
    } catch (err) {
      setChoiceError(err instanceof Error ? err.message : 'Error al conectar con Google.');
    }
  };

  const handleChooseRegister = async () => {
    setChoiceError('');
    setRegisterError('');
    try {
      await ensureGoogleSignedIn(false);
      setStep('register');
    } catch (err) {
      setChoiceError(err instanceof Error ? err.message : 'Error al conectar con Google.');
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setChoiceError('');
    setQuickError('');
    setAdminError('');
    try {
      await ensureGoogleSignedIn(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar de cuenta Google.';
      if (showAdminModal) {
        setAdminError(msg);
      } else {
        setChoiceError(msg);
      }
    }
  };

  const handleQuickPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError('');
    if (!activeSavedEmp) return;
    if (quickPin.trim() !== activeSavedEmp.pin) {
      setQuickError('PIN incorrecto. Probá nuevamente.');
      return;
    }
    onLoginSuccess(activeSavedEmp);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setRegisterError('Ingresá tu nombre y apellido completos.');
      return;
    }
    if (dni.trim().length < 4) {
      setRegisterError('Ingresá un DNI o número de legajo válido.');
      return;
    }
    if (phone.trim().length < 6) {
      setRegisterError('Ingresá un número de teléfono de contacto.');
      return;
    }
    if (!birthDate) {
      setRegisterError('Seleccioná tu fecha de nacimiento.');
      return;
    }
    if (pin.trim().length < 4) {
      setRegisterError('Creá un PIN o contraseña de al menos 4 caracteres.');
      return;
    }

    setRegisterBusy(true);
    try {
      const user = await ensureGoogleSignedIn(false);
      if (!user) {
        setRegisterError('Necesitás conectar una cuenta de Google para guardar tu perfil.');
        return;
      }

      const res = await onRegisterSuccess({
        uid: user.uid,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dni: dni.trim(),
        phone: phone.trim(),
        birthDate,
        pin: pin.trim(),
      });

      if (!res.ok) {
        setRegisterError(res.error ?? 'No se pudo completar el registro.');
      }
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : 'No se pudo guardar el registro en la nube.',
      );
    } finally {
      setRegisterBusy(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminBusy(true);

    try {
      const user = await ensureGoogleSignedIn(false);
      if (!user) {
        setAdminError('Conectate con la cuenta Google de la Jefatura para continuar.');
        return;
      }

      const isAuthorized = await checkIsAdminUser(user);
      if (!isAuthorized) {
        setAdminError(
          `La cuenta conectada (${user.email ?? 'sin correo'}) no tiene permiso de Jefa de Área. Iniciá sesión con la cuenta administradora de la oficina o autorizá este ID desde Administración: ${user.uid}`,
        );
        return;
      }

      const profile = await ensureAdminProfileInCloud();
      if (adminPassword.trim() === profile.masterKey) {
        setShowAdminModal(false);
        setAdminPassword('');
        onAdminSuccess(true);
      } else {
        setAdminError('Clave incorrecta.');
      }
    } catch (err) {
      setAdminError(
        err instanceof Error
          ? err.message
          : 'No se pudo verificar el acceso administrativo en la nube.',
      );
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
      {step === 'welcome' && (
        <section className="rounded-3xl border border-emerald-950/10 bg-white p-7 shadow-xs sm:p-10">
          <div className="flex flex-col items-center text-center">
            <EcoLogo className="h-20 w-20" />
            <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-[#1B5E20] sm:text-4xl text-balance">
              Bienvenidos a EcoMapa
            </h1>

            <button
              type="button"
              onClick={() => {
                setChoiceError('');
                setStep('choice');
              }}
              className="mt-8 flex min-h-[56px] w-full max-w-sm items-center justify-center gap-2.5 rounded-2xl bg-[#1B5E20] px-6 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#2E7D32] active:scale-[0.99] cursor-pointer"
            >
              <span>Ingresar</span>
              <ArrowRight className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setAdminError('');
                setAdminPassword('');
                setShowAdminModal(true);
              }}
              className="mt-3 flex min-h-[56px] w-full max-w-sm items-center justify-center gap-2.5 rounded-2xl border-2 border-[#1B5E20] bg-white px-6 py-4 text-base font-bold text-[#1B5E20] transition-colors hover:bg-[#F1F8E9] active:scale-[0.99] cursor-pointer"
            >
              <ShieldCheck className="h-5 w-5" />
              <span>Administrativo</span>
            </button>
          </div>
        </section>
      )}

      {step === 'choice' && (
        <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep('welcome')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver</span>
            </button>

            {firebaseUser && (
              <button
                type="button"
                onClick={handleSwitchGoogleAccount}
                disabled={googleBusy}
                className="text-xs font-semibold text-[#1B5E20] hover:underline cursor-pointer"
              >
                Cambiar cuenta Google
              </button>
            )}
          </div>

          {choiceError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm font-medium text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <span>{choiceError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={googleBusy || !authReady}
              onClick={handleChooseLogin}
              className="flex min-h-[128px] flex-col items-center justify-center gap-3 rounded-2xl bg-[#1B5E20] px-6 py-6 text-white shadow-sm transition-colors hover:bg-[#2E7D32] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {googleBusy ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <LogIn className="h-7 w-7" />
              )}
              <span className="font-display text-xl font-extrabold">Iniciar Sesión</span>
            </button>

            <button
              type="button"
              disabled={googleBusy || !authReady}
              onClick={handleChooseRegister}
              className="flex min-h-[128px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-[#1B5E20] bg-white px-6 py-6 text-[#1B5E20] transition-colors hover:bg-[#F1F8E9] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {googleBusy ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <UserPlus className="h-7 w-7" />
              )}
              <span className="font-display text-xl font-extrabold">Registrarme</span>
            </button>
          </div>
        </section>
      )}

      {step === 'login' && (
        <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep('choice')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver</span>
            </button>

            {firebaseUser && (
              <button
                type="button"
                onClick={handleSwitchGoogleAccount}
                disabled={googleBusy}
                className="text-xs font-semibold text-[#1B5E20] hover:underline cursor-pointer"
              >
                Cambiar cuenta Google
              </button>
            )}
          </div>

          {activeSavedEmp ? (
            <form onSubmit={handleQuickPinSubmit} className="space-y-5">
              <div className="rounded-2xl border border-emerald-900/10 bg-[#F1F8E9] p-5">
                <div className="flex items-center gap-3.5">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white text-base font-extrabold text-white shadow-xs"
                    style={{backgroundColor: activeSavedEmp.color}}
                  >
                    {activeSavedEmp.firstName.charAt(0)}
                    {activeSavedEmp.lastName.charAt(0) || ''}
                  </span>
                  <div>
                    <h2 className="font-display text-2xl font-extrabold text-[#1B5E20] text-balance">
                      {greetingText}
                    </h2>
                    <p className="mt-0.5 font-mono text-xs text-slate-700 tabular-nums">
                      {activeSavedEmp.fullName} · DNI {activeSavedEmp.dni}
                    </p>
                  </div>
                </div>
              </div>

              {quickError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm font-medium text-red-900"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                  <span>{quickError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="quick-pin"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Ingresá tu PIN
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="quick-pin"
                    type="password"
                    inputMode="numeric"
                    required
                    autoFocus
                    value={quickPin}
                    onChange={(e) => setQuickPin(e.target.value)}
                    placeholder="Ingresá tu PIN"
                    className="min-h-[54px] w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 font-mono text-lg text-slate-900 placeholder:font-sans placeholder:text-sm placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1B5E20] px-6 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#2E7D32] active:scale-[0.99] cursor-pointer"
              >
                <UserCheck className="h-5 w-5" />
                <span>Validar PIN y Elegir Turno</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm font-medium text-slate-700">
                No hay un empleado registrado con esta cuenta Google ({firebaseUser?.email ?? ''}).
              </p>
              <button
                type="button"
                onClick={() => setStep('register')}
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl bg-[#1B5E20] px-6 py-3 text-sm font-bold text-white hover:bg-[#2E7D32] cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                <span>Registrarme</span>
              </button>
            </div>
          )}
        </section>
      )}

      {step === 'register' && (
        <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-xs sm:p-8">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep('choice')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver</span>
            </button>

            {firebaseUser && (
              <span className="truncate text-xs text-slate-500">{firebaseUser.email}</span>
            )}
          </div>

          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Registro de empleado
            </h2>

            {registerError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm font-medium text-red-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <span>{registerError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="reg-firstname"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Nombre
                </label>
                <div className="relative mt-1.5">
                  <UserPlus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-firstname"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ej: Juan"
                    className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-lastname"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Apellido
                </label>
                <input
                  id="reg-lastname"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ej: Quinteros"
                  className="mt-1.5 min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="reg-dni"
                  className="block text-sm font-semibold text-slate-800"
                >
                  DNI / Legajo
                </label>
                <input
                  id="reg-dni"
                  type="text"
                  inputMode="numeric"
                  required
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  placeholder="Ej: 36789123"
                  className="mt-1.5 min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-phone"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Teléfono
                </label>
                <div className="relative mt-1.5">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej: 3838-451290"
                    className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="reg-birthdate"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Fecha de nacimiento
                </label>
                <div className="relative mt-1.5">
                  <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-birthdate"
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 font-mono text-sm text-slate-900 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-pin"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Crear PIN / Contraseña
                </label>
                <div className="relative mt-1.5">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-pin"
                    type="password"
                    inputMode="numeric"
                    required
                    minLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Mínimo 4 dígitos"
                    className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={registerBusy}
              className="mt-2 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#2E7D32] px-6 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#1B5E20] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {registerBusy && <Loader2 className="h-5 w-5 animate-spin" />}
              <span>{registerBusy ? 'Guardando en la nube...' : 'Registrarme y Comenzar'}</span>
            </button>
          </form>
        </section>
      )}

      {/* Modal de clave para Jefa de Área */}
      {showAdminModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-modal-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F8E9] text-[#1B5E20]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3
                  id="admin-modal-title"
                  className="font-display text-lg font-bold text-slate-900"
                >
                  Panel de Administración
                </h3>
                <p className="text-xs text-slate-600">
                  Acceso exclusivo Jefa de Área · Oficina de Ambiente
                </p>
              </div>
            </div>

            <form onSubmit={handleAdminSubmit} className="mt-5 space-y-4">
              {adminError && (
                <div
                  role="alert"
                  className="space-y-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-900"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{adminError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchGoogleAccount}
                    className="text-xs font-bold text-[#1B5E20] underline cursor-pointer"
                  >
                    Cambiar cuenta Google
                  </button>
                </div>
              )}

              <div>
                <input
                  id="admin-master-key"
                  aria-label="Ingresá la clave"
                  type="password"
                  autoFocus
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Ingresá la clave (defecto: ADMIN2026)"
                  className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adminBusy}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#1B5E20] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2E7D32] disabled:opacity-60 cursor-pointer"
                >
                  {adminBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Ingresar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
