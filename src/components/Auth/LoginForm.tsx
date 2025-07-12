import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, User, Settings, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployees } from '../../contexts/EmployeesContext';
import { Employee } from '../../types/supabase';
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
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDisplay | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [employeeList, setEmployeeList] = useState<EmployeeDisplay[]>([]);

  const { login, isLoading } = useAuth();
  const employeesContext = useEmployees();

  // Load employees when component mounts or employees data changes
  useEffect(() => {
    const loadEmployees = () => {
      if (employeesContext.employees.length > 0) {
        // Convert database employees to display format
        const displayEmployees: EmployeeDisplay[] = employeesContext.employees
          .filter(emp => emp.is_active && !emp.deleted_at) // Only active, non-deleted employees
          .map(emp => ({
            employeeNumber: emp.employee_number,
            name: emp.name,
            role: emp.role
          }));

        setEmployeeList(displayEmployees);
      }
    };

    loadEmployees();
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

    if (!selectedEmployee || !password) {
      const authType = selectedEmployee?.role === 'admin' ? 'password' : 'PIN';
      setError(`Please select an employee and enter ${authType}`);
      return;
    }

    const success = await login(selectedEmployee.employeeNumber, password);
    if (!success) {
      const authType = selectedEmployee.role === 'admin' ? 'password' : 'PIN';
      setError(`Invalid employee or ${authType}`);
    }
  };

  const handleBackToSelection = () => {
    setSelectedEmployee(null);
    setPassword('');
    setError('');
    setShowPassword(false);
    setShowKeyboard(true);
  };

  // Show loading state while employees are being loaded
  if (employeesContext.isLoading && employeeList.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h1 className="text-4xl font-bold text-white mb-2">Loading Employees...</h1>
          <p className="text-xl text-blue-100">Please wait while we load the employee database</p>
        </div>
      </div>
    );
  }

  // Show error state if there's an error loading employees
  if (employeesContext.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="bg-red-500 p-4 rounded-full mb-6 mx-auto w-16 h-16 flex items-center justify-center">
            <span className="text-white text-2xl">!</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Unable to Load Employees</h1>
          <p className="text-xl text-blue-100 mb-4">{employeesContext.error}</p>
          <button
            onClick={() => employeesContext.refreshEmployees()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
          >
            Retry
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
        className={`fixed top-6 right-6 z-10 px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center space-x-3 shadow-lg min-h-[60px] ${isAdminMode
          ? 'bg-orange-500 hover:bg-orange-600 text-white'
          : 'bg-white hover:bg-gray-50 text-gray-700'
          }`}
        title={isAdminMode ? 'Switch to Employee Mode' : 'Switch to Admin Mode'}
      >
        {isAdminMode ? (
          <>
            <Users className="w-6 h-6" />
            <span>Employee Mode</span>
          </>
        ) : (
          <>
            <Settings className="w-6 h-6" />
            <span>Admin Mode</span>
          </>
        )}
      </button>

      {/* Mode Indicator */}
      <div className="fixed top-6 left-6 z-10 px-6 py-3 rounded-full text-lg font-semibold bg-white/20 text-white backdrop-blur-sm">
        {isAdminMode ? '🛠️ Admin Mode' : '👥 Employee Mode'}
      </div>

      {/* Sync Status Indicator */}
      {employeesContext.syncStatus && (
        <div className="fixed bottom-6 left-6 z-10 px-4 py-2 rounded-lg text-sm font-medium bg-white/20 text-white backdrop-blur-sm">
          {employeesContext.syncStatus.isOnline ? '🟢 Online' : '🔴 Offline'}
          {employeesContext.syncStatus.isSyncing && ' - Syncing...'}
        </div>
      )}

      <div className="w-full max-w-7xl">
        {!selectedEmployee ? (
          // Employee Selection Screen
          <div className="text-center">
            <div className="mb-12">
              <h1 className="text-6xl font-bold text-white mb-4">Select Employee</h1>
              <p className="text-2xl text-blue-100">Touch your name to continue</p>
              {currentEmployees.length === 0 && (
                <p className="text-xl text-orange-200 mt-4">
                  No {isAdminMode ? 'admin/manager' : 'cashier/trainee'} employees found
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
                  className="bg-white rounded-3xl p-8 shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 min-h-[280px] flex flex-col items-center justify-center group"
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
                    {selectedEmployee?.role === 'admin' ? 'Enter Password' : 'Enter PIN'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-8 py-6 text-2xl bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder={selectedEmployee?.role === 'admin' ? 'Enter your password' : 'Enter your PIN'}
                      disabled={isLoading}
                      readOnly
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
                      {showKeyboard ? 'Hide Keyboard' : 'Show Keyboard'}
                    </button>

                    <div className="text-sm text-gray-500">
                      Demo {selectedEmployee?.role === 'admin' ? 'Password' : 'PIN'}: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{selectedEmployee?.role === 'admin' ? 'password' : '1234'}</span>
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
                    maxLength={selectedEmployee?.role === 'admin' ? 50 : 6}
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
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white py-6 rounded-2xl text-2xl font-semibold transition-all duration-200 min-h-[80px]"
                    disabled={isLoading}
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={isLoading || !password}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-6 rounded-2xl text-2xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 min-h-[80px]"
                  >
                    {isLoading ? (
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <LogIn className="w-8 h-8" />
                        <span>Sign In</span>
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