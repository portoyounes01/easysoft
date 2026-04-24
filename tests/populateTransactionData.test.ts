import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { populateTransactionData, clearTransactionData, checkTransactionDataExists } from '../src/utils/populateTransactionData';
import { supabase } from '../src/lib/supabase';

// Mock Supabase
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      limit: vi.fn(),
    })),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// Mock hash utils
vi.mock('../src/utils/hashUtils', () => ({
  hashPassword: vi.fn((password: string) => Promise.resolve(`hashed_${password}`)),
}));

const mockSupabase = vi.mocked(supabase);

describe('populateTransactionData utility functions', () => {
  let mockFrom: ReturnType<typeof vi.fn>;
  let mockRpc: ReturnType<typeof vi.fn>;
  let mockUpsert: ReturnType<typeof vi.fn>;
  let mockDelete: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockEq: ReturnType<typeof vi.fn>;
  let mockNeq: ReturnType<typeof vi.fn>;
  let mockLimit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock chain
    mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockDelete = vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) });
    mockSelect = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockEq = vi.fn().mockResolvedValue({ error: null });
    mockNeq = vi.fn().mockResolvedValue({ error: null });
    mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    mockRpc = vi.fn().mockResolvedValue({ error: null });
    
    mockFrom = vi.fn().mockReturnValue({
      upsert: mockUpsert,
      delete: mockDelete,
      select: mockSelect,
      update: mockUpdate,
      eq: mockEq,
      neq: mockNeq,
      limit: mockLimit,
    });
    
    mockSupabase.from = mockFrom;
    mockSupabase.rpc = mockRpc;
  });

  describe('populateTransactionData', () => {
    it('successfully populates all data tables', async () => {
      const result = await populateTransactionData();
      
      expect(result).toEqual({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: expect.any(Number), // Variable number of transaction items
      });
      
      // Verify all tables were called
      expect(mockFrom).toHaveBeenCalledWith('employees');
      expect(mockFrom).toHaveBeenCalledWith('categories');
      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockFrom).toHaveBeenCalledWith('customers');
      expect(mockFrom).toHaveBeenCalledWith('transactions');
      expect(mockFrom).toHaveBeenCalledWith('transaction_items');
      
      // Verify upsert was called for each table
      expect(mockUpsert).toHaveBeenCalledTimes(6);
    });

    it('handles employee insertion error', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'Employee insertion failed' } });
      
      await expect(populateTransactionData()).rejects.toThrow();
      
      expect(mockFrom).toHaveBeenCalledWith('employees');
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('handles categories insertion error', async () => {
      mockUpsert
        .mockResolvedValueOnce({ error: null }) // employees succeed
        .mockResolvedValueOnce({ error: { message: 'Categories insertion failed' } }); // categories fail
      
      await expect(populateTransactionData()).rejects.toThrow();
      
      expect(mockFrom).toHaveBeenCalledWith('employees');
      expect(mockFrom).toHaveBeenCalledWith('categories');
      expect(mockUpsert).toHaveBeenCalledTimes(2);
    });

    it('handles products insertion error', async () => {
      mockUpsert
        .mockResolvedValueOnce({ error: null }) // employees succeed
        .mockResolvedValueOnce({ error: null }) // categories succeed
        .mockResolvedValueOnce({ error: { message: 'Products insertion failed' } }); // products fail
      
      await expect(populateTransactionData()).rejects.toThrow();
      
      expect(mockUpsert).toHaveBeenCalledTimes(3);
    });

    it('handles customers insertion error', async () => {
      mockUpsert
        .mockResolvedValueOnce({ error: null }) // employees succeed
        .mockResolvedValueOnce({ error: null }) // categories succeed
        .mockResolvedValueOnce({ error: null }) // products succeed
        .mockResolvedValueOnce({ error: { message: 'Customers insertion failed' } }); // customers fail
      
      await expect(populateTransactionData()).rejects.toThrow();
      
      expect(mockUpsert).toHaveBeenCalledTimes(4);
    });

    it('handles transactions insertion error', async () => {
      mockUpsert
        .mockResolvedValueOnce({ error: null }) // employees succeed
        .mockResolvedValueOnce({ error: null }) // categories succeed
        .mockResolvedValueOnce({ error: null }) // products succeed
        .mockResolvedValueOnce({ error: null }) // customers succeed
        .mockResolvedValueOnce({ error: { message: 'Transactions insertion failed' } }); // transactions fail
      
      await expect(populateTransactionData()).rejects.toThrow();
      
      expect(mockUpsert).toHaveBeenCalledTimes(5);
    });

    it('handles transaction items insertion error', async () => {
      mockUpsert
        .mockResolvedValueOnce({ error: null }) // employees succeed
        .mockResolvedValueOnce({ error: null }) // categories succeed
        .mockResolvedValueOnce({ error: null }) // products succeed
        .mockResolvedValueOnce({ error: null }) // customers succeed
        .mockResolvedValueOnce({ error: null }) // transactions succeed
        .mockResolvedValueOnce({ error: { message: 'Transaction items insertion failed' } }); // transaction items fail
      
      await expect(populateTransactionData()).rejects.toThrow();
      
      expect(mockUpsert).toHaveBeenCalledTimes(6);
    });
  });

  describe('clearTransactionData', () => {
    it('calls clear_all_transaction_data RPC when available', async () => {
      mockRpc.mockResolvedValue({ error: null });

      const result = await clearTransactionData();

      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledWith('clear_all_transaction_data');
    });

    it('falls back to table deletes when RPC returns an error', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'function not found' } });
      const gte = vi.fn().mockResolvedValue({ error: null });
      mockDelete.mockReturnValue({ gte });

      const result = await clearTransactionData();

      expect(result).toEqual({ success: true });
      expect(mockRpc).toHaveBeenCalledWith('clear_all_transaction_data');
      expect(mockFrom).toHaveBeenCalledWith('daily_sales_summary');
      expect(mockFrom).toHaveBeenCalledWith('transaction_items');
    });
  });

  describe('checkTransactionDataExists', () => {
    it('returns true when transaction data exists', async () => {
      mockSelect.mockReturnValueOnce({
        limit: vi.fn().mockResolvedValue({
          data: [{ id: 'some-transaction-id' }],
          error: null
        })
      });
      
      const result = await checkTransactionDataExists();
      
      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('transactions');
      expect(mockSelect).toHaveBeenCalledWith('id');
    });

    it('returns false when no transaction data exists', async () => {
      mockSelect.mockReturnValueOnce({
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null
        })
      });
      
      const result = await checkTransactionDataExists();
      
      expect(result).toBe(false);
    });

    it('returns false when there is a database error', async () => {
      mockSelect.mockReturnValueOnce({
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        })
      });
      
      const result = await checkTransactionDataExists();
      
      expect(result).toBe(false);
    });

    it('handles exceptions gracefully', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection failed');
      });
      
      const result = await checkTransactionDataExists();
      
      expect(result).toBe(false);
    });
  });

  describe('Data integrity', () => {
    it('creates employees with proper password hashes', async () => {
      await populateTransactionData();
      
      // Check that employees were created with hashed passwords
      const employeesCall = mockUpsert.mock.calls[0][0]; // First upsert call should be employees
      expect(employeesCall).toHaveLength(3); // 3 employees
      
      // Check admin employee
      const adminEmployee = employeesCall.find((emp: any) => emp.role === 'admin');
      expect(adminEmployee).toBeDefined();
      expect(adminEmployee.password_hash).toBe('hashed_admin123');
      expect(adminEmployee.name).toBe('Carlos Ferreira');
      expect(adminEmployee.access_levels).toEqual(['all']);
      
      // Check manager employee
      const managerEmployee = employeesCall.find((emp: any) => emp.role === 'manager');
      expect(managerEmployee).toBeDefined();
      expect(managerEmployee.password_hash).toBe('hashed_manager123');
      expect(managerEmployee.pin).toBe('hashed_1234');
      expect(managerEmployee.name).toBe('João Santos');
      
      // Check cashier employee
      const cashierEmployee = employeesCall.find((emp: any) => emp.role === 'cashier');
      expect(cashierEmployee).toBeDefined();
      expect(cashierEmployee.password_hash).toBeNull();
      expect(cashierEmployee.pin).toBe('hashed_1234');
      expect(cashierEmployee.name).toBe('Maria Oliveira');
    });

    it('creates categories with proper structure', async () => {
      await populateTransactionData();
      
      const categoriesCall = mockUpsert.mock.calls[1][0]; // Second upsert call should be categories
      expect(categoriesCall).toHaveLength(4); // 4 categories
      
      const beverageCategory = categoriesCall.find((cat: any) => cat.name === 'Beverages');
      expect(beverageCategory).toBeDefined();
      expect(beverageCategory.description).toBe('Coffee, tea, sodas, and other drinks');
      expect(beverageCategory.color).toBe('from-amber-500 to-orange-600');
      expect(beverageCategory.icon).toBe('coffee');
      expect(beverageCategory.is_active).toBe(true);
    });

    it('creates products with proper pricing and stock', async () => {
      await populateTransactionData();
      
      const productsCall = mockUpsert.mock.calls[2][0]; // Third upsert call should be products
      expect(productsCall).toHaveLength(6); // 6 products
      
      const coffeeProduct = productsCall.find((prod: any) => prod.name === 'Premium Coffee Beans');
      expect(coffeeProduct).toBeDefined();
      expect(coffeeProduct.price).toBe(12.50);
      expect(coffeeProduct.cost).toBe(8.00);
      expect(coffeeProduct.iva_rate).toBe(0.23);
      expect(coffeeProduct.stock).toBe(45);
      expect(coffeeProduct.min_stock).toBe(10);
      expect(coffeeProduct.track_stock).toBe(true);
    });

    it('creates transactions with proper financial calculations', async () => {
      await populateTransactionData();
      
      const transactionsCall = mockUpsert.mock.calls[4][0]; // Fifth upsert call should be transactions
      expect(transactionsCall).toHaveLength(12); // 12 transactions
      
      // Check a specific transaction
      const transaction = transactionsCall[0];
      expect(transaction.subtotal).toBeGreaterThan(0);
      expect(transaction.tax).toBeGreaterThan(0);
      expect(transaction.total).toBeGreaterThan(transaction.subtotal);
      expect(transaction.status).toBe('completed');
      expect(transaction.employee_id).toBeDefined();
      expect(transaction.transaction_number).toMatch(/^TXN\d+$/);
    });
  });
});