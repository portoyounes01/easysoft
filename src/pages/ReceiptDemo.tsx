import React from 'react';
import ReceiptDemo from '../components/ReceiptDemo';
import { useLocation } from 'react-router-dom';
import type { ReceiptProps } from '../components/ThermalReceipt';

const ReceiptDemoPage: React.FC = () => {
  const location = useLocation();
  const state = location.state as { receiptData?: ReceiptProps } | null;
  return (
    <div>
      {/* If receiptData present (navigated from POS), pass it down via props; ReceiptDemo already shows mock data when none provided */}
      <ReceiptDemo {...(state?.receiptData ? { initialData: state.receiptData } : {})} />
    </div>
  );
};

export default ReceiptDemoPage;
