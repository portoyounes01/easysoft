import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Plus,
    Search,
    Filter,
    Edit,
    Trash2,
    Shield,
    Clock,
    MoreVertical,
    X,
    Save,
    AlertCircle,
    Eye,
    EyeOff,
    Calendar,
    Phone,
    KeyRound,
    Loader2,
    UserCheck,
    UserX,
    Copy,
    Banknote
} from 'lucide-react';
import { useEmployees } from '../contexts/EmployeesContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { EmployeeFormData, EmployeeRole, AccessLevel, Employee, AccessLevels } from '../types/supabase';
import DatabaseReset from '../components/DatabaseReset';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { AdminActionButton } from '../components/ui/AdminActionButton';

const Employees: React.FC = () => {
    const {
        employees,
        isLoading,
        error,
        refreshEmployees,
        createEmployee,
        updateEmployee,
        deleteEmployee
    } = useEmployees();

    const { employee: currentUser } = useSupabaseAuth();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRole, setSelectedRole] = useState('all');
    const [showEmployeeForm, setShowEmployeeForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<Employee | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [showDatabaseReset, setShowDatabaseReset] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const roles = ['all', 'admin', 'manager', 'cashier'];
    const { t } = useTranslation();
    const { language } = useLanguage();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Check for database errors
    useEffect(() => {
        if (error && (
            error.includes('object store') ||
            error.includes('NotFoundError') ||
            error.includes('IDBTransaction') ||
            error.includes('database object could not be found')
        )) {
            setShowDatabaseReset(true);
        }
    }, [error]);

    // Form state
    const [formData, setFormData] = useState<EmployeeFormData>({
        employee_number: '',
        name: '',
        phone: undefined,
        role: 'cashier',
        access_levels: ['sales'],
        hire_date: new Date().toISOString().split('T')[0],
        password: '',
        pin: '',
        is_active: true
    });

    const [formErrors, setFormErrors] = useState<Partial<Record<keyof EmployeeFormData, string>>>({});
    const [showPassword, setShowPassword] = useState(false);

    // Available access levels
    const accessLevels: { value: AccessLevel; label: string; description: string }[] = [
        { value: 'all', label: t('employees.accessLevels.all.label'), description: t('employees.accessLevels.all.description') },
        { value: 'sales', label: t('employees.accessLevels.sales.label'), description: t('employees.accessLevels.sales.description') },
        { value: 'inventory', label: t('employees.accessLevels.inventory.label'), description: t('employees.accessLevels.inventory.description') },
        { value: 'reports', label: t('employees.accessLevels.reports.label'), description: t('employees.accessLevels.reports.description') },
        { value: 'dashboard', label: t('employees.accessLevels.dashboard.label'), description: t('employees.accessLevels.dashboard.description') },
        { value: 'employees', label: t('employees.accessLevels.employees.label'), description: t('employees.accessLevels.employees.description') },
        { value: 'settings', label: t('employees.accessLevels.settings.label'), description: t('employees.accessLevels.settings.description') },
        { value: 'transactions', label: t('employees.accessLevels.transactions.label'), description: t('employees.accessLevels.transactions.description') }
    ];

    // Memo-compute filtered list to avoid re-render churn
    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.employee_number.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = selectedRole === 'all' || emp.role === selectedRole;
            return matchesSearch && matchesRole && emp.deleted_at === null;
        });
    }, [employees, searchTerm, selectedRole]);

    const getRoleBadge = (role: string, isActive: boolean) => {
        if (!isActive) {
            return (
                <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700`}>
                    <Shield className="w-3 h-3" />
                    <span>{role.toUpperCase()}</span>
                </span>
            );
        }

        const colors: Record<string, string> = {
            admin: 'bg-red-100 text-red-800',
            manager: 'bg-blue-100 text-blue-800',
            cashier: 'bg-green-100 text-green-800',
        };

        return (
            <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
                <Shield className="w-3 h-3" />
                <span>{role.toUpperCase()}</span>
            </span>
        );
    };

    // Generate next employee number
    const generateEmployeeNumber = () => {
        const maxNumber = employees.reduce((max, emp) => {
            const num = parseInt(emp.employee_number.replace(/\D/g, ''), 10);
            return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        return `EMP${String(maxNumber + 1).padStart(4, '0')}`;
    };

    // Handle form field changes
    const handleFormChange = (field: keyof EmployeeFormData, value: any) => {
        setFormData(prev => {
            const newData = {
                ...prev,
                [field]: value
            };

            // Handle role changes - manage phone visibility and access levels
            if (field === 'role') {
                if (value === 'cashier') {
                    // Clear phone for cashiers
                    newData.phone = undefined;
                    // Set default access levels for cashiers
                    newData.access_levels = ['sales'];
                } else if (value === 'manager') {
                    // Initialize phone for managers
                    if (prev.role === 'cashier') {
                        newData.phone = '';
                    }
                    // Set default access levels for managers
                    newData.access_levels = ['sales', 'inventory', 'reports', 'dashboard', 'employees', 'settings', 'transactions'];
                } else if (value === 'admin') {
                    // Initialize phone for admins
                    if (prev.role === 'cashier') {
                        newData.phone = '';
                    }
                    // Admins get all access levels automatically
                    newData.access_levels = [...AccessLevels];
                }
            }

            return newData;
        });

        // Clear error for this field
        if (formErrors[field]) {
            setFormErrors(prev => ({
                ...prev,
                [field]: undefined
            }));
        }


    };

    // Handle access level toggle with smart "all access" behavior
    const handleAccessLevelToggle = (level: AccessLevel) => {
        setFormData(prev => {
            const currentLevels = prev.access_levels;
            const isCurrentlySelected = currentLevels.includes(level);

            if (level === 'all') {
                if (isCurrentlySelected) {
                    // Deselecting "all" - remove all permissions
                    return { ...prev, access_levels: [] };
                } else {
                    // Selecting "all" - add all permissions
                    return { ...prev, access_levels: [...AccessLevels] };
                }
            } else {
                // Toggling individual permission
                let newLevels: AccessLevel[];

                if (isCurrentlySelected) {
                    // Removing permission - also remove "all" if it was selected
                    newLevels = currentLevels.filter(l => l !== level && l !== 'all');
                } else {
                    // Adding permission
                    newLevels = [...currentLevels.filter(l => l !== 'all'), level];

                    // Check if all non-"all" permissions are now selected
                    const nonAllPermissions = AccessLevels.filter((l: AccessLevel) => l !== 'all');
                    const hasAllNonAllPermissions = nonAllPermissions.every((p: AccessLevel) => newLevels.includes(p));

                    if (hasAllNonAllPermissions) {
                        // Auto-select "all" if all other permissions are selected
                        newLevels = [...AccessLevels];
                    }
                }

                return { ...prev, access_levels: newLevels };
            }
        });
    };

    // Validate form
    const validateForm = (): boolean => {
        const errors: Partial<Record<keyof EmployeeFormData, string>> = {};

        if (!formData.name.trim()) {
            errors.name = 'Name is required';
        }

        // Prevent non-admins from assigning admin role
        if (formData.role === 'admin' && currentUser?.role !== 'admin') {
            errors.role = 'Only administrators can assign admin role';
        }

        // Employee number should always be auto-generated and present
        if (!formData.employee_number?.trim()) {
            errors.employee_number = 'Employee number generation failed';
        } else {
            // Check for duplicate employee number (excluding current employee when editing)
            const duplicate = employees.find(emp =>
                emp.employee_number === formData.employee_number &&
                emp.id !== editingEmployee?.id &&
                !emp.deleted_at
            );
            if (duplicate) {
                errors.employee_number = 'Employee number already exists';
            }
        }

        // PIN validation for managers and cashiers only
        if ((formData.role === 'manager' || formData.role === 'cashier')) {
            if (!editingEmployee && !formData.pin?.trim()) {
                errors.pin = 'PIN is required for new employees';
            } else if (formData.pin?.trim() && formData.pin.length < 4) {
                errors.pin = 'PIN must be at least 4 digits';
            } else if (formData.pin?.trim() && !/^\d+$/.test(formData.pin)) {
                errors.pin = 'PIN must contain only numbers';
            }
        }

        if (!formData.hire_date) {
            errors.hire_date = 'Hire date is required';
        }

        // Access levels validation (not needed for admins - they get all automatically)
        if (formData.role !== 'admin' && formData.access_levels.length === 0) {
            errors.access_levels = 'At least one access level is required';
        }

        // Password validation only for new admin employees
        if (formData.role === 'admin' && !editingEmployee && !formData.password?.trim()) {
            errors.password = 'Password is required for new admin employees';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        // Additional security check: prevent non-admins from creating/modifying admin employees
        if (formData.role === 'admin' && currentUser?.role !== 'admin') {
            console.error('Security violation: Non-admin attempted to create/modify admin employee');
            return;
        }

        // If editing an admin employee, only allow admins
        if (editingEmployee?.role === 'admin' && currentUser?.role !== 'admin') {
            console.error('Security violation: Non-admin attempted to modify admin employee');
            return;
        }

        setIsSubmitting(true);
        try {
            if (editingEmployee) {
                // Update existing employee
                const updateData: Partial<EmployeeFormData> = { ...formData };
                if (!updateData.password?.trim()) {
                    delete updateData.password; // Don't update password if empty
                }
                if (!formData.pin?.trim()) {
                    // Don't include PIN in update if empty
                    const { pin, ...dataWithoutPin } = updateData;
                    await updateEmployee(editingEmployee.id, dataWithoutPin as Partial<EmployeeFormData>);
                } else {
                    await updateEmployee(editingEmployee.id, updateData);
                }
            } else {
                // Create new employee
                await createEmployee(formData);
            }

            handleCloseForm();
        } catch (error) {
            console.error('Failed to save employee:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle opening form for new employee
    const handleAddEmployee = () => {
        setEditingEmployee(null);
        setFormData({
            employee_number: generateEmployeeNumber(),
            name: '',
            phone: undefined, // Undefined for default cashier role
            role: 'cashier',
            access_levels: ['sales'], // Default for cashiers
            hire_date: new Date().toISOString().split('T')[0],
            password: '',
            pin: '', // Empty PIN for new employee
            is_active: true
        });
        setFormErrors({});
        setShowEmployeeForm(true);
    };

    // Handle opening form for editing
    const handleEditEmployee = (employee: Employee) => {
        // Prevent non-admins from editing admin employees
        if (employee.role === 'admin' && currentUser?.role !== 'admin') {
            console.warn('Non-admin user attempted to edit admin employee');
            return;
        }

        setEditingEmployee(employee);
        setFormData({
            employee_number: employee.employee_number,
            name: employee.name,
            phone: (employee.role === 'manager' || employee.role === 'admin') ? (employee.phone || '') : undefined,
            role: employee.role,
            access_levels: employee.access_levels as AccessLevel[],
            hire_date: employee.hire_date,
            password: '', // Don't pre-fill password
            pin: '', // Don't pre-fill PIN (like password)
            is_active: employee.is_active
        });
        setFormErrors({});
        setShowEmployeeForm(true);
    };

    // Handle closing form
    const handleCloseForm = () => {
        setShowEmployeeForm(false);
        setEditingEmployee(null);
        setFormData({
            employee_number: '',
            name: '',
            phone: undefined, // Undefined for cashier role
            role: 'cashier',
            access_levels: ['sales'], // Default for cashiers
            hire_date: new Date().toISOString().split('T')[0],
            password: '',
            pin: '', // Empty PIN for reset
            is_active: true
        });
        setFormErrors({});
    };

    // Handle delete confirmation
    const handleDeleteEmployee = async () => {
        if (!showDeleteConfirm) return;

        // Prevent non-admins from deleting admin employees
        if (showDeleteConfirm.role === 'admin' && currentUser?.role !== 'admin') {
            console.error('Security violation: Non-admin attempted to delete admin employee');
            setShowDeleteConfirm(null);
            return;
        }

        try {
            await deleteEmployee(showDeleteConfirm.id);
            setShowDeleteConfirm(null);
        } catch (error) {
            console.error('Failed to delete employee:', error);
        }
    };

    // Handle dropdown toggle
    const handleDropdownToggle = (employeeId: string) => {
        setOpenDropdown(openDropdown === employeeId ? null : employeeId);
    };

    // Handle activate/deactivate employee
    const handleToggleEmployeeStatus = async (employee: Employee) => {
        try {
            await updateEmployee(employee.id, { is_active: !employee.is_active });
            setOpenDropdown(null);
        } catch (error) {
            console.error('Failed to update employee status:', error);
        }
    };

    // Handle copy employee number
    const handleCopyEmployeeNumber = (employeeNumber: string) => {
        navigator.clipboard.writeText(employeeNumber);
        setOpenDropdown(null);
        // You could add a toast notification here
    };

    // Show database reset if there's a schema error
    if (showDatabaseReset) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('employees.header.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('employees.errors.dbResetNeeded')}</p>
                </div>
                <DatabaseReset onComplete={() => window.location.reload()} />
            </div>
        );
    }

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
                <div className="flex space-x-3">
                    <button onClick={refreshEmployees} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">{t('employees.errors.retry')}</button>
                    <button
                        onClick={() => setShowDatabaseReset(true)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
                    >
                        {t('employees.errors.resetDb')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('employees.header.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('employees.header.subtitle')}</p>
                </div>
                <AdminActionButton
                    variant="primary"
                    label={t('employees.header.addEmployee')}
                    icon={Plus}
                    onClick={handleAddEmployee}
                />
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder={t('employees.header.searchPlaceholder')}
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
                                    {role === 'all' ? t('employees.header.allRoles') : role.charAt(0).toUpperCase() + role.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center space-x-2">
                        <AdminActionButton
                            variant="ghost"
                            label={t('employees.header.filters')}
                            icon={Filter}
                            className="bg-gray-100 hover:bg-gray-200"
                        />
                    </div>
                </div>
            </div>

            {/* Employee Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredEmployees.map((employee) => {
                    // Calculate days worked (assuming 8 hours = 1 day)
                    const daysWorked = Math.max(1, Math.round(employee.hours_worked / 8));

                    return (
                        <div key={employee.id} className={`bg-white rounded-xl shadow-lg p-6 border ${employee.is_active ? 'border-gray-100' : 'border-gray-200'}`}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center space-x-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${employee.is_active ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-gray-300'}`}>
                                        <span className="text-white text-lg font-bold">
                                            {employee.name.split(' ').map(n => n[0]).join('')}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className={`text-lg font-bold ${employee.is_active ? 'text-gray-800' : 'text-gray-700'}`}>{employee.name}</h3>
                                        <p className={`text-sm ${employee.is_active ? 'text-gray-600' : 'text-gray-50'}`}>{employee.employee_number}</p>
                                        <p className={`text-sm ${employee.is_active ? 'text-gray-50' : 'text-gray-400'}`}>{employee.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {getRoleBadge(employee.role, employee.is_active)}
                                    {/* Show lock icon for admin employees when viewed by non-admins */}
                                    {employee.role === 'admin' && currentUser?.role !== 'admin' && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600" title={t('employees.badges.adminAccessRestricted')}>
                                            <KeyRound className="w-3 h-3" />
                                        </span>
                                    )}
                                    {!employee.is_active && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                                            {t('employees.badges.inactive')}
                                        </span>
                                    )}
                                    <div className="relative" ref={openDropdown === employee.id ? dropdownRef : null}>
                                        <button
                                            onClick={() => handleDropdownToggle(employee.id)}
                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>

                                        {/* Dropdown Menu */}
                                        {openDropdown === employee.id && (
                                            <div className="absolute right-0 top-10 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                                                <button
                                                    onClick={() => {
                                                        handleEditEmployee(employee);
                                                        setOpenDropdown(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                    <span>{t('employees.actions.edit')}</span>
                                                </button>

                                                <button
                                                    onClick={() => handleCopyEmployeeNumber(employee.employee_number)}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                    <span>{t('employees.actions.copyNumber')}</span>
                                                </button>

                                                <button
                                                    onClick={() => handleToggleEmployeeStatus(employee)}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                                >
                                                    {employee.is_active ? (
                                                        <>
                                                            <UserX className="w-4 h-4" />
                                                            <span>{t('employees.actions.deactivate')}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <UserCheck className="w-4 h-4" />
                                                            <span>{t('employees.actions.reactivate')}</span>
                                                        </>
                                                    )}
                                                </button>

                                                <div className="border-t border-gray-100 my-1"></div>

                                                <button
                                                    onClick={() => {
                                                        setShowDeleteConfirm(employee);
                                                        setOpenDropdown(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    <span>{t('employees.actions.delete')}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className={`${employee.is_active ? 'bg-green-50' : 'bg-gray-100'} p-3 rounded-lg`}>
                                    <div className="flex items-center space-x-2 mb-1">
                                        <Banknote className={`w-4 h-4 ${employee.is_active ? 'text-green-600' : 'text-gray-50'}`} />
                                        <span className={`text-sm font-medium ${employee.is_active ? 'text-green-800' : 'text-gray-600'}`}>{t('employees.card.totalSales')}</span>
                                    </div>
                                    <p className={`text-lg font-bold ${employee.is_active ? 'text-green-700' : 'text-gray-700'}`}>€{employee.total_sales.toFixed(2)}</p>
                                </div>

                                <div className={`${employee.is_active ? 'bg-blue-50' : 'bg-gray-100'} p-3 rounded-lg`}>
                                    <div className="flex items-center space-x-2 mb-1">
                                        <Clock className={`w-4 h-4 ${employee.is_active ? 'text-blue-600' : 'text-gray-50'}`} />
                                        <span className={`text-sm font-medium ${employee.is_active ? 'text-blue-800' : 'text-gray-600'}`}>{t('employees.card.daysWorked')}</span>
                                    </div>
                                    <p className={`text-lg font-bold ${employee.is_active ? 'text-blue-700' : 'text-gray-700'}`}>{daysWorked}</p>
                                </div>
                            </div>

                            <div className="mb-4">
                                <div>
                                    <p className={`text-sm ${employee.is_active ? 'text-gray-600' : 'text-gray-50'}`}>{t('employees.card.transactions')}</p>
                                    <p className={`font-semibold ${employee.is_active ? 'text-gray-800' : 'text-gray-700'}`}>{employee.transaction_count}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                                <span className="text-sm text-gray-50">
                                    {t('employees.card.hireDate')} {new Date(employee.hire_date).toLocaleDateString(language?.startsWith('pt') ? 'pt-PT' : 'en-US')}
                                </span>
                                <div className="flex items-center space-x-2">
                                    {/* Only admins can edit other admins */}
                                    {(currentUser?.role === 'admin' || employee.role !== 'admin') ? (
                                        <button
                                            onClick={() => handleEditEmployee(employee)}
                                            className={`p-2 rounded-lg transition-colors ${employee.is_active ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-50 hover:bg-gray-100'}`}
                                            title={t('employees.actions.edit')}
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            disabled
                                            className="p-2 text-gray-400 cursor-not-allowed rounded-lg"
                                            title={t('employees.actions.onlyAdminsEditAdmins')}
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    )}

                                    {/* Only admins can delete other admins */}
                                    {(currentUser?.role === 'admin' || employee.role !== 'admin') ? (
                                        <button
                                            onClick={() => setShowDeleteConfirm(employee)}
                                            className={`p-2 rounded-lg transition-colors ${employee.is_active ? 'text-red-600 hover:bg-red-50' : 'text-gray-50 hover:bg-gray-100'}`}
                                            title={t('employees.actions.delete')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            disabled
                                            className="p-2 text-gray-400 cursor-not-allowed rounded-lg"
                                            title={t('employees.actions.onlyAdminsDeleteAdmins')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Employee Form Modal */}
            {showEmployeeForm && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={handleCloseForm} />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="flex items-center justify-center min-h-full px-4 py-8">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                                {/* Header */}
                                <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-6 rounded-t-2xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold">
                                                {editingEmployee ? t('employees.actions.editTitle') : t('employees.actions.addTitle')}
                                            </h2>
                                            {formData.employee_number && (
                                                <p className="text-blue-100 text-sm mt-1">
                                                    {t('employees.form.employeeNumber')} {formData.employee_number}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleCloseForm}
                                            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Form */}
                                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                                    {/* Basic Information */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('employees.form.basicInfo')}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* 1. Full Name */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('employees.form.fullName')} *</label>
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => handleFormChange('name', e.target.value)}
                                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formErrors.name ? 'border-red-500' : 'border-gray-300'
                                                        }`}
                                                    placeholder={t('employees.form.placeholderName')}
                                                />
                                                {formErrors.name && (
                                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                                        <AlertCircle className="w-4 h-4 mr-1" />
                                                        {formErrors.name}
                                                    </p>
                                                )}
                                            </div>

                                            {/* 2. Hire Date */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('employees.form.hireDate')} *</label>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="date"
                                                        value={formData.hire_date}
                                                        onChange={(e) => handleFormChange('hire_date', e.target.value)}
                                                        className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formErrors.hire_date ? 'border-red-500' : 'border-gray-300'
                                                            }`}
                                                    />
                                                </div>
                                                {formErrors.hire_date && (
                                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                                        <AlertCircle className="w-4 h-4 mr-1" />
                                                        {formErrors.hire_date}
                                                    </p>
                                                )}
                                            </div>

                                            {/* 3. Role */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('employees.form.role')} *</label>
                                                <select
                                                    value={formData.role}
                                                    onChange={(e) => handleFormChange('role', e.target.value as EmployeeRole)}
                                                    disabled={editingEmployee?.role === 'admin' && currentUser?.role !== 'admin'}
                                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingEmployee?.role === 'admin' && currentUser?.role !== 'admin'
                                                        ? 'border-gray-200 bg-gray-50 text-gray-50 cursor-not-allowed'
                                                        : 'border-gray-300'
                                                        }`}
                                                >
                                                    <option value="cashier">Cashier</option>
                                                    <option value="manager">Manager</option>
                                                    {/* Only admins can create/assign admin role */}
                                                    {currentUser?.role === 'admin' && (
                                                        <option value="admin">Admin</option>
                                                    )}
                                                </select>
                                            </div>

                                            {/* 4. Phone field - only for managers and admins */}
                                            {(formData.role === 'manager' || formData.role === 'admin') && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('employees.form.phone')}</label>
                                                    <div className="relative">
                                                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                        <input
                                                            type="tel"
                                                            value={formData.phone ?? ''}
                                                            onChange={(e) => handleFormChange('phone', e.target.value)}
                                                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                            placeholder="+351 912 345 678"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Security */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('employees.form.security')}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Password field - only for admins */}
                                            {formData.role === 'admin' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('employees.form.password')} {!editingEmployee && '*'}</label>
                                                    <div className="relative">
                                                        <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                        <input
                                                            type={showPassword ? 'text' : 'password'}
                                                            value={formData.password}
                                                            onChange={(e) => handleFormChange('password', e.target.value)}
                                                            className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                                                            placeholder={editingEmployee ? t('employees.form.placeholderPasswordKeep') : t('employees.form.placeholderPassword')}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                        >
                                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                    {formErrors.password && (
                                                        <p className="mt-1 text-sm text-red-600 flex items-center">
                                                            <AlertCircle className="w-4 h-4 mr-1" />
                                                            {formErrors.password}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* PIN field - for managers and cashiers */}
                                            {(formData.role === 'manager' || formData.role === 'cashier') && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('employees.form.pin')} {!editingEmployee && '*'}</label>
                                                    <input
                                                        type="text"
                                                        value={formData.pin}
                                                        onChange={(e) => handleFormChange('pin', e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formErrors.pin ? 'border-red-500' : 'border-gray-300'}`}
                                                        placeholder={editingEmployee ? t('employees.form.placeholderPinKeep') : 'PIN'}
                                                        maxLength={8}
                                                    />
                                                    {formErrors.pin && (
                                                        <p className="mt-1 text-sm text-red-600 flex items-center">
                                                            <AlertCircle className="w-4 h-4 mr-1" />
                                                            {formErrors.pin}
                                                        </p>
                                                    )}
                                                    <p className="mt-1 text-xs text-gray-50">{editingEmployee ? t('employees.form.pinHelperEdit') : t('employees.form.pinHelperNew')}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Access Levels - Hidden for admins (they get all access automatically) */}
                                    {formData.role !== 'admin' && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('employees.form.accessLevels')}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {accessLevels.map((level) => (
                                                    <label
                                                        key={level.value}
                                                        className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.access_levels.includes(level.value)}
                                                            onChange={() => handleAccessLevelToggle(level.value)}
                                                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                        />
                                                        <div>
                                                            <div className="font-medium text-gray-900">{level.label}</div>
                                                            <div className="text-sm text-gray-50">{level.description}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                            {formErrors.access_levels && (
                                                <p className="mt-2 text-sm text-red-600 flex items-center">
                                                    <AlertCircle className="w-4 h-4 mr-1" />
                                                    {formErrors.access_levels}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Status */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('employees.form.status')}</h3>
                                        <label className="flex items-center space-x-3">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active}
                                                onChange={(e) => handleFormChange('is_active', e.target.checked)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-gray-900">{t('employees.form.activeEmployee')}</span>
                                        </label>
                                    </div>

                                    {/* Form Actions */}
                                    <div className="flex space-x-4 pt-6 border-t border-gray-200">
                                        <button
                                            type="button"
                                            onClick={handleCloseForm}
                                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                        >
                                            {t('employees.form.cancel')}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span>{t('employees.form.saving')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="w-4 h-4" />
                                                    <span>{editingEmployee ? t('employees.form.update') : t('employees.form.create')}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowDeleteConfirm(null)} />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                    <Trash2 className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Delete Employee</h3>
                                    <p className="text-sm text-gray-50">This action cannot be undone</p>
                                </div>
                            </div>

                            <p className="text-gray-700 mb-6">
                                Are you sure you want to delete <strong>{showDeleteConfirm.name}</strong>?
                                This will remove all employee data and cannot be reversed.
                            </p>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(null)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteEmployee}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Employees;