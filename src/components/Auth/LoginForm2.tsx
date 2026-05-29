import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, Wifi, WifiOff, X, Store, Delete, UserPlus, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useEmployees } from '../../contexts/EmployeesContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  DesignSystem2CustomizationProvider,
  useDesignSystem2Customization,
} from '../../contexts/DesignSystem2CustomizationContext';
import LanguageSwitcher from '../LanguageSwitcher';
import DesignSystem2Customizer from '../DesignSystem2/DesignSystem2Customizer';
import { AdminActionButton } from '../ui/AdminActionButton';
import { useLogin2BrowserZoomCompensate } from '../../hooks/useLogin2BrowserZoomCompensate';
import { isSystemAdministrator } from '../../utils/systemAdmin';
import '../../styles/design-system-2-scope.css';

const PIN_LENGTH = 4;

interface LoginConnectivityStatusProps {
  isOnline: boolean;
  isSyncing: boolean;
}

const LoginConnectivityStatus: React.FC<LoginConnectivityStatusProps> = ({ isOnline, isSyncing }) => {
  const { t } = useTranslation();

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur-md"
      role="status"
    >
      {isOnline ? (
        <Wifi className="h-4 w-4 shrink-0 text-green-600" strokeWidth={2} aria-hidden />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={2} aria-hidden />
      )}
      <span className="tabular-nums">
        {isOnline ? t('login2.connectivityOnline') : t('login2.connectivityOffline')}
        {isSyncing ? ` · ${t('login2.connectivitySyncing')}` : ''}
      </span>
    </div>
  );
};

interface EmployeeDisplay {
  employeeNumber: string;
  name: string;
  role: string;
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin':
      return 'from-red-500 to-pink-600';
    case 'manager':
      return 'from-orange-500 to-amber-600';
    case 'cashier':
      return 'from-blue-500 to-purple-600';
    default:
      return 'from-gray-500 to-slate-600';
  }
};

const RoundAvatar: React.FC<{ role: string; sizeClass?: string; iconClass?: string }> = ({
  role,
  sizeClass = 'h-16 w-16',
  iconClass = 'w-8 h-8',
}) => (
  <div
    className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r ${getRoleColor(role)} ${sizeClass}`}
  >
    <User className={`text-white ${iconClass}`} />
  </div>
);

interface LoginPinNumpadProps {
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}

const LoginPinNumpad: React.FC<LoginPinNumpadProps> = ({ disabled, onDigit, onBackspace }) => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const keyClass =
    'flex h-full min-h-[3rem] max-h-full items-center justify-center rounded-xl border border-neutral-200 bg-white text-2xl font-semibold text-neutral-900 shadow-sm transition-all duration-150 hover:bg-neutral-50 active:scale-95 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className="grid h-full min-h-0 w-full max-w-[17rem] grid-cols-3 grid-rows-4 gap-3 mx-auto">
      {digits.map((d) => (
        <button key={d} type="button" disabled={disabled} className={keyClass} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <div aria-hidden className="min-h-0" />
      <button type="button" disabled={disabled} className={keyClass} onClick={() => onDigit('0')}>
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`${keyClass} bg-neutral-100 hover:bg-neutral-200`}
        onClick={onBackspace}
        aria-label="Backspace"
      >
        <Delete className="w-7 h-7" />
      </button>
    </div>
  );
};

const LoginForm2Inner: React.FC = () => {
  const { t } = useTranslation();
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const { settings } = useSettings();
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDisplay | null>(null);
  const [isOtherEmployee, setIsOtherEmployee] = useState(false);
  const [pin, setPin] = useState('');
  const [customEmployeeId, setCustomEmployeeId] = useState('');
  const [customPin, setCustomPin] = useState('');
  const [error, setError] = useState('');
  const [employeeList, setEmployeeList] = useState<EmployeeDisplay[]>([]);
  const submittingRef = useRef(false);

  const { signInWithEmployeeCredentials, isLoading } = useSupabaseAuth();
  const employeesContext = useEmployees();

  const companyLogoUrl = (settings.company as { logoUrl?: string }).logoUrl?.trim() || '';
  const hasSelection = isOtherEmployee || selectedEmployee !== null;

  const loadErrorIsLocalDb = useMemo(() => {
    const msg = employeesContext.loadError?.toLowerCase() ?? '';
    return (
      msg.includes('database') ||
      msg.includes('indexeddb') ||
      msg.includes('backing store') ||
      msg.includes('dexie') ||
      msg.includes('object store') ||
      msg.includes('idbtransaction') ||
      msg.includes('initialization failed')
    );
  }, [employeesContext.loadError]);

  useEffect(() => {
    if (employeesContext.employees.length === 0) {
      setEmployeeList([]);
      setSelectedEmployee(null);
      setIsOtherEmployee(false);
      return;
    }
    const displayEmployees: EmployeeDisplay[] = employeesContext.employees
      .filter(
        (emp) =>
          emp.is_active &&
          !emp.deleted_at &&
          !isSystemAdministrator({ employee_number: emp.employee_number })
      )
      .map((emp) => ({
        employeeNumber: emp.employee_number,
        name: emp.name,
        role: emp.role,
      }));
    setEmployeeList(displayEmployees);
    setSelectedEmployee((prev) => {
      if (isOtherEmployee) return prev;
      if (prev && displayEmployees.some((e) => e.employeeNumber === prev.employeeNumber)) {
        return prev;
      }
      return displayEmployees[0] ?? null;
    });
  }, [employeesContext.employees, isOtherEmployee]);

  const runSignIn = useCallback(
    async (employeeNumber: string, credential: string) => {
      if (!employeeNumber.trim() || !credential || submittingRef.current) return;

      submittingRef.current = true;
      setError('');

      try {
        const result = await signInWithEmployeeCredentials(employeeNumber.trim(), credential);

        if (!result.success) {
          setPin('');
          setCustomPin('');
          setError(result.error || t('login.invalidCredential', { type: t('login.credentialPin') }));
        }
      } catch {
        setPin('');
        setCustomPin('');
        setError(t('login.invalidCredential', { type: t('login.credentialPin') }));
      } finally {
        submittingRef.current = false;
      }
    },
    [signInWithEmployeeCredentials, t]
  );

  const submitEmployeePin = useCallback(
    async (pinValue: string) => {
      if (!selectedEmployee || isOtherEmployee || pinValue.length !== PIN_LENGTH) return;
      await runSignIn(selectedEmployee.employeeNumber, pinValue);
    },
    [selectedEmployee, isOtherEmployee, runSignIn]
  );

  useEffect(() => {
    if (!isOtherEmployee && pin.length === PIN_LENGTH && selectedEmployee && !isLoading) {
      void submitEmployeePin(pin);
    }
  }, [pin, selectedEmployee, isOtherEmployee, isLoading, submitEmployeePin]);

  const handleDigit = (digit: string) => {
    if (!hasSelection || isLoading) return;
    setError('');

    if (isOtherEmployee) {
      setCustomPin((prev) => (prev.length >= 32 ? prev : prev + digit));
      return;
    }

    if (!selectedEmployee || pin.length >= PIN_LENGTH) return;
    setPin((prev) => prev + digit);
  };

  const handleBackspace = () => {
    if (isLoading) return;
    setError('');

    if (isOtherEmployee) {
      setCustomPin((prev) => prev.slice(0, -1));
      return;
    }

    setPin((prev) => prev.slice(0, -1));
  };

  const handleEmployeeSelect = (employee: EmployeeDisplay) => {
    setIsOtherEmployee(false);
    setSelectedEmployee(employee);
    setPin('');
    setCustomEmployeeId('');
    setCustomPin('');
    setError('');
  };

  const handleOtherEmployeeSelect = () => {
    setIsOtherEmployee(true);
    setSelectedEmployee(null);
    setPin('');
    setCustomEmployeeId('');
    setCustomPin('');
    setError('');
  };

  const handleOtherSignIn = () => {
    if (!customEmployeeId.trim()) {
      setError(t('login2.employeeIdPlaceholder'));
      return;
    }
    if (!customPin) {
      setError(t('login.selectEmployeeAndCredential', { type: t('login.credentialPin') }));
      return;
    }
    void runSignIn(customEmployeeId, customPin);
  };

  const pagePadding = layoutClasses.contentInsetX;

  const scopeRoot = (children: React.ReactNode, extraClass = '') => (
    <div
      className={`ds2-visual-scope flex h-full min-h-0 w-full flex-col overflow-hidden ${layoutClasses.rootBg} ${extraClass}`}
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      {children}
    </div>
  );

  const inputClass =
    'w-full px-4 py-2.5 text-base bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent transition-all box-border min-h-touch-sm';

  if (employeesContext.isLoading) {
    return scopeRoot(
      <div className={`flex flex-1 min-h-0 flex-col items-center justify-center ${pagePadding}`}>
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <h1 className="mt-4 text-2xl font-bold text-neutral-900">{t('login.loadingEmployees')}</h1>
        <p className="mt-2 text-lg text-neutral-600">{t('login.loadingEmployeesSub')}</p>
      </div>
    );
  }

  if (employeesContext.loadError) {
    return scopeRoot(
      <div className={`flex flex-1 min-h-0 flex-col items-center justify-center text-center ${pagePadding}`}>
        <div className="mx-auto mb-6 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.25rem] border border-neutral-200/80 bg-neutral-100 shadow-sm">
          <WifiOff className="h-10 w-10 text-neutral-400" strokeWidth={1.5} aria-hidden />
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">
          {loadErrorIsLocalDb ? t('login.loadErrorLocalDbTitle') : t('login.loadErrorTitle')}
        </h1>
        <p className="text-xl text-neutral-600 mb-4 max-w-2xl">
          {loadErrorIsLocalDb ? t('login.loadErrorLocalDbBody') : employeesContext.loadError}
        </p>
        {!loadErrorIsLocalDb && (
          <p className="text-lg text-neutral-500 mb-6">{t('login.loadErrorGenericHint')}</p>
        )}
        <AdminActionButton
          variant="primary"
          label={t('login.retry')}
          className="ds2-control-radius-lg min-h-touch-sm !px-8"
          onClick={() => {
            void employeesContext.refreshEmployees();
          }}
        />
      </div>
    );
  }

  return scopeRoot(
    <div className={`flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden ${pagePadding} py-3`}>
      {employeesContext.syncError && !employeesContext.loadError && (
        <div
          className={`mb-2 shrink-0 flex items-start gap-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-3 shadow-sm ${layoutClasses.contentColumnMaxW} mx-auto w-full`}
          role="status"
        >
          <WifiOff className="w-6 h-6 shrink-0 text-orange-600 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-neutral-900">{t('login.syncDegradedTitle')}</p>
            <p className="text-sm text-neutral-700 mt-0.5 line-clamp-2">{t('login.syncDegradedBody')}</p>
          </div>
          <button
            type="button"
            onClick={() => employeesContext.clearSyncError()}
            className="shrink-0 min-h-touch-sm min-w-touch-sm rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors duration-200"
            aria-label={t('login.syncDegradedDismiss')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col gap-2 overflow-hidden">
        {/* Header: connectivity | logo | language — grid avoids clipping under overflow-hidden */}
        <header className="w-full shrink-0">
          <div className="mb-3 grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
            <div className="flex min-w-0 justify-start self-start">
              {employeesContext.syncStatus ? (
                <LoginConnectivityStatus
                  isOnline={employeesContext.syncStatus.isOnline}
                  isSyncing={employeesContext.syncStatus.isSyncing}
                />
              ) : null}
            </div>
            <div className="flex shrink-0 justify-center px-2">
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={settings.company.name}
                  className="h-20 w-20 object-contain"
                />
              ) : (
                <div className="flex flex-col items-center text-neutral-400">
                  <Store className="h-16 w-16" aria-hidden />
                  <span className="sr-only">{t('login2.logoPlaceholder')}</span>
                </div>
              )}
            </div>
            <div className="flex min-w-0 justify-end self-start">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-4xl font-bold text-neutral-900 mb-1 leading-tight">{t('login2.welcome')}</h1>
            <p className="text-xl text-neutral-500 font-medium">{t('login2.signInToContinue')}</p>
          </div>
        </header>

        {/* Employee carousel — horizontal scroll only; vertical padding for selection ring */}
        <section className="w-full shrink-0">
          <h2 className="text-2xl font-bold text-neutral-900 mb-2 text-left">
            {t('login.selectEmployee')}
          </h2>

          {employeeList.length === 0 && (
            <p className="text-sm text-orange-600 font-medium mb-1">{t('login2.noStaff')}</p>
          )}

          <div
            className="flex w-full gap-3 overflow-x-auto overflow-y-visible px-1 py-3 snap-x snap-mandatory scroll-smooth"
            role="listbox"
            aria-label={t('login.selectEmployee')}
          >
            {employeeList.map((employee) => {
              const isSelected =
                !isOtherEmployee && selectedEmployee?.employeeNumber === employee.employeeNumber;
              return (
                <button
                  key={employee.employeeNumber}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleEmployeeSelect(employee)}
                  className={`snap-start shrink-0 w-40 flex flex-col items-center rounded-2xl border-2 px-3 py-5 transition-all duration-200 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-500 ring-offset-2 z-10 relative'
                      : 'border-neutral-200 bg-white shadow-sm hover:border-neutral-300 hover:shadow-md'
                  }`}
                >
                  <RoundAvatar role={employee.role} sizeClass="h-14 w-14 mb-2" iconClass="w-7 h-7" />
                  <span className="text-sm font-bold text-neutral-900 text-center leading-tight line-clamp-2">
                    {employee.name}
                  </span>
                  <span className="text-xs text-neutral-500 capitalize mt-1">{employee.role}</span>
                </button>
              );
            })}

            <button
              type="button"
              role="option"
              aria-selected={isOtherEmployee}
              onClick={handleOtherEmployeeSelect}
              className={`snap-start shrink-0 w-40 flex flex-col items-center rounded-2xl border-2 px-3 py-5 transition-all duration-200 ${
                isOtherEmployee
                  ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-500 ring-offset-2 z-10 relative'
                  : 'border-neutral-200 bg-white shadow-sm hover:border-neutral-300 hover:shadow-md'
              }`}
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-slate-500 to-slate-600 mb-2">
                <UserPlus className="w-7 h-7 text-white" />
              </div>
              <span className="text-sm font-bold text-neutral-900 text-center leading-tight">
                {t('login2.otherEmployee')}
              </span>
              <span className="text-xs text-neutral-500 mt-1">{t('login2.customId')}</span>
            </button>
          </div>
        </section>

        {/* PIN entry card — flex-1 fills remaining viewport (POS-style min-h-0 chain) */}
        <section className="flex min-h-0 w-full flex-1 flex-col">
          <div
            className={`flex min-h-0 w-full flex-1 flex-col md:flex-row items-stretch overflow-hidden ${layoutClasses.cardSurface}`}
          >
            <div
              className={`flex min-h-0 flex-[1.05] flex-col md:flex-1 ${layoutClasses.cardPadding} py-3 sm:py-4`}
            >
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center w-full overflow-hidden">
                {isOtherEmployee ? (
                  <div className="flex w-full max-w-sm min-h-0 flex-col items-stretch justify-center gap-2 sm:gap-3">
                    <div>
                      <label
                        htmlFor="login2-custom-id"
                        className="block text-sm font-semibold text-neutral-700 mb-1"
                      >
                        {t('login2.employeeIdLabel')}
                      </label>
                      <input
                        id="login2-custom-id"
                        type="text"
                        value={customEmployeeId}
                        onChange={(e) => {
                          setCustomEmployeeId(e.target.value);
                          setError('');
                        }}
                        placeholder={t('login2.employeeIdPlaceholder')}
                        className={inputClass}
                        disabled={isLoading}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="login2-custom-pin"
                        className="block text-sm font-semibold text-neutral-700 mb-1"
                      >
                        {t('login.enterPin')}
                      </label>
                      <input
                        id="login2-custom-pin"
                        type="password"
                        value={customPin}
                        onChange={(e) => {
                          setCustomPin(e.target.value);
                          setError('');
                        }}
                        placeholder={t('login2.pinPlaceholder')}
                        className={inputClass}
                        disabled={isLoading}
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleOtherSignIn}
                      disabled={isLoading || !customEmployeeId.trim() || !customPin}
                      className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-2xl text-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-touch-sm shrink-0"
                    >
                      {isLoading ? (
                        <div className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <LogIn className="w-6 h-6" />
                          <span>{t('login.signIn')}</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : selectedEmployee ? (
                  <>
                    <RoundAvatar role={selectedEmployee.role} sizeClass="h-20 w-20 mb-3" iconClass="w-10 h-10" />
                    <p className="text-2xl font-bold text-neutral-900 mb-0.5 text-center line-clamp-1">
                      {selectedEmployee.name}
                    </p>
                    <p className="text-base text-neutral-500 capitalize mb-6">{selectedEmployee.role}</p>

                    <p className="text-xl font-semibold text-neutral-800 mb-4">{t('login.enterPin')}</p>

                    <div className="flex gap-4" aria-live="polite" aria-label={t('login.enterPin')}>
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-4 w-4 rounded-full border-2 transition-colors duration-150 ${
                            i < pin.length
                              ? 'bg-neutral-800 border-neutral-800'
                              : 'bg-transparent border-neutral-300'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-base text-neutral-400 font-medium">{t('login2.pickEmployee')}</p>
                )}

                {isLoading && !isOtherEmployee && (
                  <div className="h-7 w-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mt-2 shrink-0" />
                )}
              </div>

              {error && (
                <div className="shrink-0 w-full max-w-sm mx-auto bg-red-50 border-2 border-red-200 rounded-xl px-4 py-2 mt-2">
                  <p className="text-red-700 text-sm font-medium text-center line-clamp-2">{error}</p>
                </div>
              )}
            </div>

            <div className="hidden md:flex shrink-0 items-stretch justify-center px-0" aria-hidden>
              <div className="w-px self-stretch bg-neutral-200 my-4" />
            </div>

            <div className="md:hidden h-px shrink-0 bg-neutral-200 mx-4" aria-hidden />

            <div
              className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden ${layoutClasses.cardPadding} py-3 sm:py-4`}
            >
              <LoginPinNumpad
                disabled={!hasSelection || isLoading}
                onDigit={handleDigit}
                onBackspace={handleBackspace}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const LoginForm2: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  useLogin2BrowserZoomCompensate(hostRef);

  return (
    <DesignSystem2CustomizationProvider>
      <div
        ref={hostRef}
        className="login2-route-host fixed inset-0 z-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden"
      >
        <LoginForm2Inner />
      </div>
      <DesignSystem2Customizer />
    </DesignSystem2CustomizationProvider>
  );
};

export default LoginForm2;
