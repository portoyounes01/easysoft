import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, User, Settings, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Employee } from '../../types';
import VirtualKeyboard from '../VirtualKeyboard';

// Sample employees for the dropdown
const sampleEmployees: Pick<Employee, 'employeeNumber' | 'name' | 'role'>[] = [
  { employeeNumber: 'EMP001', name: 'John Smith', role: 'admin' },
  { employeeNumber: 'EMP002', name: 'Sarah Johnson', role: 'manager' },
  { employeeNumber: 'EMP003', name: 'Mike Davis', role: 'cashier' },
  { employeeNumber: 'EMP004', name: 'Emily Brown', role: 'cashier' },
  { employeeNumber: 'EMP005', name: 'David Wilson', role: 'cashier' },
];

// Employees for individual cards (excluding admin and manager for now)
const cardEmployees: Pick<Employee, 'employeeNumber' | 'name' | 'role'>[] = [
  { employeeNumber: 'EMP003', name: 'Mike Davis', role: 'cashier' },
  { employeeNumber: 'EMP004', name: 'Emily Brown', role: 'cashier' },
  { employeeNumber: 'EMP005', name: 'David Wilson', role: 'cashier' },
];

// Admin/Manager employees for admin mode
const adminEmployees: Pick<Employee, 'employeeNumber' | 'name' | 'role'>[] = [
  { employeeNumber: 'EMP001', name: 'John Smith', role: 'admin' },
  { employeeNumber: 'EMP002', name: 'Sarah Johnson', role: 'manager' },
];

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
  const [selectedEmployee, setSelectedEmployee] = useState<Pick<Employee, 'employeeNumber' | 'name' | 'role'> | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const { login, isLoading } = useAuth();

  const currentEmployees = isAdminMode ? adminEmployees : cardEmployees;

  const handleEmployeeSelect = (employee: Pick<Employee, 'employeeNumber' | 'name' | 'role'>) => {
    setSelectedEmployee(employee);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedEmployee || !password) {
      setError('Please select an employee and enter password');
      return;
    }

    const success = await login(selectedEmployee.employeeNumber, password);
    if (!success) {
      setError('Invalid employee or password');
    }
  };

  const handleBackToSelection = () => {
    setSelectedEmployee(null);
    setPassword('');
    setError('');
    setShowPassword(false);
  };

  const handleKeyPress = (key: string) => {
    setPassword(prev => prev + key);
  };

  const handleBackspace = () => {
    setPassword(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPassword('');
  };

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

      <div className="w-full max-w-7xl">
        {!selectedEmployee ? (
          // Employee Selection Screen
          <div className="text-center">
            <div className="mb-12">
              <h1 className="text-6xl font-bold text-white mb-4">Select Employee</h1>
              <p className="text-2xl text-blue-100">Touch your name to continue</p>
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

              {/* Password Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 mb-4">
                    Enter Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-8 py-6 text-2xl bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter your password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-6 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-2"
                    >
                      {showPassword ? <EyeOff className="w-8 h-8" /> : <Eye className="w-8 h-8" />}
                    </button>
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
                      Demo Password: <span className="font-mono bg-gray-100 px-2 py-1 rounded">password</span>
                    </div>
                  </div>
                </div>

                {/* Virtual Keyboard */}
                {showKeyboard && (
                  <VirtualKeyboard
                    onKeyPress={handleKeyPress}
                    onBackspace={handleBackspace}
                    onClear={handleClear}
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