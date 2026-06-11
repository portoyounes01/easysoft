import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, Wifi, WifiOff, X, Store, Delete, UserPlus, Lock } from 'lucide-react';
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
      className="inline-flex items-center gap-3 px-1 py-1 text-xl font-semibold text-slate-500"
      role="status"
    >
      {isOnline ? (
        <Wifi className="h-7 w-7 shrink-0 text-green-600" strokeWidth={2} aria-hidden />
      ) : (
        <WifiOff className="h-7 w-7 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
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
    'login2-numpad-key flex aspect-square w-full items-center justify-center text-2xl font-semibold text-neutral-900 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className="login2-numpad-grid grid w-full grid-cols-3 mx-auto">
      {digits.map((d) => (
        <button key={d} type="button" disabled={disabled} className={keyClass} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" disabled={disabled} className={`${keyClass} col-span-2`} onClick={() => onDigit('0')}>
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`${keyClass} login2-numpad-key-muted`}
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
  const [compactSelectedLayout, setCompactSelectedLayout] = useState(false);
  const [employeeGridEmployeeLimit, setEmployeeGridEmployeeLimit] = useState(7);
  const employeeGridRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const { signInWithEmployeeCredentials, isLoading } = useSupabaseAuth();
  const employeesContext = useEmployees();

  const companyLogoUrl = (settings.company as { logoUrl?: string }).logoUrl?.trim() || '';
  const hasSelection = isOtherEmployee || selectedEmployee !== null;
  const isCompactSelectedLayout = hasSelection && compactSelectedLayout;

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
      return null;
    });
  }, [employeesContext.employees, isOtherEmployee]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const sync = () => setCompactSelectedLayout(query.matches);

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const node = employeeGridRef.current;
    if (!node) return;

    const sync = () => {
      const cardWidth = 160;
      const gap = 12;
      const columns = Math.max(1, Math.floor((node.clientWidth + gap) / (cardWidth + gap)));
      setEmployeeGridEmployeeLimit(Math.max(1, columns * 2 - 1));
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [employeesContext.isLoading, employeesContext.loadError, hasSelection]);

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

  const handlePrimarySignIn = () => {
    if (isOtherEmployee) {
      handleOtherSignIn();
      return;
    }

    if (selectedEmployee && pin.length === PIN_LENGTH) {
      void submitEmployeePin(pin);
    }
  };

  const handleClearSelection = () => {
    setIsOtherEmployee(false);
    setSelectedEmployee(null);
    setPin('');
    setCustomEmployeeId('');
    setCustomPin('');
    setError('');
  };

  const canSubmitCredentials = isOtherEmployee
    ? customEmployeeId.trim().length > 0 && customPin.length > 0
    : selectedEmployee !== null && pin.length === PIN_LENGTH;
  const visibleEmployeeList = useMemo(
    () => employeeList.slice(0, employeeGridEmployeeLimit),
    [employeeGridEmployeeLimit, employeeList]
  );

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

  const logoMark = (sizeClass: string, iconClass: string) =>
    companyLogoUrl ? (
      <img
        src={companyLogoUrl}
        alt={settings.company.name}
        className={`login2-logo-image ${sizeClass} object-contain transition-all duration-300`}
      />
    ) : (
      <div className="flex flex-col items-center text-neutral-400 transition-all duration-300">
        <Store className={`login2-logo-icon ${iconClass} transition-all duration-300`} aria-hidden />
        <span className="sr-only">{t('login2.logoPlaceholder')}</span>
      </div>
    );

  const connectivityBadge = employeesContext.syncStatus ? (
    <LoginConnectivityStatus
      isOnline={employeesContext.syncStatus.isOnline}
      isSyncing={employeesContext.syncStatus.isSyncing}
    />
  ) : null;

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
    <div className={`login2-page-shell flex min-h-full w-full max-w-full flex-col overflow-y-auto ${
      isCompactSelectedLayout ? '' : 'md:h-full md:min-h-0 md:overflow-hidden'
    } ${pagePadding}`}>
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

      <div className={`login2-content-container mx-auto flex w-full flex-1 flex-col gap-2 transition-all duration-300 ${
        isCompactSelectedLayout ? '' : 'md:h-full md:min-h-0 md:overflow-hidden'
      } ${
        hasSelection ? 'min-h-0' : 'min-h-[calc(100dvh-1.5rem)]'
      }`}>
        {/* Header: connectivity | logo | language — grid avoids clipping under overflow-hidden */}
        <header className={`w-full shrink-0 transition-all duration-300 ${hasSelection ? 'mb-1' : ''}`}>
          <div className={`grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 ${
            hasSelection ? 'mb-2' : 'mb-3'
          }`}>
            <div className="flex min-w-0 justify-start self-start">
              <div className={isCompactSelectedLayout ? 'flex' : 'hidden'}>
                {logoMark('h-9 w-9', 'h-9 w-9')}
              </div>
              <div className={isCompactSelectedLayout ? 'hidden' : 'flex'}>
                {connectivityBadge}
              </div>
            </div>
            <div className="flex shrink-0 justify-center px-2">
              <div className={isCompactSelectedLayout ? 'flex' : 'hidden'}>
                {connectivityBadge}
              </div>
              <div className={isCompactSelectedLayout ? 'hidden' : 'flex'}>
                {logoMark(hasSelection ? 'h-10 w-10 md:h-20 md:w-20' : 'h-20 w-20', hasSelection ? 'h-10 w-10 md:h-16 md:w-16' : 'h-16 w-16')}
              </div>
            </div>
            <div className="flex min-w-0 justify-end self-start">
              <LanguageSwitcher className="login2-language-switcher" />
            </div>
          </div>

          <div className={`text-center transition-all duration-300 ${
            isCompactSelectedLayout ? 'hidden' : 'block'
          }`}>
            <h1 className="text-4xl font-bold text-neutral-900 mb-1 leading-tight">{t('login2.welcome')}</h1>
            <p className="text-xl text-neutral-500 font-medium">{t('login2.signInToContinue')}</p>
          </div>
        </header>

        {/* Credential area and numpad are separate cards; the numpad card contains keys only. */}
        <section className="flex w-full flex-col md:min-h-0 md:flex-1">
          <div className="login2-main-grid grid w-full transition-all duration-300 md:min-h-0 md:flex-1 md:items-start">
            <div className="flex min-w-0 flex-col gap-3 md:min-h-0">
              {!hasSelection ? (
                <div>
                  <h2 className="mb-2 text-left text-2xl font-bold text-neutral-900">
                    {t('login.selectEmployee')}
                  </h2>

                  {employeeList.length === 0 && (
                    <p className="mb-1 text-sm font-medium text-orange-600">{t('login2.noStaff')}</p>
                  )}

                  <div
                    ref={employeeGridRef}
                    className="login2-employee-grid w-full gap-3 overflow-hidden px-1 py-3 transition-all duration-300"
                    role="listbox"
                    aria-label={t('login.selectEmployee')}
                  >
                    {visibleEmployeeList.map((employee) => {
                      const isSelected =
                        !isOtherEmployee && selectedEmployee?.employeeNumber === employee.employeeNumber;
                      return (
                        <button
                          key={employee.employeeNumber}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleEmployeeSelect(employee)}
                          className={`login2-staff-card flex w-full min-w-0 flex-col items-center transition-all duration-200 ${
                            isSelected
                              ? 'login2-staff-card-selected'
                              : 'hover:border-neutral-300'
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
                      className={`login2-staff-card flex w-full min-w-0 flex-col items-center transition-all duration-200 ${
                        isOtherEmployee
                          ? 'login2-staff-card-selected'
                          : 'hover:border-neutral-300'
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
                </div>
              ) : (
                <div className="login2-selected-stack flex flex-col gap-3">
                  <div className="login2-panel login2-selected-summary shrink-0 flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {isOtherEmployee ? (
                        <div className="login2-custom-avatar flex shrink-0 items-center justify-center rounded-full">
                          <UserPlus className="text-slate-950" />
                        </div>
                      ) : selectedEmployee ? (
                        <RoundAvatar role={selectedEmployee.role} sizeClass="login2-selected-avatar" iconClass="login2-selected-avatar-icon" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-neutral-900 md:text-lg">
                          {isOtherEmployee ? t('login2.otherEmployee') : selectedEmployee?.name}
                        </p>
                        <p className="truncate text-sm font-medium capitalize text-neutral-500">
                          {isOtherEmployee ? t('login2.customId') : selectedEmployee?.role}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="login2-change-button min-h-touch-xs shrink-0 text-sm font-semibold transition-colors duration-200"
                      onClick={handleClearSelection}
                    >
                      {t('login2.changeEmployee')}
                    </button>
                  </div>

                  <div className="login2-panel login2-credential-card flex flex-1 flex-col justify-center">
                    {isOtherEmployee ? (
                      <div className="login2-other-form-stack flex w-full min-h-0 flex-col items-stretch justify-center gap-3">
                        <div>
                          <label
                            htmlFor="login2-custom-id"
                            className="mb-1 block text-sm font-semibold text-neutral-700"
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
                          <p className="login2-input-helper">{t('login2.employeeIdHelper')}</p>
                        </div>
                        <div>
                          <label
                            htmlFor="login2-custom-pin"
                            className="mb-1 block text-sm font-semibold text-neutral-700"
                          >
                            {t('login.credentialPin')}
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
                      </div>
                    ) : selectedEmployee ? (
                      <div className="flex flex-col items-center justify-center text-center">
                        <p className="mb-4 text-xl font-semibold text-neutral-800 md:text-2xl">
                          {t('login.enterPin')}
                        </p>

                        <div className="flex gap-4" aria-live="polite" aria-label={t('login.enterPin')}>
                          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                            <span
                              key={i}
                              className={`h-4 w-4 rounded-full border-2 transition-colors duration-150 ${
                                i < pin.length
                                  ? 'border-neutral-800 bg-neutral-800'
                                  : 'border-neutral-300 bg-transparent'
                              }`}
                            />
                          ))}
                        </div>

                        {isLoading && (
                          <div className="mt-4 h-7 w-7 shrink-0 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                        )}
                      </div>
                    ) : null}

                    {error && (
                      <div className="mx-auto mt-4 w-full max-w-sm shrink-0 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-2">
                        <p className="line-clamp-2 text-center text-sm font-medium text-red-700">{error}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="login2-right-stack flex min-w-0 flex-col">
              <div className="login2-panel login2-numpad-card flex min-h-[12rem] items-center justify-center overflow-hidden">
                <LoginPinNumpad
                  disabled={!hasSelection || isLoading}
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                />
              </div>

              <button
                type="button"
                onClick={handlePrimarySignIn}
                disabled={isLoading || !canSubmitCredentials}
                className={`login2-signin-button w-full min-h-touch-sm shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-green-500 to-green-600 py-3 text-lg font-semibold text-white transition-all duration-200 hover:from-green-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-50 ${
                  hasSelection ? 'flex' : 'hidden'
                }`}
              >
                {isLoading ? (
                  <div className="h-7 w-7 animate-spin rounded-full border-4 border-white border-t-transparent" />
                ) : (
                  <>
                    <Lock className="h-6 w-6" />
                    <span>{t('login.signIn')}</span>
                  </>
                )}
              </button>
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
      <div className="login2-customizer-shell hidden md:block">
        <DesignSystem2Customizer />
      </div>
    </DesignSystem2CustomizationProvider>
  );
};

export default LoginForm2;
