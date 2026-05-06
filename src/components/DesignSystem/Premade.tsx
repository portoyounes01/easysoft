import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, AlertCircle, X, Info, Search, Menu, Plus, Coffee, Grid } from 'lucide-react';
import { CategoryFilterButton } from '../ui/CategoryFilterButton';
import { ProductCard } from '../ui/ProductCard';

const Premade: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="space-y-16">
            {/* Card Product */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Card Product</h3>
                <div className="flex gap-6">
                    {/* Card 1 */}
                    <div className="w-64 border border-neutral-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow bg-white">
                        <div className="aspect-square bg-neutral-100 rounded-lg mb-4 flex items-center justify-center">
                            <span className="text-4xl">🍔</span>
                        </div>
                        <h4 className="font-semibold text-neutral-900 mb-1">Cheeseburger Deluxe</h4>
                        <p className="text-sm text-neutral-500">$14.00</p>
                    </div>

                    {/* Card 2 (Selected/Active) */}
                    <div className="w-64 border-2 border-valid-500 rounded-xl p-4 shadow-sm bg-white relative">
                        <div className="aspect-square bg-neutral-100 rounded-lg mb-4 flex items-center justify-center">
                            <span className="text-4xl">🍔</span>
                        </div>
                        <h4 className="font-semibold text-neutral-900 mb-1">Cheeseburger Deluxe</h4>
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-neutral-500">$14.00 x</p>
                            <span className="bg-valid-500 text-neutral-50 text-xs font-bold px-2 py-0.5 rounded-full">2</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* POS Components */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">POS Components</h3>
                <div className="space-y-8">
                    {/* Category Filter Buttons */}
                    <div>
                        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Category Filter Buttons</h4>
                        <div className="flex gap-4">
                            <div className="w-20">
                                <CategoryFilterButton
                                    label="All Menu"
                                    icon={Grid}
                                    isSelected={true}
                                    onClick={() => { }}
                                />
                            </div>
                            <div className="w-20">
                                <CategoryFilterButton
                                    label="Coffee"
                                    icon={Coffee}
                                    isSelected={false}
                                    onClick={() => { }}
                                />
                            </div>
                            <div className="w-20">
                                <CategoryFilterButton
                                    label="Beverages"
                                    icon={Coffee}
                                    isSelected={false}
                                    onClick={() => { }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Product Cards */}
                    <div>
                        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Product Cards</h4>
                        <div className="grid grid-cols-3 gap-4 max-w-2xl">
                            <ProductCard
                                name="Espresso"
                                price={2.50}
                                stock={100}
                                remainingStock={100}
                                canAdd={true}
                                onClick={() => { }}
                            />
                            <ProductCard
                                name="Cappuccino"
                                price={3.50}
                                stock={50}
                                cartQuantity={2}
                                remainingStock={48}
                                canAdd={true}
                                onClick={() => { }}
                            />
                            <ProductCard
                                name="Latte"
                                price={4.00}
                                stock={0}
                                isOutOfStock={true}
                                canAdd={false}
                                outOfStockLabel="Out of Stock"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Sign Icon */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Sign Icon</h3>
                <div className="flex gap-6">
                    <div className="w-16 h-16 rounded-full bg-valid-500 flex items-center justify-center border-4 border-valid-100">
                        <Check className="w-8 h-8 text-neutral-50" />
                    </div>
                    <div className="w-16 h-16 rounded-full bg-warning-500 flex items-center justify-center border-4 border-warning-100">
                        <span className="text-neutral-50 text-3xl font-bold">!</span>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-error-500 flex items-center justify-center border-4 border-error-100">
                        <X className="w-8 h-8 text-neutral-50" />
                    </div>
                    <div className="w-16 h-16 rounded-full bg-info-500 flex items-center justify-center border-4 border-info-100">
                        <span className="text-neutral-50 text-3xl font-bold font-serif italic">i</span>
                    </div>
                </div>
            </section>

            {/* Toast & Alert Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {/* Toast */}
                <section>
                    <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Toast</h3>
                    <div className="space-y-4">
                        {/* Success Toast */}
                        <div className="bg-white rounded-lg shadow-md p-4 flex items-start gap-3 relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-valid-500"></div>
                            <div className="bg-valid-100 p-1 rounded-full">
                                <Check className="w-4 h-4 text-valid-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Toast</h4>
                                <p className="text-xs text-neutral-500">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Warning Toast */}
                        <div className="bg-white rounded-lg shadow-md p-4 flex items-start gap-3 relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-warning-500"></div>
                            <div className="bg-warning-100 p-1 rounded-full">
                                <AlertCircle className="w-4 h-4 text-warning-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Toast</h4>
                                <p className="text-xs text-neutral-500">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Info Toast */}
                        <div className="bg-white rounded-lg shadow-md p-4 flex items-start gap-3 relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-info-500"></div>
                            <div className="bg-info-100 p-1 rounded-full">
                                <Info className="w-4 h-4 text-info-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Toast</h4>
                                <p className="text-xs text-neutral-500">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Error Toast */}
                        <div className="bg-white rounded-lg shadow-md p-4 flex items-start gap-3 relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-error-500"></div>
                            <div className="bg-error-100 p-1 rounded-full">
                                <X className="w-4 h-4 text-error-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Toast</h4>
                                <p className="text-xs text-neutral-500">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>
                    </div>
                </section>

                {/* Alert */}
                <section>
                    <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Alert</h3>
                    <div className="space-y-4">
                        {/* Info Alert */}
                        <div className="bg-info-50 rounded-lg p-4 flex items-start gap-3">
                            <Info className="w-5 h-5 text-info-600 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Alert</h4>
                                <p className="text-xs text-neutral-600">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Error Alert */}
                        <div className="bg-error-50 rounded-lg p-4 flex items-start gap-3">
                            <div className="bg-error-600 rounded-full p-0.5 mt-0.5">
                                <X className="w-3 h-3 text-neutral-50" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Alert</h4>
                                <p className="text-xs text-neutral-600">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Warning Alert */}
                        <div className="bg-warning-50 rounded-lg p-4 flex items-start gap-3">
                            <div className="bg-warning-500 rounded-full w-4 h-4 flex items-center justify-center mt-0.5">
                                <span className="text-neutral-50 text-xs font-bold">!</span>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Alert</h4>
                                <p className="text-xs text-neutral-600">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Success Alert */}
                        <div className="bg-valid-100 rounded-lg p-4 flex items-start gap-3">
                            <div className="bg-valid-500 rounded-full p-0.5 mt-0.5">
                                <Check className="w-3 h-3 text-neutral-50" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Alert</h4>
                                <p className="text-xs text-neutral-600">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Neutral Alert */}
                        <div className="bg-neutral-200 rounded-lg p-4 flex items-start gap-3">
                            <div className="bg-neutral-600 rounded-full w-4 h-4 flex items-center justify-center mt-0.5">
                                <span className="text-neutral-50 text-xs font-bold font-serif italic">i</span>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-neutral-900">Alert</h4>
                                <p className="text-xs text-neutral-600">Indicate the action</p>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
                        </div>
                    </div>
                </section>
            </div>

            {/* Navbar */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Navbar</h3>
                <div className="bg-neutral-50 p-4 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button className="text-neutral-500"><Menu className="w-5 h-5" /></button>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-valid-500 transform rotate-45 rounded-sm"></div>
                            <span className="font-bold text-neutral-900">ClaPos</span>
                        </div>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Search Product..."
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-primary-500"
                        />
                    </div>
                </div>
            </section>

            {/* Page Header */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Page Header</h3>
                <div className="space-y-8">
                    {/* Variant 1 */}
                    <div className="flex items-end justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-neutral-900">Page Header</h1>
                            <p className="text-xs text-neutral-500">Subtitle</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="relative w-48">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                <input
                                    type="text"
                                    placeholder={t('designSystemPage.demo.searchGeneric')}
                                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-primary-500"
                                />
                            </div>
                            <button className="px-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 flex items-center gap-2 hover:bg-neutral-50">
                                <Plus className="w-4 h-4" /> Button <Plus className="w-4 h-4" />
                            </button>
                            <button className="px-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 flex items-center gap-2 hover:bg-neutral-50">
                                <Plus className="w-4 h-4" /> Button <Plus className="w-4 h-4" />
                            </button>
                            <button className="px-4 py-2 bg-valid-500 text-neutral-50 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-valid-600">
                                <Plus className="w-4 h-4" /> Button <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Variant 2 */}
                    <div className="bg-neutral-50 p-6 rounded-lg flex items-center justify-between">
                        <h1 className="text-xl font-semibold text-neutral-900">Page Header</h1>
                        <div className="flex items-center gap-4">
                            <button className="px-6 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                                Button
                            </button>
                            <button className="px-6 py-2 bg-valid-500 text-neutral-50 rounded-lg text-sm font-medium hover:bg-valid-600">
                                Button 1
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Premade;
