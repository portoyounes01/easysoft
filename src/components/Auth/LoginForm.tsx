import React, { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, LogIn, User, Settings, Users, WifiOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useEmployees } from '../../contexts/EmployeesContext';
import VirtualKeyboard from '../VirtualKeyboard';

// Employee display interface for the UI
interface EmployeeDisplay {
  employeeNumber: string;
  name: string;
  role: string;
}

// Get role color for visual distinction
const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin': return 'from-red-500 to-pink-600';
    case 'manager': return 'from-orange-500 to-amber-600';
    case 'cashier': return 'from-blue-500 to-purple-600';
    default: return 'from-gray-500 to-slate-600';
  }
};

const LoginForm: React.FC = () => {
  const { t } = useTranslation();
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDisplay | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [employeeList, setEmployeeList] = useState<EmployeeDisplay[]>([]);

  // Use employee-based authentication for now (legacy system)
  const { signInWithEmployeeCredentials, isLoading } = useSupabaseAuth();
  const employeesContext = useEmployees();

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

  // Load employees when component mounts or employees data changes
  useEffect(() => {
    if (employeesContext.employees.length === 0) {
      setEmployeeList([]);
      return;
    }
    const displayEmployees: EmployeeDisplay[] = employeesContext.employees
      .filter(emp => emp.is_active && !emp.deleted_at)
      .map(emp => ({
        employeeNumber: emp.employee_number,
        name: emp.name,
        role: emp.role
      }));
    setEmployeeList(displayEmployees);
  }, [employeesContext.employees]);

  // Filter employees based on admin mode
  const currentEmployees = employeeList.filter(emp => {
    if (isAdminMode) {
      return emp.role === 'admin' || emp.role === 'manager';
    } else {
      return emp.role === 'cashier' || emp.role === 'trainee';
    }
  });

  const handleEmployeeSelect = (employee: EmployeeDisplay) => {
    setSelectedEmployee(employee);
    setError('');
    setPassword('');
    // Show keyboard for both admin and employees
    setShowKeyboard(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    console.log('🔐 Login attempt started');
    console.log('Selected employee:', selectedEmployee);
    console.log('Password provided:', !!password);

    if (!selectedEmployee || !password) {
      const authLabel =
        selectedEmployee?.role === 'admin' ? t('login.credentialPassword') : t('login.credentialPin');
      console.log('❌ Missing employee or password');
      setError(t('login.selectEmployeeAndCredential', { type: authLabel }));
      return;
    }

    try {
      console.log('🔄 Calling signInWithEmployeeCredentials...');
      const result = await signInWithEmployeeCredentials(selectedEmployee.employeeNumber, password);
      console.log('📋 Login result:', result);

      if (!result.success) {
        const authLabel = selectedEmployee.role === 'admin' ? t('login.credentialPassword') : t('login.credentialPin');
        console.log('❌ Login failed:', result.error);
        setError(result.error || t('login.invalidCredential', { type: authLabel }));
      } else {
        console.log('✅ Login successful!');
      }
      // If successful, the auth context will handle the state change and redirect
    } catch (error) {
      const authLabel = selectedEmployee.role === 'admin' ? t('login.credentialPassword') : t('login.credentialPin');
      console.log('💥 Login exception:', error);
      setError(t('login.invalidCredential', { type: authLabel }));
    }
  };

  const handleBackToSelection = () => {
    setSelectedEmployee(null);
    setPassword('');
    setError('');
    setShowPassword(false);
    setShowKeyboard(true);
  };

  // While loading (initial or retry), always show spinner — if we also required employeeList.length === 0,
  // a cleared loadError could briefly show the main screen before loadEmployees dispatches.
  if (employeesContext.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h1 className="text-4xl font-bold text-white mb-2">{t('login.loadingEmployees')}</h1>
          <p className="text-xl text-blue-100">{t('login.loadingEmployeesSub')}</p>
        </div>
      </div>
    );
  }

  // Steady load failure (not currently retrying)
  if (employeesContext.loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-2xl px-4">
          <div className="bg-red-500 p-4 rounded-full mb-6 mx-auto w-16 h-16 flex items-center justify-center">
            <span className="text-white text-2xl">!</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            {loadErrorIsLocalDb ? t('login.loadErrorLocalDbTitle') : t('login.loadErrorTitle')}
          </h1>
          <p className="text-xl text-blue-100 mb-4">
            {loadErrorIsLocalDb ? t('login.loadErrorLocalDbBody') : employeesContext.loadError}
          </p>
          {!loadErrorIsLocalDb && (
            <p className="text-lg text-blue-200/90 mb-4">{t('login.loadErrorGenericHint')}</p>
          )}
          <button
            type="button"
            onClick={() => {
              void employeesContext.refreshEmployees();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold min-h-touch min-w-40 transition-colors duration-200"
          >
            {t('login.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center p-6 relative">
      {/* Mode Toggle Button */}
      <button
        onClick={() => {
          setIsAdminMode(!isAdminMode);
          setSelectedEmployee(null);
          setPassword('');
          setError('');
        }}
        className={`fixed top-6 right-6 z-10 px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center space-x-3 shadow-lg min-h-touch ${isAdminMode
          ? 'bg-orange-500 hover:bg-orange-600 text-white'
          : 'bg-white hover:bg-gray-50 text-gray-700'
          }`}
        title={isAdminMode ? t('login.switchToEmployeeMode') : t('login.switchToAdminMode')}
      >
        {isAdminMode ? (
          <>
            <Users className="w-6 h-6" />
            <span>{t('login.employeeMode')}</span>
          </>
        ) : (
          <>
            <Settings className="w-6 h-6" />
            <span>{t('login.adminMode')}</span>
          </>
        )}
      </button>

      {/* Mode Indicator */}
      <div className="fixed top-6 left-6 z-10 px-6 py-3 rounded-full text-lg font-semibold bg-white/20 text-white backdrop-blur-sm">
        {isAdminMode ? t('login.modeIndicatorAdmin') : t('login.modeIndicatorEmployee')}
      </div>

      {/* Sync Status Indicator */}
      {employeesContext.syncStatus && (
        <div className="fixed bottom-6 left-6 z-10 px-4 py-2 rounded-lg text-sm font-medium bg-white/20 text-white backdrop-blur-sm">
          {employeesContext.syncStatus.isOnline ? t('login.online') : t('login.offline')}
          {employeesContext.syncStatus.isSyncing && ` — ${t('login.syncing')}`}
        </div>
      )}

      {/* Non-blocking: cloud sync failed; local staff list still works */}
      {employeesContext.syncError && !employeesContext.loadError && (
        <div
          className="fixed top-28 left-6 right-6 z-20 md:right-auto md:max-w-xl flex items-start gap-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 shadow-xl"
          role="status"
        >
          <WifiOff className="w-8 h-8 shrink-0 text-orange-600 mt-1" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-gray-900">{t('login.syncDegradedTitle')}</p>
            <p className="text-base text-gray-700 mt-1">{t('login.syncDegradedBody')}</p>
            <p className="text-sm text-gray-600 mt-2 break-words">{employeesContext.syncError}</p>
          </div>
          <button
            type="button"
            onClick={() => employeesContext.clearSyncError()}
            className="shrink-0 min-h-touch min-w-touch rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors duration-200"
            aria-label={t('login.syncDegradedDismiss')}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      <div className="w-full max-w-7xl">
        {!selectedEmployee ? (
          // Employee Selection Screen
          <div className="text-center">
            <div className="mb-12">
              <h1 className="text-6xl font-bold text-white mb-4">{t('login.selectEmployee')}</h1>
              <p className="text-2xl text-blue-100">{t('login.touchNameToContinue')}</p>
              {currentEmployees.length === 0 && (
                <p className="text-xl text-orange-200 mt-4">
                  {isAdminMode ? t('login.noStaffAdmin') : t('login.noStaffCashier')}
                </p>
              )}
            </div>

            <div className={`grid gap-8 ${currentEmployees.length === 2
              ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              }`}>
              {currentEmployees.map((employee) => (
                <button
                  key={employee.employeeNumber}
                  onClick={() => handleEmployeeSelect(employee)}
                  className="bg-white rounded-3xl p-8 shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 min-h-70 flex flex-col items-center justify-center group"
                >
                  <div className={`bg-gradient-to-r ${getRoleColor(employee.role)} p-6 rounded-3xl mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <User className="w-16 h-16 text-white" />
                  </div>

                  <h3 className="text-3xl font-bold text-gray-800 mb-3">{employee.name}</h3>
                  <p className="text-xl text-gray-600 capitalize font-medium">{employee.role}</p>
                  <p className="text-lg text-gray-400 mt-2">{employee.employeeNumber}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Password Entry Screen
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl p-8">
              {/* Selected Employee Header */}
              <div className="text-center mb-8">
                <div className={`bg-gradient-to-r ${getRoleColor(selectedEmployee.role)} p-6 rounded-3xl inline-block mb-6`}>
                  <User className="w-16 h-16 text-white" />
                </div>
                <h1 className="text-4xl font-bold text-gray-800 mb-3">{selectedEmployee.name}</h1>
                <p className="text-2xl text-gray-600 capitalize">{selectedEmployee.role}</p>
              </div>

              {/* Password/PIN Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 mb-4">
                    {selectedEmployee?.role === 'admin' ? t('login.enterPassword') : t('login.enterPin')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                      className="w-full px-8 py-6 text-2xl bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder={selectedEmployee?.role === 'admin' ? t('login.placeholderPassword') : t('login.placeholderPin')}
                      disabled={isLoading}
                    />
                    {selectedEmployee?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-6 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-2"
                      >
                        {showPassword ? <EyeOff className="w-8 h-8" /> : <Eye className="w-8 h-8" />}
                      </button>
                    )}
                  </div>

                  {/* Keyboard Toggle */}
                  <div className="flex justify-between items-center mt-4">
                    <button
                      type="button"
                      onClick={() => setShowKeyboard(!showKeyboard)}
                      className="text-blue-600 hover:text-blue-800 font-medium text-lg"
                    >
                      {showKeyboard ? t('login.hideKeyboard') : t('login.showKeyboard')}
                    </button>

                    <div className="text-sm text-gray-500">
                      {t('login.demoCredential', {
                        type:
                          selectedEmployee?.role === 'admin' ? t('login.credentialPassword') : t('login.credentialPin'),
                      })}{' '}
                      <span className="font-mono bg-gray-100 px-2 py-1 rounded">{selectedEmployee?.role === 'admin' ? 'password' : '1234'}</span>
                    </div>
                  </div>
                </div>

                {/* Virtual Keyboard for Admin and Employees */}
                {showKeyboard && (
                  <VirtualKeyboard
                    isOpen={true}
                    onClose={() => setShowKeyboard(false)}
                    onConfirm={(value: string) => setPassword(value)}
                    title=""
                    initialValue={password}
                    maxLength={selectedEmployee?.role === 'admin' ? 50 : 8}
                    allowNumbers={true}
                    allowLetters={selectedEmployee?.role === 'admin'}
                  />
                )}

                {error && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
                    <p className="text-red-700 text-xl font-medium">{error}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button
                    type="button"
                    onClick={handleBackToSelection}
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white py-6 rounded-2xl text-2xl font-semibold transition-all duration-200 min-h-20"
                    disabled={isLoading}
                  >
                    {t('login.back')}
                  </button>

                  <button
                    type="submit"
                    disabled={isLoading || !password}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-6 rounded-2xl text-2xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 min-h-20"
                  >
                    {isLoading ? (
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <LogIn className="w-8 h-8" />
                        <span>{t('login.signIn')}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginForm;