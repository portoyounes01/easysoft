/**
 * "Administrador de sistema" — apenas estes números de funcionário veem certificação AT sensível
 * (Definições). Não confundir com `role === 'admin'` ou `access_levels: ['all']`.
 *
 * Lista configurável: `VITE_SYSTEM_ADMIN_EMPLOYEE_NUMBERS` (vírgulas, sem espaços). Por defeito: ADMIN001 (bootstrap).
 */
const DEFAULT_SYSTEM_ADMIN_NUMBERS = ['ADMIN001'];

function configuredSystemAdminNumbers(): string[] {
    const raw = import.meta.env.VITE_SYSTEM_ADMIN_EMPLOYEE_NUMBERS?.trim();
    if (!raw) return DEFAULT_SYSTEM_ADMIN_NUMBERS;
    return raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

export function isSystemAdministrator(employee: { employee_number: string } | null | undefined): boolean {
    if (!employee?.employee_number) return false;
    const n = employee.employee_number.trim();
    return configuredSystemAdminNumbers().some(x => x === n);
}
