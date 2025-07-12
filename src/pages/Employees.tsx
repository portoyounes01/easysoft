import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Shield,
  User,
  Clock,
  DollarSign,
  MoreVertical
} from 'lucide-react';
import { useEmployees } from '../contexts/EmployeesContext';

const Employees: React.FC = () => {
  const { employees, isLoading, error, refreshEmployees } = useEmployees();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');

  const roles = ['all', 'admin', 'manager', 'cashier', 'trainee'];

  // Memo-compute filtered list to avoid re-render churn
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employee_number.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = selectedRole === 'all' || emp.role === selectedRole;
      return matchesSearch && matchesRole && emp.deleted_at === null;
    });
  }, [employees, searchTerm, selectedRole]);

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800',
      manager: 'bg-blue-100 text-blue-800',
      cashier: 'bg-green-100 text-green-800',
      trainee: 'bg-orange-100 text-orange-800',
    };

    return (
      <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
        <Shield className="w-3 h-3" />
        <span>{role.toUpperCase()}</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 space-y-4">
        <p className="text-red-600 font-semibold">{error}</p>
        <button onClick={refreshEmployees} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Employee Management</h1>
          <p className="text-gray-600 mt-1">Manage staff, track performance, and set permissions</p>
        </div>
        <button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-600 transition-all flex items-center space-x-2 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { title: 'Total Employees', value: employees.length.toString(), icon: User, color: 'bg-blue-500' },
          { title: 'Active', value: employees.filter(e => e.is_active).length.toString(), icon: Clock, color: 'bg-green-500' },
          { title: 'Roles', value: [...new Set(employees.map(e => e.role))].length.toString(), icon: Shield, color: 'bg-purple-500' },
          { title: 'Deleted', value: employees.filter(e => e.deleted_at !== null).length.toString(), icon: Trash2, color: 'bg-red-500' }
        ].map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                  <p className="text-gray-600 text-sm">{stat.title}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
              />
            </div>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {roles.map(role => (
                <option key={role} value={role}>
                  {role === 'all' ? 'All Roles' : role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Employee Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredEmployees.map((employee) => (
          <div key={employee.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-lg font-bold">
                    {employee.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{employee.name}</h3>
                  <p className="text-sm text-gray-600">{employee.employee_number}</p>
                  <p className="text-sm text-gray-500">{employee.email}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {getRoleBadge(employee.role)}
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="flex items-center space-x-2 mb-1">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Total Sales</span>
                </div>
                <p className="text-lg font-bold text-green-700">€{employee.total_sales.toFixed(2)}</p>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-center space-x-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Hours Worked</span>
                </div>
                <p className="text-lg font-bold text-blue-700">{employee.hours_worked}h</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Transactions</p>
                <p className="font-semibold text-gray-800">{employee.transaction_count}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Transaction</p>
                <p className="font-semibold text-gray-800">€{employee.average_transaction.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <span className="text-sm text-gray-500">
                Hire Date: {new Date(employee.hire_date).toLocaleDateString('pt-PT')}
              </span>
              <div className="flex items-center space-x-2">
                <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Employees;