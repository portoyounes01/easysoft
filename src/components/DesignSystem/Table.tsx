import React from 'react';
import { MoreVertical, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

const Table: React.FC = () => {
    return (
        <div className="space-y-16">
            {/* Tab Head Single */}
            <section>
                <div className="w-32 bg-neutral-50 border-r border-neutral-200 p-4 text-sm font-semibold text-neutral-600">
                    Tab Head
                </div>
            </section>

            {/* Complex Row Example */}
            <section>
                <div className="border border-dashed border-purple-300 rounded-lg p-4 flex items-center gap-12">
                    <div className="text-sm font-medium text-neutral-900">Text</div>
                    <div className="space-y-1">
                        <div className="text-sm font-medium text-neutral-900">Text</div>
                        <div className="text-xs text-neutral-500">Tab</div>
                    </div>
                    <div>
                        <span className="px-3 py-1 bg-neutral-100 rounded-full text-xs font-medium text-neutral-600">Chip</span>
                    </div>
                    <div>
                        <MoreVertical className="w-5 h-5 text-neutral-400" />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-xl">🍔</div>
                        <div>
                            <div className="text-sm font-medium text-neutral-900">Text</div>
                            <div className="text-xs text-neutral-500">Tab</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tab Head Row */}
            <section>
                <div className="flex bg-neutral-50 border-y border-neutral-200 overflow-hidden">
                    {Array(10).fill('Tab Head').map((text, i) => (
                        <div key={i} className={`flex-1 p-4 text-sm font-semibold text-neutral-600 ${i !== 9 ? 'border-r border-neutral-200' : ''} text-center`}>
                            {text}
                        </div>
                    ))}
                </div>
            </section>

            {/* Table Example (Header + Body Row) */}
            <section>
                <div className="border border-dashed border-purple-300 rounded-lg p-4 space-y-4">
                    {/* Header */}
                    <div className="flex border-b border-neutral-200 pb-4">
                        {Array(10).fill('Text').map((text, i) => (
                            <div key={i} className="flex-1 text-sm font-semibold text-neutral-900 text-center">
                                {text}
                            </div>
                        ))}
                    </div>
                    {/* Row */}
                    <div className="flex bg-valid-50 py-4 rounded-lg">
                        {Array(10).fill('Text').map((text, i) => (
                            <div key={i} className="flex-1 text-sm font-medium text-neutral-900 text-center">
                                {text}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Full Table */}
            <section>
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="flex bg-neutral-50 border-b border-neutral-200">
                        {Array(10).fill('Tab Head').map((text, i) => (
                            <div key={i} className={`flex-1 p-4 text-sm font-semibold text-neutral-600 ${i !== 9 ? 'border-r border-neutral-200' : ''} text-center`}>
                                {text}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-neutral-200">
                        {Array(5).fill(null).map((_, rowIndex) => (
                            <div key={rowIndex} className="flex hover:bg-neutral-50 transition-colors">
                                {Array(10).fill('Text').map((text, colIndex) => (
                                    <div key={colIndex} className="flex-1 p-4 text-sm text-neutral-900 text-center">
                                        {text}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    <div className="p-4 border-t border-neutral-200 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-neutral-600">
                            <span>Rows per page</span>
                            <button className="flex items-center gap-1 font-medium text-neutral-900">
                                10 <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button className="p-1 text-neutral-400 hover:text-neutral-600">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-1">
                                <button className="w-8 h-8 rounded bg-valid-500 text-white text-sm font-medium flex items-center justify-center">1</button>
                                <button className="w-8 h-8 rounded hover:bg-neutral-100 text-neutral-600 text-sm font-medium flex items-center justify-center">2</button>
                                <button className="w-8 h-8 rounded hover:bg-neutral-100 text-neutral-600 text-sm font-medium flex items-center justify-center">3</button>
                                <button className="w-8 h-8 rounded hover:bg-neutral-100 text-neutral-600 text-sm font-medium flex items-center justify-center">4</button>
                                <button className="w-8 h-8 rounded hover:bg-neutral-100 text-neutral-600 text-sm font-medium flex items-center justify-center">5</button>
                            </div>
                            <button className="p-1 text-neutral-600 hover:text-neutral-900">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Table;
