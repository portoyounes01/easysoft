import type {
    LocalTransaction,
    LocalTransactionItem,
    TransactionInsert,
    TransactionItemInsert,
} from '../types/supabase';

export function localTransactionToServerInsert(
    row: LocalTransaction,
    serverEmployeeId: string
): TransactionInsert {
    return {
        id: row.id,
        transaction_number: row.transaction_number,
        employee_id: serverEmployeeId,
        employee_name: row.employee_name,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        transaction_date: row.transaction_date,
        transaction_time: row.transaction_time,
        subtotal: row.subtotal,
        discount: row.discount,
        discount_type: row.discount_type,
        discount_percentage: row.discount_percentage,
        tax: row.tax,
        total: row.total,
        payment_method: row.payment_method,
        amount_paid: row.amount_paid,
        change_given: row.change_given,
        status: row.status,
        notes: row.notes,
        receipt_number: row.receipt_number,
        fiscal_document_id: row.fiscal_document_id ?? null,
        fiscal_metadata_json: row.fiscal_metadata_json ?? null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        last_synced_at: row.last_synced_at?.toISOString() ?? null,
        deleted_at: row.deleted_at?.toISOString() ?? null,
    };
}

export function localTransactionItemsToServerInsert(
    items: LocalTransactionItem[]
): TransactionItemInsert[] {
    return items.map(i => ({
        id: i.id,
        transaction_id: i.transaction_id,
        product_id: i.product_id,
        product_name: i.product_name,
        product_sku: i.product_sku,
        category_id: i.category_id,
        category_name: i.category_name,
        quantity: i.quantity,
        unit: i.unit ?? 'un',
        unit_price: i.unit_price,
        unit_cost: i.unit_cost,
        iva_rate: i.iva_rate,
        line_total: i.line_total,
        tax_amount: i.tax_amount,
        profit_amount: i.profit_amount,
        discount_amount: i.discount_amount,
        discount_percentage: i.discount_percentage,
        created_at: i.created_at.toISOString(),
        updated_at: i.updated_at.toISOString(),
        last_synced_at: i.last_synced_at?.toISOString() ?? null,
        deleted_at: i.deleted_at?.toISOString() ?? null,
    }));
}
