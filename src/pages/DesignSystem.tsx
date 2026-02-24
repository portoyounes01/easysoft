import React, { useState } from 'react';
import ColorPalette from '../components/DesignSystem/ColorPalette';
import Typography from '../components/DesignSystem/Typography';
import Buttons from '../components/DesignSystem/Buttons';
import InputFields from '../components/DesignSystem/InputFields';
import Elevation from '../components/DesignSystem/Elevation';
import Table from '../components/DesignSystem/Table';
import Premade from '../components/DesignSystem/Premade';

type Section = 'text-style' | 'color-style' | 'buttons' | 'icons' | 'input-fields' | 'table' | 'base' | 'premade' | 'illustration' | 'elevation';

const DesignSystem: React.FC = () => {
  const [activeSection, setActiveSection] = useState<Section>('text-style');

  const renderSection = () => {
    switch (activeSection) {
      case 'color-style':
        return <ColorPalette />;
      case 'text-style':
        return <Typography />;
      case 'buttons':
        return <Buttons />;
      case 'input-fields':
        return <InputFields />;
      case 'elevation':
        return <Elevation />;
      case 'table':
        return <Table />;
      case 'premade':
        return <Premade />;
      default:
        return (
          <div className="p-8 text-center text-gray-50">
            <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
            <p>The {activeSection.replace('-', ' ')} section is under construction.</p>
          </div>
        );
    }
  };

  const navItems: { id: Section; label: string }[] = [
    { id: 'text-style', label: 'Text Style' },
    { id: 'color-style', label: 'Color Style' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'icons', label: 'Icons' },
    { id: 'input-fields', label: 'Input Fields' },
    { id: 'table', label: 'Table' },
    { id: 'base', label: 'Base' },
    { id: 'premade', label: 'Premade' },
    { id: 'illustration', label: 'Illustration' },
    { id: 'elevation', label: 'Elevation' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">Design System</h1>
          <p className="text-sm text-gray-50 mt-1">Style Guide & Components</p>
        </div>
        <nav className="px-4 pb-6">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === item.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 capitalize">
                {activeSection.replace('-', ' ')}
              </h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              {renderSection()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignSystem;
