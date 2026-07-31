import React, { useState } from 'react';
import ThermalReceipt, { ReceiptProps } from './ThermalReceipt';

const ReceiptDemo: React.FC<{ initialData?: ReceiptProps }> = ({ initialData }) => {
  // The demo previews FISCAL documents only — the non-fiscal fallback slip is
  // not one of its options, so an incoming TALAO_NAO_FISCAL falls back to FS.
  type DemoDocumentType = 'FATURA' | 'FATURA_SIMPLIFICADA' | 'NOTA_CREDITO';
  const seedDocumentType =
    initialData?.documentType && initialData.documentType !== 'TALAO_NAO_FISCAL'
      ? initialData.documentType
      : 'FATURA_SIMPLIFICADA';
  const [documentType, setDocumentType] = useState<DemoDocumentType>(seedDocumentType);

  // Mock data for invoice
  const mockInvoiceData = {
    documentNumber: 'FS 33A2501/80084',
    documentType: documentType,
    date: new Date('2025-08-02T20:46:00'),
    counter: 'BALCÃO 1',
    verificationCode: 'ATCUDJJS6S7JM-80084',
    company: {
      name: 'Querido Menu Unip. Lda',
      address: 'Rua Luis Adelino Fonseca Lt 4, CC EVORA Plaza',
      postalCode: '7005-345',
      city: 'Évora',
      taxNumber: '514524391',
      phone: '+351 266 123 456',
      email: 'geral@queridmenu.pt'
    },
    customer: {
      taxNumber: '517404419'
    },
    items: [
      {
        id: '1',
        description: 'Sumo Natural Laranja',
        quantity: 1,
        unitPrice: 3.00,
        vatRate: 13,
        total: 2.70
      },
      {
        id: '2',
        description: 'Pastel Nata',
        quantity: 1,
        unitPrice: 1.40,
        vatRate: 13,
        total: 1.26
      }
    ],
    totals: {
      subtotal: 3.94,
      discount: 0.44,
      discountPercentage: 10,
      net: 3.50,
      vat: 0.46,
      total: 3.96
    },
    payment: {
      method: 'Numerário',
      amountGiven: 10.00,
      change: 6.04
    },
    slogan: 'THE WORLD NEEDS NATA',
    softwareInfo: 'Software ZSRest - www.zsrest.com',
    certificationNumber: '196/AT'
  };

  // Mock data for credit note
  const mockCreditNoteData = {
    ...mockInvoiceData,
    documentNumber: 'NC 33A2501/80085',
    documentType: 'NOTA_CREDITO' as const,
    originalInvoice: 'FS 33A2501/80084',
    creditReason: 'Devolução de produtos',
    items: [
      {
        id: '1',
        description: 'Sumo Natural Laranja',
        quantity: 1,
        unitPrice: -3.00,
        vatRate: 13,
        total: -2.70
      }
    ],
    totals: {
      subtotal: -2.70,
      discount: 0,
      discountPercentage: 0,
      net: -2.70,
      vat: -0.35,
      total: -2.70
    },
    payment: {
      method: 'Reembolso',
      amountGiven: 0,
      change: -2.70
    }
  };

  // Mock data for full invoice (multiple products)
  const mockFullInvoiceData = {
    ...mockInvoiceData,
    documentNumber: 'FT 2025/001234',
    documentType: 'FATURA' as const,
    customer: {
      taxNumber: '517404419',
      name: 'João Silva',
      address: 'Rua Exemplo, 10, 1000-001 Lisboa',
    },
    items: [
      {
        id: '1',
        description: 'Sumo Natural Laranja',
        quantity: 2,
        unitPrice: 3.00,
        vatRate: 13,
        total: 5.40
      },
      {
        id: '2',
        description: 'Pastel Nata',
        quantity: 3,
        unitPrice: 1.40,
        vatRate: 13,
        total: 3.78
      },
      {
        id: '3',
        description: 'Café Expresso',
        quantity: 1,
        unitPrice: 0.80,
        vatRate: 13,
        total: 0.72
      },
      {
        id: '4',
        description: 'Sandes Mista',
        quantity: 1,
        unitPrice: 4.50,
        vatRate: 13,
        total: 4.05
      }
    ],
    totals: {
      subtotal: 13.95,
      discount: 1.40,
      discountPercentage: 10,
      net: 12.55,
      vat: 1.45,
      total: 14.00
    },
    payment: {
      method: 'Multibanco',
      amountGiven: 14.00,
      change: 0.00
    }
  };

  const getCurrentData = (): ReceiptProps => {
    if (initialData) return initialData;
    switch (documentType) {
      case 'FATURA':
        return mockFullInvoiceData;
      case 'NOTA_CREDITO':
        return mockCreditNoteData;
      default:
        return mockInvoiceData;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h2>Demo de Recibo Térmico</h2>

        {/* Document Type Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ marginRight: '10px' }}>Tipo de Documento:</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as any)}
            style={{ padding: '5px', fontSize: '14px' }}
          >
            <option value="FATURA_SIMPLIFICADA">Fatura Simplificada</option>
            <option value="FATURA">Fatura</option>
            <option value="NOTA_CREDITO">Nota de Crédito</option>
          </select>
        </div>

        {/* Print Button */}
        <button
          onClick={handlePrint}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '20px'
          }}
        >
          🖨️ Imprimir Recibo
        </button>

        {/* Instructions */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '15px',
          borderRadius: '5px',
          marginBottom: '20px',
          textAlign: 'left',
          maxWidth: '600px',
          margin: '0 auto 20px auto'
        }}>
          <h4>📋 Instruções:</h4>
          <ul style={{ textAlign: 'left' }}>
            <li><strong>Visualização:</strong> O recibo é otimizado para papel térmico de 80mm</li>
            <li><strong>Impressão:</strong> Clique no botão "Imprimir" para enviar para impressora térmica</li>
            <li><strong>Tipos:</strong> Altere entre Fatura Simplificada, Fatura completa e Nota de Crédito</li>
            <li><strong>Dados:</strong> Todos os dados são exemplos (mock data) para demonstração</li>
          </ul>
        </div>
      </div>

      {/* Receipt Component */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        padding: '20px',
        borderRadius: '10px'
      }}>
        <ThermalReceipt {...getCurrentData()} />
      </div>

      {/* Data Preview */}
      <div style={{
        marginTop: '30px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '5px'
      }}>
        <h3>📊 Dados Utilizados ({documentType}):</h3>
        <pre style={{
          fontSize: '12px',
          overflow: 'auto',
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '5px',
          border: '1px solid #ddd'
        }}>
          {JSON.stringify(getCurrentData(), null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ReceiptDemo;
