import React from 'react';
import { MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminActionButton } from '../ui/AdminActionButton';
import { TableActionButton } from '../ui/TableActionButton';
import { NumpadButton } from '../ui/NumpadButton';

const pageNumClass =
    '!min-h-8 !min-w-8 !w-8 !text-sm !rounded-md !font-medium shrink-0';

const Table2: React.FC = () => {
    return (
        <div className="space-y-16">
            <section>
                <div className="w-32 bg-neutral-50 border-r border-neutral-200 p-4 text-sm font-semibold text-neutral-600">
                    Tab Head
                </div>
            </section>

            <section>
                <div className="border border-dashed border-purple-300 rounded-lg p-4 flex items-center gap-12">
                    <div className="text-sm font-medium text-neutral-900">Text</div>
                    <div className="space-y-1">
                        <div className="text-sm font-medium text-neutral-900">Text</div>
                        <div className="text-xs text-neutral-500">Tab</div>
                    </div>
                    <div>
                        <span className="px-3 py-1 bg-neutral-100 rounded-full text-xs font-medium text-neutral-600">
                            Chip
                        </span>
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

            <section>
                <div className="flex bg-neutral-50 border-y border-neutral-200 overflow-hidden">
                    {Array(10)
                        .fill('Tab Head')
                        .map((text, i) => (
                            <div
                                key={i}
                                className={`flex-1 p-4 text-sm font-semibold text-neutral-600 ${
                                    i !== 9 ? 'border-r border-neutral-200' : ''
                                } text-center`}
                            >
                                {text}
                            </div>
                        ))}
                </div>
            </section>

            <section>
                <div className="border border-dashed border-purple-300 rounded-lg p-4 space-y-4">
                    <div className="flex border-b border-neutral-200 pb-4">
                        {Array(10)
                            .fill('Text')
                            .map((text, i) => (
                                <div key={i} className="flex-1 text-sm font-semibold text-neutral-900 text-center">
                                    {text}
                                </div>
                            ))}
                    </div>
                    <div className="flex bg-valid-50 py-4 rounded-lg">
                        {Array(10)
                            .fill('Text')
                            .map((text, i) => (
                                <div key={i} className="flex-1 text-sm font-medium text-neutral-900 text-center">
                                    {text}
                                </div>
                            ))}
                    </div>
                </div>
            </section>

            <section>
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <div className="flex bg-neutral-50 border-b border-neutral-200">
                        {Array(10)
                            .fill('Tab Head')
                            .map((text, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 p-4 text-sm font-semibold text-neutral-600 ${
                                        i !== 9 ? 'border-r border-neutral-200' : ''
                                    } text-center`}
                                >
                                    {text}
                                </div>
                            ))}
                    </div>

                    <div className="divide-y divide-neutral-200">
                        {Array(5)
                            .fill(null)
                            .map((_, rowIndex) => (
                                <div key={rowIndex} className="flex hover:bg-neutral-50 transition-colors">
                                    {Array(10)
                                        .fill('Text')
                                        .map((text, colIndex) => (
                                            <div key={colIndex} className="flex-1 p-4 text-sm text-neutral-900 text-center">
                                                {text}
                                            </div>
                                        ))}
                                </div>
                            ))}
                    </div>

                    <div className="p-4 border-t border-neutral-200 flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-2 text-sm text-neutral-600">
                            <span>Rows per page</span>
                            <AdminActionButton variant="outline" label="10" showChevron />
                        </div>

                        <div className="flex items-center gap-1">
                            <TableActionButton variant="icon" icon={ChevronLeft} aria-label="Previous page" />
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <NumpadButton
                                        key={n}
                                        label={n}
                                        variant={n === 1 ? 'confirm' : 'default'}
                                        type="button"
                                        className={pageNumClass}
                                    />
                                ))}
                            </div>
                            <TableActionButton variant="icon" icon={ChevronRight} aria-label="Next page" />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Table2;
