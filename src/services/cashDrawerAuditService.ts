import i18n from '../i18n';
import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type {
    CashDrawerReasonCode,
    LocalCashDrawerEvent,
} from '../types/cashDrawer';
import { generateUUID } from '../utils/uuid';
import electronHardwareService from './electronHardwareService';

interface DrawerOperator {
    id: string;
    name: string;
    employeeNumber?: string;
}

interface TerminalContext {
    label: string;
}

interface ManualOpenRequest {
    operator: DrawerOperator;
    terminal: TerminalContext;
    reasonCode: Exclude<CashDrawerReasonCode, 'sale'>;
    justification: string;
}

interface SaleOpenRequest {
    operator: DrawerOperator;
    terminal: TerminalContext;
    transactionId?: string;
    transactionReference: string;
    saleAmount: number;
}

const getTerminalId = (): string => {
    const storageKey = 'pos_terminal_id';
    const stored = localStorage.getItem(storageKey);
    if (stored) return stored;
    const generated = generateUUID();
    localStorage.setItem(storageKey, generated);
    return generated;
};

class CashDrawerAuditService {
    private async append(
        event: Omit<LocalCashDrawerEvent, 'id' | 'terminal_id' | 'timestamp' | 'created_at'>
    ): Promise<LocalCashDrawerEvent> {
        await initializeLocalDatabase();
        const now = new Date();
        const row: LocalCashDrawerEvent = {
            ...event,
            id: generateUUID(),
            terminal_id: getTerminalId(),
            timestamp: now,
            created_at: now,
        };
        await localDb.cashDrawerEvents.add(row);
        return row;
    }

    private async issueOpenCommand(reason: string): Promise<{
        success: boolean;
        method: string | null;
        error: string | null;
    }> {
        if (!electronHardwareService.isElectronEnvironment()) {
            return {
                success: false,
                method: 'browser_unavailable',
                error: 'Cash drawer hardware control is only available in the Electron terminal.',
            };
        }

        // Send the command FIRST. Initializing before every open used to gate the
        // drawer behind a full hardware re-init, so any hiccup in that check
        // (queue probe timeout, spooler blip) swallowed the open entirely and the
        // drawer never moved — while the Settings test card, which initializes
        // once on mount and then only sends, worked fine. Initialization is now
        // recovery, not a precondition: the main process validates the configured
        // printer itself and reports readiness in its own error.
        const open = () => electronHardwareService.openCashDrawer({ command: 'standard', reason });

        let result = await open();
        if (!result.success && /not initialized/i.test(result.error ?? '')) {
            const initialization = await electronHardwareService.initialize();
            if (!initialization.success) {
                return {
                    success: false,
                    method: 'initialization_failed',
                    error: initialization.error ?? 'Cash drawer hardware initialization failed.',
                };
            }
            result = await open();
        }

        return {
            success: result.success,
            method: result.success ? result.message ?? 'electron' : 'electron_failed',
            error: result.error ?? null,
        };
    }

    async openForSale(request: SaleOpenRequest): Promise<LocalCashDrawerEvent> {
        const hardware = await this.issueOpenCommand(`Cash sale ${request.transactionReference}`);
        return this.append({
            employee_id: request.operator.id,
            employee_name: request.operator.name,
            employee_number: request.operator.employeeNumber ?? null,
            transaction_id: request.transactionId ?? null,
            transaction_reference: request.transactionReference,
            action: 'open',
            trigger: 'sale',
            reason_code: 'sale',
            justification: null,
            terminal_label: request.terminal.label,
            sale_amount: request.saleAmount,
            success: hardware.success,
            error_message: hardware.error,
            hardware_method: hardware.method,
        });
    }

    async openManually(request: ManualOpenRequest): Promise<LocalCashDrawerEvent> {
        const justification = request.justification.trim();
        if (!justification) throw new Error(i18n.t('cashDrawerDialog.justificationRequired'));

        const hardware = await this.issueOpenCommand(justification);
        return this.append({
            employee_id: request.operator.id,
            employee_name: request.operator.name,
            employee_number: request.operator.employeeNumber ?? null,
            transaction_id: null,
            transaction_reference: null,
            action: 'open',
            trigger: 'manual',
            reason_code: request.reasonCode,
            justification,
            terminal_label: request.terminal.label,
            sale_amount: null,
            success: hardware.success,
            error_message: hardware.error,
            hardware_method: hardware.method,
        });
    }

    async confirmClosed(
        operator: DrawerOperator,
        terminal: TerminalContext,
        justification?: string
    ): Promise<LocalCashDrawerEvent> {
        return this.append({
            employee_id: operator.id,
            employee_name: operator.name,
            employee_number: operator.employeeNumber ?? null,
            transaction_id: null,
            transaction_reference: null,
            action: 'close',
            trigger: 'manual',
            reason_code: 'cash_count',
            justification: justification?.trim() || 'Operator confirmed the physical drawer was closed.',
            terminal_label: terminal.label,
            sale_amount: null,
            success: true,
            error_message: null,
            hardware_method: 'manual_confirmation',
        });
    }

    async list(limit = 500): Promise<LocalCashDrawerEvent[]> {
        await initializeLocalDatabase();
        return localDb.cashDrawerEvents.orderBy('timestamp').reverse().limit(limit).toArray();
    }

    async getLatestForTerminal(): Promise<LocalCashDrawerEvent | undefined> {
        await initializeLocalDatabase();
        const terminalId = getTerminalId();
        return localDb.cashDrawerEvents
            .where('terminal_id')
            .equals(terminalId)
            .reverse()
            .sortBy('timestamp')
            .then(rows => rows.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0]);
    }
}

export const cashDrawerAuditService = new CashDrawerAuditService();
