import React, { useState, useMemo, useEffect, useRef } from 'react';
import { WithDialogTokens } from '../components/ui/dialogParts';
import {
    Plus,
    Search,
    Filter,
    Edit,
    Trash2,
    Shield,
    Clock,
    MoreVertical,
    AlertCircle,
    Eye,
    EyeOff,
    Calendar,
    Phone,
    KeyRound,
    UserCheck,
    UserX,
    Copy,
    Banknote,
    X,
    MoreHorizontal,
    SlidersHorizontal
} from 'lucide-react';
import { useEmployees } from '../contexts/EmployeesContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { EmployeeFormData, EmployeeRole, AccessLevel, Employee } from '../types/supabase';
import DatabaseReset from '../components/DatabaseReset';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { ActionButton } from '../components/ui/ActionButton';
import { TableActionButton } from '../components/ui/TableActionButton';
import { MenuRow } from '../components/ui/MenuRow';
import { BaseDialog } from '../components/ui/BaseDialog';
import { ConfiguredDialogShell } from '../components/ui/ConfiguredDialogShell';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import {
    isRestrictedAccessLevel,
    RestrictedAccessLevels,
} from '../utils/accessPermissions';
import { isSystemAdministrator } from '../utils/systemAdmin';
import { useIsMobile } from '../hooks/useIsMobile';
import '../styles/design-system-2-scope.css';

const EmployeesInner: React.FC = () => {
    const {
        employees,
        isLoading,
        loadError,
        syncError,
        operationError,
        refreshEmployees,
        createEmployee,
        updateEmployee,
        deleteEmployee,
        clearSyncError,
        clearOperationError
    } = useEmployees();

    const { employee: currentUser, principal } = useSupabaseAuth();
    // IDENTITY check (SYS001) — gates who may SEE/GRANT the RESTRICTED access levels
    // (reports/dashboard/profit_costs/orders/clear_data) and protects SYS001 rows.
    // Extended ONLY to owner (a membership human, the tenant's top authority). Keeping this
    // narrow is critical: folding it into a role check would let every admin grant
    // restricted levels (privilege escalation) — docs/pwa-p1-refactor-plan.md Gap #1.
    const isCurrentSystemAdmin = isSystemAdministrator(currentUser) || principal?.role === 'owner';
    // SEPARATE role gate — who may create/edit/delete ADMIN-role employees. A till admin
    // employee, a human admin, or a human owner (NOT a manager). Deliberately distinct from
    // isCurrentSystemAdmin so an admin can manage admins without gaining restricted-grant power.
    const canManageAdminEmployees = currentUser?.role === 'admin' || principal?.role === 'admin' || principal?.role === 'owner';

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRole, setSelectedRole] = useState('all');
    const [showEmployeeForm, setShowEmployeeForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<Employee | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [showMobileRoleChips, setShowMobileRoleChips] = useState(true);
    const employeeFormSnapshotRef = useRef<string>('');
    const isMobileViewport = useIsMobile();
    const [showDatabaseReset, setShowDatabaseReset] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const roles = ['all', 'admin', 'manager', 'cashier'];
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const appliedDialogStyle = useAppliedDialogStyle();

    const toolbarBtn =
        'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';
    const headerPrimaryBtn =
        'ds2-control-radius-lg ds2-toolbar-control-h !px-4 text-sm font-semibold gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

    const scopeShell = (children: React.ReactNode, extraClass = '') => (
        <div
            className={['ds2-visual-scope', extraClass].filter(Boolean).join(' ')}
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            {children}
        </div>
    );

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

    // IndexedDB / schema hints: check both list load and mutation errors
    const dbErrorHint = loadError || operationError;
    useEffect(() => {
        if (dbErrorHint && (
            dbErrorHint.includes('object store') ||
            dbErrorHint.includes('NotFoundError') ||
            dbErrorHint.includes('IDBTransaction') ||
            dbErrorHint.includes('database object could not be found')
        )) {
            setShowDatabaseReset(true);
        }
    }, [dbErrorHint]);

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
    const accessLevels = useMemo(() => {
        const ordinaryLevels: AccessLevel[] = [
            'all',
            'sales',
            'inventory',
            'customers',
            'employees',
            'settings',
            'transactions',
        ];
        const visibleLevels = isCurrentSystemAdmin
            ? [...ordinaryLevels, ...RestrictedAccessLevels]
            : ordinaryLevels;

        return visibleLevels.map(value => ({
            value,
            label: t(`employees.accessLevels.${value}.label`),
            description: t(`employees.accessLevels.${value}.description`),
        }));
    }, [isCurrentSystemAdmin, t]);

    const editableAccessLevelValues = useMemo(
        () => accessLevels.map(level => level.value),
        [accessLevels]
    );

    // Memo-compute filtered list to avoid re-render churn
    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.employee_number.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = selectedRole === 'all' || emp.role === selectedRole;
            return matchesSearch && matchesRole && emp.deleted_at === null;
        });
    }, [employees, searchTerm, selectedRole]);

    const getRoleBadge = (role: string, isActive: boolean, compact = false) => {
        const sizing = compact
            ? 'space-x-0.5 px-1.5 py-0.5 text-[10px]'
            : 'space-x-1 px-2 py-1 text-xs';
        if (!isActive) {
            return (
                <span className={`inline-flex items-center ${sizing} rounded-full font-medium bg-gray-200 text-gray-700`}>
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
            <span className={`inline-flex items-center ${sizing} rounded-full font-medium ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
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
    const handleFormChange = (field: keyof EmployeeFormData, value: EmployeeFormData[keyof EmployeeFormData]) => {
        setFormData(prev => {
            const newData = {
                ...prev,
                [field]: value
            };

            // Handle role changes - manage phone visibility and access levels
            if (field === 'role') {
                const roleValue = value as EmployeeRole;
                if (roleValue === 'cashier') {
                    // Clear phone for cashiers
                    newData.phone = undefined;
                    // Set default access levels for cashiers
                    newData.access_levels = ['sales'];
                } else if (roleValue === 'manager') {
                    // Initialize phone for managers
                    if (prev.role === 'cashier') {
                        newData.phone = '';
                    }
                    // Set default access levels for managers
                    newData.access_levels = ['sales', 'inventory', 'customers', 'employees', 'settings', 'transactions'];
                } else if (roleValue === 'admin') {
                    // Initialize phone for admins
                    if (prev.role === 'cashier') {
                        newData.phone = '';
                    }
                    // Restricted permissions remain explicit and system-admin managed.
                    newData.access_levels = ['all'];
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
            const hiddenLevels = currentLevels.filter(
                currentLevel =>
                    currentLevel !== 'all' &&
                    !editableAccessLevelValues.includes(currentLevel)
            );
            const visibleNonAllLevels = editableAccessLevelValues.filter(
                editableLevel => editableLevel !== 'all'
            );
            const selectedVisibleLevels = visibleNonAllLevels.filter(
                editableLevel =>
                    currentLevels.includes(editableLevel) ||
                    (currentLevels.includes('all') && !isRestrictedAccessLevel(editableLevel))
            );
            const isCurrentlySelected =
                level === 'all'
                    ? currentLevels.includes('all')
                    : selectedVisibleLevels.includes(level);

            if (level === 'all') {
                if (isCurrentlySelected) {
                    return { ...prev, access_levels: hiddenLevels };
                } else {
                    return {
                        ...prev,
                        access_levels: Array.from(new Set([
                            ...hiddenLevels,
                            'all' as AccessLevel,
                            ...(isCurrentSystemAdmin ? visibleNonAllLevels : []),
                        ])),
                    };
                }
            } else {
                const nextVisibleLevels = isCurrentlySelected
                    ? selectedVisibleLevels.filter(currentLevel => currentLevel !== level)
                    : [...selectedVisibleLevels, level];
                const hasAllVisiblePermissions = visibleNonAllLevels.every(permission =>
                    nextVisibleLevels.includes(permission)
                );
                return {
                    ...prev,
                    access_levels: Array.from(new Set([
                        ...hiddenLevels,
                        ...nextVisibleLevels,
                        ...(hasAllVisiblePermissions ? ['all' as AccessLevel] : []),
                    ])),
                };
            }
        });
    };

    const isAccessLevelSelected = (level: AccessLevel): boolean => {
        if (level === 'all') return formData.access_levels.includes('all');
        return (
            formData.access_levels.includes(level) ||
            (formData.access_levels.includes('all') && !isRestrictedAccessLevel(level))
        );
    };

    // Validate form
    const validateForm = (): boolean => {
        const errors: Partial<Record<keyof EmployeeFormData, string>> = {};

        if (!formData.name.trim()) {
            errors.name = t('employees.form.errors.nameRequired');
        }

        // Prevent non-admins from assigning admin role
        if (formData.role === 'admin' && !canManageAdminEmployees) {
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
                errors.pin = t('employees.form.errors.pinRequired');
            } else if (formData.pin?.trim() && formData.pin.length < 4) {
                errors.pin = t('employees.form.errors.pinTooShort');
            } else if (formData.pin?.trim() && !/^\d+$/.test(formData.pin)) {
                errors.pin = t('employees.form.errors.pinDigitsOnly');
            }
        }

        if (!formData.hire_date) {
            errors.hire_date = t('employees.form.errors.hireDateRequired');
        }

        if (!isSystemAdministrator(editingEmployee) && formData.access_levels.length === 0) {
            errors.access_levels = t('employees.form.errors.accessLevelRequired');
        }

        // Password validation only for new admin employees
        if (formData.role === 'admin' && !editingEmployee && !formData.password?.trim()) {
            errors.password = t('employees.form.errors.passwordRequired');
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        // Additional security check: prevent non-admins from creating/modifying admin employees
        if (formData.role === 'admin' && !canManageAdminEmployees) {
            console.error('Security violation: Non-admin attempted to create/modify admin employee');
            return;
        }

        // If editing an admin employee, only allow admins
        if (editingEmployee?.role === 'admin' && !canManageAdminEmployees) {
            console.error('Security violation: Non-admin attempted to modify admin employee');
            return;
        }

        setIsSubmitting(true);
        try {
            const existingRestrictedAccessLevels = (editingEmployee?.access_levels ?? [])
                .filter(level => isRestrictedAccessLevel(level as AccessLevel)) as AccessLevel[];
            const submittedAccessLevels = isCurrentSystemAdmin
                ? formData.access_levels
                : Array.from(new Set([
                    ...formData.access_levels.filter(level => !isRestrictedAccessLevel(level)),
                    ...existingRestrictedAccessLevels,
                ]));
            const submittedFormData = {
                ...formData,
                access_levels: submittedAccessLevels,
            };

            if (editingEmployee) {
                // Update existing employee
                const updateData: Partial<EmployeeFormData> = { ...submittedFormData };
                if (!updateData.password?.trim()) {
                    delete updateData.password; // Don't update password if empty
                }
                if (!formData.pin?.trim()) {
                    // Don't include PIN in update if empty
                    const dataWithoutPin = { ...updateData };
                    delete dataWithoutPin.pin;
                    await updateEmployee(editingEmployee.id, dataWithoutPin as Partial<EmployeeFormData>);
                } else {
                    await updateEmployee(editingEmployee.id, updateData);
                }
            } else {
                // Create new employee
                await createEmployee(submittedFormData);
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
        if (isSystemAdministrator(employee) && !isCurrentSystemAdmin) {
            console.warn('Only a system administrator can edit another system administrator');
            return;
        }

        // Prevent non-admins from editing admin employees
        if (employee.role === 'admin' && !canManageAdminEmployees) {
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

        if (isSystemAdministrator(showDeleteConfirm)) {
            console.error('The configured system administrator cannot be deleted');
            setShowDeleteConfirm(null);
            return;
        }

        // Prevent non-admins from deleting admin employees
        if (showDeleteConfirm.role === 'admin' && !canManageAdminEmployees) {
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

    // Mobile form sheet: snapshot the form when it opens so the X can warn on unsaved edits.
    useEffect(() => {
        if (showEmployeeForm) {
            employeeFormSnapshotRef.current = JSON.stringify(formData);
            setShowDiscardConfirm(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showEmployeeForm]);

    const requestCloseEmployeeForm = () => {
        if (JSON.stringify(formData) !== employeeFormSnapshotRef.current) {
            setShowDiscardConfirm(true);
        } else {
            handleCloseForm();
        }
    };

    /**
     * Kebab actions menu (edit / copy number / (de)activate / delete), shared by the desktop
     * card and the mobile list row. `menuId` must be unique per rendered instance (the mobile
     * row uses `m-<id>`) so the open/close + click-outside logic keeps working.
     */
    const renderEmployeeActionsMenu = (employee: Employee, canDeleteEmployee: boolean, menuId: string, horizontalTrigger = false) => (
        <div className="relative" ref={openDropdown === menuId ? dropdownRef : null}>
            <TableActionButton
                variant="icon"
                icon={horizontalTrigger ? MoreHorizontal : MoreVertical}
                onClick={() => handleDropdownToggle(menuId)}
            />
            {openDropdown === menuId && (
                <div className="absolute right-0 top-10 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                    <MenuRow
                        icon={Edit}
                        label={t('employees.actions.edit')}
                        onClick={() => {
                            handleEditEmployee(employee);
                            setOpenDropdown(null);
                        }}
                    />

                    <MenuRow
                        icon={Copy}
                        label={t('employees.actions.copyNumber')}
                        onClick={() => handleCopyEmployeeNumber(employee.employee_number)}
                    />

                    {!isSystemAdministrator(employee) && (
                        <MenuRow
                            icon={employee.is_active ? UserX : UserCheck}
                            label={employee.is_active ? t('employees.actions.deactivate') : t('employees.actions.reactivate')}
                            onClick={() => handleToggleEmployeeStatus(employee)}
                        />
                    )}

                    <div className="border-t border-gray-100 my-1"></div>

                    {canDeleteEmployee && (
                        <MenuRow
                            variant="danger"
                            icon={Trash2}
                            label={t('employees.actions.delete')}
                            onClick={() => {
                                setShowDeleteConfirm(employee);
                                setOpenDropdown(null);
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );

    // Handle activate/deactivate employee
    const handleToggleEmployeeStatus = async (employee: Employee) => {
        if (isSystemAdministrator(employee)) {
            console.warn('The configured system administrator cannot be deactivated');
            setOpenDropdown(null);
            return;
        }

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

    // Mobile: drop the ds2 content inset so page content aligns with the Layout-level
    // elements (e.g. the install banner), which only get the main `p-5`.
    const pageInsetX = isMobileViewport ? 'px-0' : layoutClasses.contentInsetX;

    // Show database reset if there's a schema error
    if (showDatabaseReset) {
        return scopeShell(
            <div className={`space-y-6 ${pageInsetX}`}>
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('employees.header.title')}</h1>
                    <p className="mt-1 text-gray-600">{t('employees.errors.dbResetNeeded')}</p>
                </div>
                <DatabaseReset onComplete={() => window.location.reload()} />
            </div>
        );
    }

    if (isLoading) {
        return scopeShell(
            <div className="flex min-h-60 items-center justify-center p-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    if (loadError) {
        return scopeShell(
            <div className={`flex h-full flex-col items-center justify-center space-y-4 p-12 ${pageInsetX}`}>
                <p className="font-semibold text-red-600">{loadError}</p>
                <div className="flex space-x-3">
                    <AdminActionButton
                        variant="primary"
                        type="button"
                        onClick={refreshEmployees}
                        label={t('employees.errors.retry')}
                    />
                    <button
                        type="button"
                        onClick={() => setShowDatabaseReset(true)}
                        className="rounded-xl bg-[var(--ds2-danger-solid,#dc2626)] px-4 py-2 font-semibold text-white hover:bg-[var(--ds2-danger-hover,#b91c1c)]"
                    >
                        {t('employees.errors.resetDb')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="ds2-visual-scope"
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className={`space-y-6 ${pageInsetX}`}>
            {syncError && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-gray-900">{t('login.syncDegradedTitle')}</p>
                        <p className="text-base text-gray-700 mt-1">{t('login.syncDegradedBody')}</p>
                        <p className="text-sm text-gray-600 mt-2 break-words">{syncError}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => clearSyncError()}
                        className="min-h-touch shrink-0 px-6 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold transition-colors duration-200"
                    >
                        {t('login.syncDegradedDismiss')}
                    </button>
                </div>
            )}
            {operationError && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4">
                    <p className="text-red-700 font-medium flex-1">{operationError}</p>
                    <button
                        type="button"
                        onClick={() => clearOperationError()}
                        className="min-h-touch px-6 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold transition-colors duration-200"
                    >
                        {t('pos.syncDegradedDismiss')}
                    </button>
                </div>
            )}
            {/* Header */}
            <div className="flex items-start justify-between gap-3 sm:items-center">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{t('employees.header.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('employees.header.subtitle')}</p>
                </div>
                <AdminActionButton
                    variant="primary"
                    label={isMobileViewport ? t('employees.header.addEmployeeShort') : t('employees.header.addEmployee')}
                    icon={Plus}
                    onClick={handleAddEmployee}
                    className={`${headerPrimaryBtn} shrink-0 self-start sm:self-auto`}
                />
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-100">
                {/* Mobile: full-width search + filter toggle, role chips below (desktop keeps the select). */}
                <div className="space-y-3 sm:hidden">
                    <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder={t('employees.header.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowMobileRoleChips((v) => !v)}
                            aria-label={t('employees.header.filters')}
                            aria-expanded={showMobileRoleChips}
                            className={`ds2-control-radius-lg ds2-toolbar-control-h box-border flex w-11 shrink-0 items-center justify-center border transition-colors ${showMobileRoleChips ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                        </button>
                    </div>
                    {showMobileRoleChips && (
                        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
                            {roles.map(role => (
                                <button
                                    key={role}
                                    type="button"
                                    onClick={() => setSelectedRole(role)}
                                    className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors ${selectedRole === role
                                        ? 'border border-green-500 bg-green-50 font-semibold text-green-700'
                                        : 'border border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {role === 'all' ? t('employees.header.allRoles') : role.charAt(0).toUpperCase() + role.slice(1)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="hidden sm:flex sm:flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder={t('employees.header.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-64 border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            className="ds2-control-radius-lg ds2-toolbar-control-h box-border border border-gray-200 bg-gray-50 px-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className={`${toolbarBtn} bg-gray-100 hover:bg-gray-200`}
                        />
                    </div>
                </div>
            </div>

            {/* Employee Cards */}
            {/* Mobile: compact contact-list rows (the analytics cards below are md+). */}
            <div className="space-y-3 md:hidden">
                {filteredEmployees.map((employee) => {
                    const canEditEmployee =
                        employee.role !== 'admin' ||
                        (canManageAdminEmployees &&
                            (isCurrentSystemAdmin || !isSystemAdministrator(employee)));
                    const canDeleteEmployee =
                        !isSystemAdministrator(employee) &&
                        (canManageAdminEmployees || employee.role !== 'admin');
                    return (
                        <div
                            key={employee.id}
                            className={`rounded-2xl border bg-white p-3 shadow-sm ${employee.is_active ? 'border-gray-100' : 'border-gray-200 opacity-75'}`}
                            data-testid={`employee-row-${employee.employee_number}`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${employee.is_active ? (employee.role === 'admin' ? 'bg-rose-500' : 'bg-green-600') : 'bg-gray-300'}`}>
                                    <span className="text-sm font-bold text-white">
                                        {employee.name.split(' ').map(n => n[0]).join('')}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => canEditEmployee && handleEditEmployee(employee)}
                                    className="min-w-0 flex-1 rounded-lg text-left transition-colors hover:bg-gray-50"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`min-w-0 truncate text-[15px] font-semibold ${employee.is_active ? 'text-gray-900' : 'text-gray-600'}`}>{employee.name}</span>
                                        <span className="shrink-0 font-mono text-[11px] text-gray-400">{employee.employee_number}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        {getRoleBadge(employee.role, employee.is_active, true)}
                                        {!employee.is_active && (
                                            <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                                                {t('employees.badges.inactive')}
                                            </span>
                                        )}
                                    </div>
                                </button>
                                {renderEmployeeActionsMenu(employee, canDeleteEmployee, `m-${employee.id}`, true)}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-2">
                {filteredEmployees.map((employee) => {
                    // Calculate days worked (assuming 8 hours = 1 day)
                    const daysWorked = Math.max(1, Math.round(employee.hours_worked / 8));
                    const canEditEmployee =
                        employee.role !== 'admin' ||
                        (canManageAdminEmployees &&
                            (isCurrentSystemAdmin || !isSystemAdministrator(employee)));
                    const canDeleteEmployee =
                        !isSystemAdministrator(employee) &&
                        (canManageAdminEmployees || employee.role !== 'admin');

                    return (
                        <div
                            key={employee.id}
                            className={`bg-white rounded-xl shadow-lg p-6 border ${employee.is_active ? 'border-gray-100' : 'border-gray-200'}`}
                            data-testid={`employee-card-${employee.employee_number}`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center space-x-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${employee.is_active ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-gray-300'}`}>
                                        <span className="text-white text-lg font-bold">
                                            {employee.name.split(' ').map(n => n[0]).join('')}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className={`text-lg font-bold ${employee.is_active ? 'text-gray-800' : 'text-gray-700'}`}>{employee.name}</h3>
                                        <p className={`text-sm ${employee.is_active ? 'text-gray-600' : 'text-gray-500'}`}>{employee.employee_number}</p>
                                        <p className={`text-sm ${employee.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{employee.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {getRoleBadge(employee.role, employee.is_active)}
                                    {/* Show lock icon for admin employees when viewed by non-admins */}
                                    {employee.role === 'admin' && !canManageAdminEmployees && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600" title={t('employees.badges.adminAccessRestricted')}>
                                            <KeyRound className="w-3 h-3" />
                                        </span>
                                    )}
                                    {!employee.is_active && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                                            {t('employees.badges.inactive')}
                                        </span>
                                    )}
                                    {renderEmployeeActionsMenu(employee, canDeleteEmployee, employee.id)}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className={`${employee.is_active ? 'bg-green-50' : 'bg-gray-100'} p-3 rounded-lg`}>
                                    <div className="flex items-center space-x-2 mb-1">
                                        <Banknote className={`w-4 h-4 ${employee.is_active ? 'text-green-600' : 'text-gray-500'}`} />
                                        <span className={`text-sm font-medium ${employee.is_active ? 'text-green-800' : 'text-gray-600'}`}>{t('employees.card.totalSales')}</span>
                                    </div>
                                    <p className={`text-lg font-bold ${employee.is_active ? 'text-green-700' : 'text-gray-700'}`}>€{employee.total_sales.toFixed(2)}</p>
                                </div>

                                <div className={`${employee.is_active ? 'bg-blue-50' : 'bg-gray-100'} p-3 rounded-lg`}>
                                    <div className="flex items-center space-x-2 mb-1">
                                        <Clock className={`w-4 h-4 ${employee.is_active ? 'text-blue-600' : 'text-gray-500'}`} />
                                        <span className={`text-sm font-medium ${employee.is_active ? 'text-blue-800' : 'text-gray-600'}`}>{t('employees.card.daysWorked')}</span>
                                    </div>
                                    <p className={`text-lg font-bold ${employee.is_active ? 'text-blue-700' : 'text-gray-700'}`}>{daysWorked}</p>
                                </div>
                            </div>

                            <div className="mb-4">
                                <div>
                                    <p className={`text-sm ${employee.is_active ? 'text-gray-600' : 'text-gray-500'}`}>{t('employees.card.transactions')}</p>
                                    <p className={`font-semibold ${employee.is_active ? 'text-gray-800' : 'text-gray-700'}`}>{employee.transaction_count}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                                <span className="text-sm text-gray-500">
                                    {t('employees.card.hireDate')} {new Date(employee.hire_date).toLocaleDateString(language?.startsWith('pt') ? 'pt-PT' : language?.startsWith('es') ? 'es-ES' : 'en-US')}
                                </span>
                                <div className="flex items-center space-x-2">
                                    {/* Only admins can edit other admins */}
                                    {canEditEmployee ? (
                                        <TableActionButton
                                            variant="icon"
                                            icon={Edit}
                                            onClick={() => handleEditEmployee(employee)}
                                            title={t('employees.actions.edit')}
                                            aria-label={`${t('employees.actions.edit')} ${employee.name}`}
                                        />
                                    ) : (
                                        <TableActionButton
                                            variant="icon"
                                            icon={Edit}
                                            disabled
                                            title={t('employees.actions.onlyAdminsEditAdmins')}
                                            aria-label={`${t('employees.actions.onlyAdminsEditAdmins')} ${employee.name}`}
                                        />
                                    )}

                                    {/* Only admins can delete other admins */}
                                    {canDeleteEmployee ? (
                                        <TableActionButton
                                            variant="delete"
                                            icon={Trash2}
                                            onClick={() => setShowDeleteConfirm(employee)}
                                            title={t('employees.actions.delete')}
                                        />
                                    ) : (
                                        <TableActionButton
                                            variant="icon"
                                            icon={Trash2}
                                            disabled
                                            title={t('employees.actions.onlyAdminsDeleteAdmins')}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Employee Form Modal */}
            {showEmployeeForm && (() => {
                // Shared form body: the tablet/terminal BaseDialog below renders it UNCHANGED;
                // mobile wraps the same children in a full-screen sheet (X top-left + sticky
                // full-width "Save Changes", per the mobile form pattern).
                const formShellChildren = (
                    <WithDialogTokens>{tk => (
                    <div className="flex h-full flex-col">
                        {formData.employee_number && (
                            <div className={`px-6 pt-5 text-sm font-medium ${tk.p.subText}`}>
                                {t('employees.form.employeeNumber')} {formData.employee_number}
                            </div>
                        )}

                        {/* Form */}
                        <form id="employee-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {/* Basic Information */}
                                    <div>
                                        <h3 className={`text-lg font-semibold ${tk.p.titleText} mb-4`}>{t('employees.form.basicInfo')}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* 1. Full Name */}
                                            <div>
                                                <label className={`block text-sm font-medium ${tk.p.titleText} mb-2`}>{t('employees.form.fullName')} *</label>
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
                                                <label className={`block text-sm font-medium ${tk.p.titleText} mb-2`}>{t('employees.form.hireDate')} *</label>
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
                                                <label className={`block text-sm font-medium ${tk.p.titleText} mb-2`}>{t('employees.form.role')} *</label>
                                                <select
                                                    value={formData.role}
                                                    onChange={(e) => handleFormChange('role', e.target.value as EmployeeRole)}
                                                    disabled={editingEmployee?.role === 'admin' && !canManageAdminEmployees}
                                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editingEmployee?.role === 'admin' && !canManageAdminEmployees
                                                        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                                                        : 'border-gray-300'
                                                        }`}
                                                >
                                                    <option value="cashier">{t('employees.form.roles.cashier')}</option>
                                                    <option value="manager">{t('employees.form.roles.manager')}</option>
                                                    {/* Only admins can create/assign admin role */}
                                                    {canManageAdminEmployees && (
                                                        <option value="admin">{t('employees.form.roles.admin')}</option>
                                                    )}
                                                </select>
                                            </div>

                                            {/* 4. Phone field - only for managers and admins */}
                                            {(formData.role === 'manager' || formData.role === 'admin') && (
                                                <div>
                                                    <label className={`block text-sm font-medium ${tk.p.titleText} mb-2`}>{t('employees.form.phone')}</label>
                                                    <div className="relative">
                                                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                        <input
                                                            type="tel"
                                                            value={formData.phone ?? ''}
                                                            onChange={(e) => handleFormChange('phone', e.target.value)}
                                                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                            placeholder={t('forms.phonePlaceholder')}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Security */}
                                    <div>
                                        <h3 className={`text-lg font-semibold ${tk.p.titleText} mb-4`}>{t('employees.form.security')}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Password field - only for admins */}
                                            {formData.role === 'admin' && (
                                                <div>
                                                    <label className={`block text-sm font-medium ${tk.p.titleText} mb-2`}>{t('employees.form.password')} {!editingEmployee && '*'}</label>
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
                                                    <label className={`block text-sm font-medium ${tk.p.titleText} mb-2`}>{t('employees.form.pin')} {!editingEmployee && '*'}</label>
                                                    <input
                                                        type="text"
                                                        value={formData.pin}
                                                        onChange={(e) => handleFormChange('pin', e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${formErrors.pin ? 'border-red-500' : 'border-gray-300'}`}
                                                        placeholder={editingEmployee ? t('employees.form.placeholderPinKeep') : t('forms.pinPlaceholder')}
                                                        maxLength={8}
                                                    />
                                                    {formErrors.pin && (
                                                        <p className="mt-1 text-sm text-red-600 flex items-center">
                                                            <AlertCircle className="w-4 h-4 mr-1" />
                                                            {formErrors.pin}
                                                        </p>
                                                    )}
                                                    <p className="mt-1 text-xs text-gray-500">{editingEmployee ? t('employees.form.pinHelperEdit') : t('employees.form.pinHelperNew')}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                            <h3 className={`text-lg font-semibold ${tk.p.titleText} mb-4`}>{t('employees.form.accessLevels')}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {accessLevels.map((level) => (
                                                    <label
                                                        key={level.value}
                                                        className="flex items-start space-x-3 p-3 rounded-[10px] border border-gray-200 bg-white transition-all hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isAccessLevelSelected(level.value)}
                                                            onChange={() => handleAccessLevelToggle(level.value)}
                                                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                        />
                                                        <div>
                                                            <div className="font-medium text-gray-900">{level.label}</div>
                                                            <div className="text-sm text-gray-500">{level.description}</div>
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

                                    {/* Status */}
                                    <div>
                                        <h3 className={`text-lg font-semibold ${tk.p.titleText} mb-4`}>{t('employees.form.status')}</h3>
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

                                </form>
                    </div>
                    )}</WithDialogTokens>
                );

                if (!isMobileViewport) {
                    return (
                        <BaseDialog
                            open={showEmployeeForm}
                            onClose={handleCloseForm}
                            title={editingEmployee ? t('employees.actions.editTitle') : t('employees.actions.addTitle')}
                            width="55vw"
                            height="85vh"
                            footer={
                                <div className="flex space-x-4">
                                    <ActionButton
                                        type="button"
                                        onClick={handleCloseForm}
                                        label={t('employees.form.cancel')}
                                        variant="secondary"
                                        className="flex-1"
                                        style={{ height: '5vh', fontSize: '1.6vh' }}
                                    />
                                    <ActionButton
                                        type="submit"
                                        form="employee-form"
                                        disabled={isSubmitting}
                                        label={isSubmitting ? t('employees.form.saving') : editingEmployee ? t('employees.form.update') : t('employees.form.create')}
                                        className="flex-1"
                                        style={{ height: '5vh', fontSize: '1.6vh' }}
                                    />
                                </div>
                            }
                        >
                            {formShellChildren}
                        </BaseDialog>
                    );
                }

                // Mobile: full-screen sheet — X top-left, centered title, scrollable form,
                // always-visible bottom primary action. No duplicated Cancel/Save.
                return (
                    <div className="fixed inset-0 z-[70] flex flex-col bg-white">
                        <div className="flex items-center border-b border-gray-200 px-2 py-2.5">
                            <button
                                type="button"
                                onClick={requestCloseEmployeeForm}
                                aria-label={t('common.cancel')}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-gray-700 transition-colors hover:bg-gray-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                            <h2 className="min-w-0 flex-1 truncate pr-10 text-center text-lg font-bold text-gray-900">
                                {editingEmployee ? t('employees.actions.editTitle') : t('employees.actions.addTitle')}
                            </h2>
                        </div>

                        <div className="min-h-0 flex-1">{formShellChildren}</div>

                        <div className="border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                            <button
                                type="submit"
                                form="employee-form"
                                disabled={isSubmitting}
                                className={`w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-60 ${appliedDialogStyle
                                    ? dialogButtonClasses(appliedDialogStyle).primary
                                    : 'rounded-xl bg-green-600 font-semibold text-white transition-colors hover:bg-green-700'}`}
                            >
                                {isSubmitting
                                    ? t('employees.form.saving')
                                    : editingEmployee
                                        ? t('employees.form.saveChanges')
                                        : t('employees.form.create')}
                            </button>
                        </div>

                        {/* Discard-changes confirmation (web modal — native confirm is unavailable in Electron) */}
                        {showDiscardConfirm && (appliedDialogStyle ? (
                            <ConfiguredDialogShell
                                config={appliedDialogStyle}
                                title={t('employees.form.discardTitle')}
                                subtitle={t('employees.form.discardBody')}
                                icon={AlertCircle}
                                onClose={() => setShowDiscardConfirm(false)}
                                overlayClassName="z-[80]"
                                footer={
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowDiscardConfirm(false)}
                                            className={`w-full ${dialogButtonClasses(appliedDialogStyle).secondary}`}
                                        >
                                            {t('employees.form.keepEditing')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowDiscardConfirm(false);
                                                handleCloseForm();
                                            }}
                                            className={`w-full ${dialogButtonClasses(appliedDialogStyle).danger}`}
                                        >
                                            {t('employees.form.discard')}
                                        </button>
                                    </div>
                                }
                            >
                                <p className="px-6 py-5 text-sm text-gray-600">{t('employees.form.discardBody')}</p>
                            </ConfiguredDialogShell>
                        ) : (
                            <div
                                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6"
                                onClick={() => setShowDiscardConfirm(false)}
                            >
                                <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                    <h3 className="text-lg font-bold text-gray-900">{t('employees.form.discardTitle')}</h3>
                                    <p className="mt-1 text-sm text-gray-600">{t('employees.form.discardBody')}</p>
                                    <div className="mt-5 space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowDiscardConfirm(false)}
                                            className="w-full rounded-xl bg-gray-100 py-3 font-semibold text-gray-900 transition-colors hover:bg-gray-200"
                                        >
                                            {t('employees.form.keepEditing')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowDiscardConfirm(false);
                                                handleCloseForm();
                                            }}
                                            className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700"
                                        >
                                            {t('employees.form.discard')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (appliedDialogStyle ? (
                <ConfiguredDialogShell
                    config={appliedDialogStyle}
                    title={t('employees.confirm.title')}
                    subtitle={t('employees.confirm.subtitle')}
                    icon={Trash2}
                    onClose={() => setShowDeleteConfirm(null)}
                    footer={
                        <div className={dialogButtonClasses(appliedDialogStyle).container}>
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className={dialogButtonClasses(appliedDialogStyle).secondary}
                            >
                                {t('employees.confirm.cancel')}
                            </button>
                            <button
                                onClick={handleDeleteEmployee}
                                className={dialogButtonClasses(appliedDialogStyle).danger}
                            >
                                {t('employees.confirm.delete')}
                            </button>
                        </div>
                    }
                >
                    <p className="px-6 py-5 text-gray-700">
                        {t('employees.confirm.deleteQuestion', { name: showDeleteConfirm.name })}
                    </p>
                </ConfiguredDialogShell>
            ) : (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowDeleteConfirm(null)} />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                    <Trash2 className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">{t('employees.confirm.title')}</h3>
                                    <p className="text-sm text-gray-500">{t('employees.confirm.subtitle')}</p>
                                </div>
                            </div>

                            <p className="text-gray-700 mb-6">
                                {t('employees.confirm.deleteQuestion', { name: showDeleteConfirm.name })}
                            </p>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(null)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    {t('employees.confirm.cancel')}
                                </button>
                                <button
                                    onClick={handleDeleteEmployee}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                                >
                                    {t('employees.confirm.delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            ))}
        </div>
        </div>
    );
};

export default EmployeesInner;
