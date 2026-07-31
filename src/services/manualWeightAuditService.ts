/**
 * Manual weight entry: manager/admin PIN authorization + local audit log.
 *
 * When the scale is unavailable, a weighed product may be sold with a
 * hand-typed weight ONLY after a manager or admin authorizes it with their
 * employee number + PIN (verified server-side by the same `employee_pin_login`
 * RPC the login screen uses — wrong PINs count toward its lockout, which is
 * the desired brute-force behavior). Every manual weight is appended to a
 * local Dexie audit table (same pattern as cash drawer events).
 */

import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import { supabase } from '../lib/supabase';
import type { LocalManualWeightAudit } from '../types/scaleAudit';
import { generateUUID } from '../utils/uuid';

const AUTHORIZED_ROLES = new Set(['admin', 'manager']);

interface PinLoginRow {
    success: boolean;
    employee_id: string | null;
    error: string | null;
}

export interface ManualWeightAuthorizer {
    id: string;
    name: string;
    employeeNumber: string | null;
}

const getTerminalId = (): string => {
    const storageKey = 'pos_terminal_id';
    const stored = localStorage.getItem(storageKey);
    if (stored) return stored;
    const generated = generateUUID();
    localStorage.setItem(storageKey, generated);
    return generated;
};

class ManualWeightAuditService {
    /** Verify a manager/admin employee number + PIN. Fail-closed on any doubt. */
    async authorize(
        employeeNumber: string,
        pin: string
    ): Promise<{ success: boolean; authorizer?: ManualWeightAuthorizer; error?: 'invalid' | 'locked' | 'not_manager' | 'offline' }> {
        try {
            const { data, error } = await supabase.rpc('employee_pin_login', {
                p_employee_number: employeeNumber.trim(),
                p_secret: pin,
            });
            if (error) return { success: false, error: 'offline' };

            const row = (data as PinLoginRow[] | null)?.[0];
            if (!row?.success || !row.employee_id) {
                return { success: false, error: row?.error === 'locked' ? 'locked' : 'invalid' };
            }

            const { employeeService } = await import('./employeeService');
            const employee = await employeeService.getEmployeeById(row.employee_id);
            if (!employee || !employee.is_active || !AUTHORIZED_ROLES.has(employee.role)) {
                return { success: false, error: 'not_manager' };
            }
            return {
                success: true,
                authorizer: {
                    id: employee.id,
                    name: employee.name,
                    employeeNumber: employee.employee_number ?? null,
                },
            };
        } catch {
            return { success: false, error: 'offline' };
        }
    }

    async log(entry: {
        product: { id: string; name: string };
        weightKg: number;
        cashier: { id: string; name: string };
        authorizer: ManualWeightAuthorizer;
        scaleState: string;
    }): Promise<LocalManualWeightAudit> {
        await initializeLocalDatabase();
        const now = new Date();
        const row: LocalManualWeightAudit = {
            id: generateUUID(),
            product_id: entry.product.id,
            product_name: entry.product.name,
            weight_kg: entry.weightKg,
            cashier_id: entry.cashier.id,
            cashier_name: entry.cashier.name,
            authorized_by_id: entry.authorizer.id,
            authorized_by_name: entry.authorizer.name,
            authorized_by_number: entry.authorizer.employeeNumber,
            scale_state: entry.scaleState,
            terminal_id: getTerminalId(),
            timestamp: now,
            created_at: now,
        };
        await localDb.manualWeightAudits.add(row);
        return row;
    }
}

export const manualWeightAuditService = new ManualWeightAuditService();
export default manualWeightAuditService;
