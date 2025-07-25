import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataSetup from '../src/components/DataSetup';
import { populateTransactionData, clearTransactionData, checkTransactionDataExists } from '../src/utils/populateTransactionData';
import React from 'react';

// Mock the utility functions
vi.mock('../src/utils/populateTransactionData', () => ({
  populateTransactionData: vi.fn(),
  clearTransactionData: vi.fn(),
  checkTransactionDataExists: vi.fn(),
}));

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  Database: () => <div data-testid="database-icon">Database</div>,
  RefreshCw: () => <div data-testid="refresh-icon">RefreshCw</div>,
  CheckCircle: () => <div data-testid="check-icon">CheckCircle</div>,
  AlertCircle: () => <div data-testid="alert-icon">AlertCircle</div>,
  Loader2: () => <div data-testid="loader-icon">Loader2</div>,
}));

const mockPopulateTransactionData = vi.mocked(populateTransactionData);
const mockClearTransactionData = vi.mocked(clearTransactionData);
const mockCheckTransactionDataExists = vi.mocked(checkTransactionDataExists);

describe('DataSetup Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly with both buttons', () => {
    render(<DataSetup />);
    
    expect(screen.getByText('Database Setup')).toBeInTheDocument();
    expect(screen.getByText('Set up your POS system with sample data for testing and reports')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /populate all data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all data/i })).toBeInTheDocument();
  });

  it('shows what will be populated in the info section', () => {
    render(<DataSetup />);
    
    expect(screen.getByText('What this will populate:')).toBeInTheDocument();
    expect(screen.getByText(/Sample categories \(Beverages, Dairy, Bakery, Confectionery\)/)).toBeInTheDocument();
    expect(screen.getByText(/Sample products with realistic pricing and stock levels/)).toBeInTheDocument();
    expect(screen.getByText(/Sample employees \(Carlos, João, Maria\)/)).toBeInTheDocument();
    expect(screen.getByText(/Sample customers for transaction history/)).toBeInTheDocument();
    expect(screen.getByText(/Transaction history with sales data \(past 30 days\)/)).toBeInTheDocument();
  });

  describe('Populate All Data functionality', () => {
    it('successfully populates data when no existing data', async () => {
      // Mock the sequence: first call returns false (no data), second call returns true (verification success)
      mockCheckTransactionDataExists
        .mockResolvedValueOnce(false)  // Initial check - no existing data
        .mockResolvedValueOnce(true);  // Verification check - data exists after population
      
      mockPopulateTransactionData.mockResolvedValue({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      });

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      // Wait for the operation to complete and check results

      // Wait for completion - check for the success messages in results
        await waitFor(() => {
          expect(screen.getByText('All data populated successfully')).toBeInTheDocument();
        });
 
        await waitFor(() => {
          expect(screen.getByText('Data setup verification completed successfully!')).toBeInTheDocument();
        });
 
        // Verify function calls
        expect(mockCheckTransactionDataExists).toHaveBeenCalledTimes(2); // Initial check + verification
        expect(mockPopulateTransactionData).toHaveBeenCalledTimes(1);
        expect(mockClearTransactionData).not.toHaveBeenCalled();
    });

    it('clears existing data before populating when data exists', async () => {
      // Mock existing data on first check, no data on verification
      mockCheckTransactionDataExists
        .mockResolvedValueOnce(true)  // Initial check - data exists
        .mockResolvedValueOnce(true); // Verification check
      
      mockClearTransactionData.mockResolvedValue({ success: true });
      mockPopulateTransactionData.mockResolvedValue({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      });

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(screen.getByText('Transaction data already exists. Clearing first...')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Existing transaction data cleared')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('All data populated successfully')).toBeInTheDocument();
      });

      // Verify function calls
      expect(mockCheckTransactionDataExists).toHaveBeenCalledTimes(2);
      expect(mockClearTransactionData).toHaveBeenCalledTimes(1);
      expect(mockPopulateTransactionData).toHaveBeenCalledTimes(1);
    });

    it('handles populate errors gracefully', async () => {
      mockCheckTransactionDataExists.mockResolvedValue(false);
      mockPopulateTransactionData.mockRejectedValue(new Error('Database connection failed'));

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(screen.getByText('Error during setup: Database connection failed')).toBeInTheDocument();
      });

      // Button should be enabled again after error
      expect(populateButton).not.toBeDisabled();
    });

    it('handles verification failure', async () => {
      mockCheckTransactionDataExists
        .mockResolvedValueOnce(false)  // Initial check
        .mockResolvedValueOnce(false); // Verification fails
      
      mockPopulateTransactionData.mockResolvedValue({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      });

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(screen.getByText('All data populated successfully')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Data setup verification failed')).toBeInTheDocument();
      });
    });
  });

  describe('Clear All Data functionality', () => {
    it('successfully clears all data', async () => {
      mockClearTransactionData.mockResolvedValue({ success: true });

      render(<DataSetup />);
      
      const clearButton = screen.getByRole('button', { name: /clear all data/i });
      fireEvent.click(clearButton);

      // Check loading state
      expect(clearButton).toBeDisabled();
      
      await waitFor(() => {
        expect(screen.getByText('Clearing all transaction data...')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('All transaction data cleared successfully')).toBeInTheDocument();
      });

      // Verify function calls
      expect(mockClearTransactionData).toHaveBeenCalledTimes(1);
      expect(mockPopulateTransactionData).not.toHaveBeenCalled();
      expect(clearButton).not.toBeDisabled();
    });

    it('handles clear errors gracefully', async () => {
      mockClearTransactionData.mockRejectedValue(new Error('Permission denied'));

      render(<DataSetup />);
      
      const clearButton = screen.getByRole('button', { name: /clear all data/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Error clearing data: Permission denied')).toBeInTheDocument();
      });

      // Button should be enabled again after error
      expect(clearButton).not.toBeDisabled();
    });
  });

  describe('UI States', () => {
    it('disables both buttons during populate operation', async () => {
      mockCheckTransactionDataExists.mockResolvedValue(false);
      // Make populate hang to test loading state
      mockPopulateTransactionData.mockImplementation(() => new Promise(() => {}));

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      const clearButton = screen.getByRole('button', { name: /clear all data/i });
      
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(populateButton).toBeDisabled();
        expect(clearButton).toBeDisabled();
      });
    });

    it('disables both buttons during clear operation', async () => {
      // Make clear hang to test loading state
      mockClearTransactionData.mockImplementation(() => new Promise(() => {}));

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      const clearButton = screen.getByRole('button', { name: /clear all data/i });
      
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(populateButton).toBeDisabled();
        expect(clearButton).toBeDisabled();
      });
    });

    it('calls populateTransactionData when populate button is clicked', async () => {
      // Mock the sequence: first call returns false (no data), second call returns true (verification success)
      mockCheckTransactionDataExists
        .mockResolvedValueOnce(false)  // Initial check - no existing data
        .mockResolvedValueOnce(true);  // Verification check - data exists after population
      
      mockPopulateTransactionData.mockResolvedValue({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      });
      
      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);
      
      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('All data populated successfully')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Data setup verification completed successfully!')).toBeInTheDocument();
      });

      // Verify function calls
      expect(mockCheckTransactionDataExists).toHaveBeenCalledTimes(2); // Initial check + verification
      expect(mockPopulateTransactionData).toHaveBeenCalledTimes(1);
      expect(mockClearTransactionData).not.toHaveBeenCalled();
    });
 


    it('displays results with proper styling for success and error', async () => {
      mockCheckTransactionDataExists.mockResolvedValue(false);
      mockPopulateTransactionData.mockResolvedValue({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      });

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(screen.getByText('Setup Results')).toBeInTheDocument();
      });

      await waitFor(() => {
        const successResults = screen.getAllByTestId('check-icon');
        expect(successResults.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Results Display', () => {
    it('shows detailed results with JSON data when available', async () => {
      // Mock the sequence: first call returns false (no data), second call returns true (verification success)
      mockCheckTransactionDataExists
        .mockResolvedValueOnce(false)  // Initial check - no existing data
        .mockResolvedValueOnce(true);  // Verification check - data exists after population
      
      const mockResult = {
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      };
      mockPopulateTransactionData.mockResolvedValue(mockResult);

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(screen.getByText('All data populated successfully')).toBeInTheDocument();
      });

      // Check if JSON details are displayed
      await waitFor(() => {
        expect(screen.getByText(/"success": true/)).toBeInTheDocument();
        expect(screen.getByText(/"employeesCount": 3/)).toBeInTheDocument();
        expect(screen.getByText(/"categoriesCount": 4/)).toBeInTheDocument();
      });
    });

    it('clears results when starting a new operation', async () => {
      // First populate to create results
      // Mock the sequence: first call returns false (no data), second call returns true (verification success)
      mockCheckTransactionDataExists
        .mockResolvedValueOnce(false)  // Initial check - no existing data
        .mockResolvedValueOnce(true);  // Verification check - data exists after population
      
      mockPopulateTransactionData.mockResolvedValue({
        success: true,
        employeesCount: 3,
        categoriesCount: 4,
        productsCount: 6,
        customersCount: 5,
        transactionsCount: 12,
        itemsCount: 25
      });

      render(<DataSetup />);
      
      const populateButton = screen.getByRole('button', { name: /populate all data/i });
      fireEvent.click(populateButton);

      await waitFor(() => {
        expect(screen.getByText('All data populated successfully')).toBeInTheDocument();
      });

      // Now clear data
      mockClearTransactionData.mockResolvedValue({ success: true });
      const clearButton = screen.getByRole('button', { name: /clear all data/i });
      fireEvent.click(clearButton);

      // Previous results should be cleared
      await waitFor(() => {
        expect(screen.queryByText('All data populated successfully')).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('All transaction data cleared successfully')).toBeInTheDocument();
      });
    });
  });
});