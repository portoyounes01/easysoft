import React, { useMemo } from 'react';
import {
  DollarSign,
  ShoppingCart,
  Users,
  TrendingUp,
  Package,
  AlertTriangle,
  Calendar,
  Clock
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

const Dashboard: React.FC = () => {
  // 1. Hooks (useState, useEffect, useContext)
  const { t } = useTranslation();
  const { language } = useLanguage();

  // 3. Computed values (useMemo)
  const locale = useMemo(() => (language?.startsWith('pt') ? 'pt-PT' : 'en-US'), [language]);
  const todayStr = useMemo(
    () => new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }),
    [locale]
  );

  const stats = [
    {
      title: t('dashboard.stats.todaySales'),
      value: '€2,847.50',
      change: '+12.5%',
      changeType: 'positive' as const,
      icon: DollarSign,
      bgColor: 'bg-gradient-to-r from-green-500 to-emerald-500'
    },
    {
      title: t('dashboard.stats.transactions'),
      value: '43',
      change: '+8.2%',
      changeType: 'positive' as const,
      icon: ShoppingCart,
      bgColor: 'bg-gradient-to-r from-blue-500 to-cyan-500'
    },
    {
      title: t('dashboard.stats.customers'),
      value: '127',
      change: '+5.4%',
      changeType: 'positive' as const,
      icon: Users,
      bgColor: 'bg-gradient-to-r from-purple-500 to-pink-500'
    },
    {
      title: t('dashboard.stats.averageSale'),
      value: '€66.22',
      change: '-2.1%',
      changeType: 'negative' as const,
      icon: TrendingUp,
      bgColor: 'bg-gradient-to-r from-orange-500 to-red-500'
    }
  ];

  const recentTransactions = [
    { id: 'REC-001', customer: 'Maria Silva', amount: '€45.60', time: '14:32', status: 'completed' },
    { id: 'REC-002', customer: 'João Santos', amount: '€128.90', time: '14:28', status: 'completed' },
    { id: 'REC-003', customer: 'Ana Costa', amount: '€76.20', time: '14:15', status: 'completed' },
    { id: 'REC-004', customer: 'Pedro Lima', amount: '€234.50', time: '14:02', status: 'completed' },
  ];

  const lowStockItems = [
    { name: 'Coffee Beans Premium', current: 5, minimum: 20, category: 'Beverages' },
    { name: 'Organic Milk', current: 8, minimum: 15, category: 'Dairy' },
    { name: 'Chocolate Bars', current: 12, minimum: 25, category: 'Confectionery' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{t('dashboard.title')}</h1>
          <p className="text-gray-600 mt-1">{t('dashboard.welcome')}</p>
        </div>
        <div className="flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-lg">
          <Calendar className="w-5 h-5 text-blue-600" />
          <span className="text-blue-800 font-medium">{todayStr}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className={`text-sm font-semibold px-2 py-1 rounded-full ${stat.changeType === 'positive'
                    ? 'text-green-700 bg-green-100'
                    : 'text-red-700 bg-red-100'
                  }`}>
                  {stat.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.title}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">{t('dashboard.recentTransactions')}</h2>
            <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
              {t('dashboard.viewAll')}
            </button>
          </div>
          <div className="space-y-3">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {transaction.customer.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{transaction.customer}</p>
                    <p className="text-sm text-gray-500">{transaction.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">{transaction.amount}</p>
                  <div className="flex items-center space-x-1 text-sm text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{transaction.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">{t('dashboard.lowStockAlert')}</h2>
            <div className="flex items-center space-x-1 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">{t('dashboard.items', { count: lowStockItems.length })}</span>
            </div>
          </div>
          <div className="space-y-3">
            {lowStockItems.map((item, index) => (
              <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.category}</p>
                  </div>
                  <Package className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t('dashboard.current')} {item.current}</span>
                  <span className="text-sm text-gray-600">{t('dashboard.minimum')} {item.minimum}</span>
                </div>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full"
                    style={{ width: `${(item.current / item.minimum) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-4">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('dashboard.actions.newSale'), icon: ShoppingCart, color: 'bg-green-500' },
            { label: t('dashboard.actions.addProduct'), icon: Package, color: 'bg-blue-500' },
            { label: t('dashboard.actions.viewReports'), icon: TrendingUp, color: 'bg-purple-500' },
            { label: t('dashboard.actions.manageStaff'), icon: Users, color: 'bg-orange-500' }
          ].map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className={`p-3 rounded-lg ${action.color} mb-2`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;