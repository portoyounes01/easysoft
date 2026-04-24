import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, Tag, Package, Menu, Hash, AlertCircle } from 'lucide-react';
import { PrinterStation, PrinterRoutingRule } from '../types/printerWorkflow';
import { printerWorkflowService } from '../services/printerWorkflowService';

interface RoutingRuleManagerProps {
  station: PrinterStation;
  onStationUpdate: (station: PrinterStation) => void;
}

const RoutingRuleManager: React.FC<RoutingRuleManagerProps> = ({ station, onStationUpdate }) => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PrinterRoutingRule[]>(station.routingRules || []);
  const [editingRule, setEditingRule] = useState<PrinterRoutingRule | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setRules(station.routingRules || []);
  }, [station.routingRules]);

  const handleSaveRule = () => {
    if (!editingRule) return;

    const updatedRules = editingRule.id.startsWith('new-')
      ? [...rules, { ...editingRule, id: `rule-${Date.now()}` }]
      : rules.map(rule => rule.id === editingRule.id ? editingRule : rule);

    setRules(updatedRules);
    
    const updatedStation = { ...station, routingRules: updatedRules };
    printerWorkflowService.saveStation(updatedStation);
    onStationUpdate(updatedStation);
    
    setShowModal(false);
    setEditingRule(null);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm(t('printerWorkflow.deleteRuleConfirm'))) {
      const updatedRules = rules.filter(rule => rule.id !== ruleId);
      setRules(updatedRules);
      
      const updatedStation = { ...station, routingRules: updatedRules };
      printerWorkflowService.saveStation(updatedStation);
      onStationUpdate(updatedStation);
    }
  };

  const handleCreateRule = () => {
    setEditingRule({
      id: `new-${Date.now()}`,
      type: 'category',
      condition: '',
      isActive: true,
      priority: 10,
      notes: ''
    });
    setShowModal(true);
  };

  const handleEditRule = (rule: PrinterRoutingRule) => {
    setEditingRule({ ...rule });
    setShowModal(true);
  };

  const getRuleIcon = (type: string) => {
    switch (type) {
      case 'product': return <Package className="h-4 w-4" />;
      case 'category': return <Tag className="h-4 w-4" />;
      case 'menu': return <Menu className="h-4 w-4" />;
      case 'tag': return <Hash className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getRuleTypeDescription = (type: string) => {
    switch (type) {
      case 'product': return t('printerWorkflow.descProduct');
      case 'category': return t('printerWorkflow.descCategory');
      case 'menu': return t('printerWorkflow.descMenu');
      case 'tag': return t('printerWorkflow.descTag');
      default: return t('printerWorkflow.unknownRuleType');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">{t('printerWorkflow.routingRulesTitle')}</h4>
        <button
          onClick={handleCreateRule}
          className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="h-3 w-3" />
          {t('printerWorkflow.addRule')}
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('printerWorkflow.noRules')}</p>
          <p className="text-sm">{t('printerWorkflow.noRulesHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules
            .sort((a, b) => b.priority - a.priority)
            .map((rule) => (
              <div
                key={rule.id}
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  rule.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`p-1 rounded ${rule.isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                    {getRuleIcon(rule.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${rule.isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                        {rule.type}: {rule.condition}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {t('printerWorkflow.priorityBadge', { priority: rule.priority })}
                      </span>
                      {!rule.isActive && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                          {t('printerWorkflow.disabled')}
                        </span>
                      )}
                    </div>
                    {rule.notes && (
                      <p className="text-sm text-gray-600 mt-1 truncate">{rule.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditRule(rule)}
                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                    title={t('printerWorkflow.editRuleTooltip')}
                  >
                    <Edit className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title={t('printerWorkflow.deleteRuleTooltip')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Rule Editor Modal */}
      {showModal && editingRule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">
              {editingRule.id.startsWith('new-') ? t('printerWorkflow.createRuleTitle') : t('printerWorkflow.editRuleTitleModal')}
            </h3>

            <div className="space-y-4">
              {/* Rule Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('printerWorkflow.ruleType')}
                </label>
                <select
                  value={editingRule.type}
                  onChange={(e) => setEditingRule({
                    ...editingRule,
                    type: e.target.value as PrinterRoutingRule['type']
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="category">{t('printerWorkflow.optionCategory')}</option>
                  <option value="product">{t('printerWorkflow.optionProduct')}</option>
                  <option value="menu">{t('printerWorkflow.optionMenu')}</option>
                  <option value="tag">{t('printerWorkflow.optionTag')}</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {getRuleTypeDescription(editingRule.type)}
                </p>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('printerWorkflow.condition')}
                </label>
                <input
                  type="text"
                  value={editingRule.condition}
                  onChange={(e) => setEditingRule({
                    ...editingRule,
                    condition: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    editingRule.type === 'category' ? t('printerWorkflow.placeholderCategory') :
                    editingRule.type === 'product' ? t('printerWorkflow.placeholderProduct') :
                    editingRule.type === 'menu' ? t('printerWorkflow.placeholderMenu') :
                    editingRule.type === 'tag' ? t('printerWorkflow.placeholderTag') : t('printerWorkflow.placeholderConditionDefault')
                  }
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('printerWorkflow.priorityRange')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editingRule.priority}
                  onChange={(e) => setEditingRule({
                    ...editingRule,
                    priority: parseInt(e.target.value) || 10
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('printerWorkflow.priorityHint')}
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('printerWorkflow.notesOptional')}
                </label>
                <input
                  type="text"
                  value={editingRule.notes || ''}
                  onChange={(e) => setEditingRule({
                    ...editingRule,
                    notes: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('printerWorkflow.ruleDescriptionPlaceholder')}
                />
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ruleActive"
                  checked={editingRule.isActive}
                  onChange={(e) => setEditingRule({
                    ...editingRule,
                    isActive: e.target.checked
                  })}
                  className="text-blue-600"
                />
                <label htmlFor="ruleActive" className="text-sm font-medium text-gray-700">
                  {t('printerWorkflow.ruleIsActive')}
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingRule(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveRule}
                disabled={!editingRule.condition.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editingRule.id.startsWith('new-') ? t('printerWorkflow.createRuleBtn') : t('printerWorkflow.updateRuleBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutingRuleManager;
