import React from 'react';

const ColorPalette: React.FC = () => {
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const limitedShades = [100, 200, 300, 400, 500];

    const renderColorRow = (name: string, prefix: string, shadeList: number[]) => (
        <div className="mb-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-6 capitalize">{name}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {shadeList.map((shade) => (
                    <div key={shade} className="space-y-2">
                        <div
                            className={`h-24 rounded-lg shadow-sm bg-${prefix}-${shade}`}
                            title={`bg-${prefix}-${shade}`}
                        ></div>
                        <div>
                            <p className="text-sm text-gray-600 font-medium capitalize">{name} {shade}</p>
                            <p className="text-xs text-gray-400 font-mono">bg-{prefix}-{shade}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-16">
            {/* Core Colors */}
            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">Core Colors</h2>
                {renderColorRow('Primary', 'primary', shades)}
                {renderColorRow('Secondary', 'secondary', shades)}
                {renderColorRow('Neutral', 'neutral', shades)}

                <div className="mb-12">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">White</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        <div className="space-y-2">
                            <div className="h-24 rounded-lg shadow-sm bg-white border border-gray-200"></div>
                            <div>
                                <p className="text-sm text-gray-600 font-medium">White</p>
                                <p className="text-xs text-gray-400 font-mono">bg-white</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Gradients */}
            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">Gradients</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <div className="h-24 rounded-lg shadow-sm bg-gradient-primary"></div>
                        <p className="text-sm text-gray-600 font-medium">Primary Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">primary-500 to secondary-700 (135.7deg)</p>
                    </div>
                    <div className="space-y-2">
                        <div className="h-24 rounded-lg bg-gradient-to-r from-neutral-500 to-neutral-700 shadow-sm"></div>
                        <p className="text-sm text-gray-600 font-medium">Neutral Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">from-neutral-500 to-neutral-700</p>
                    </div>
                    <div className="space-y-2">
                        <div className="h-24 rounded-lg bg-gradient-to-r from-info-500 to-info-700 shadow-sm"></div>
                        <p className="text-sm text-gray-600 font-medium">Info Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">from-info-500 to-info-700</p>
                    </div>
                    <div className="space-y-2">
                        <div className="h-24 rounded-lg bg-gradient-to-r from-warning-400 to-warning-600 shadow-sm"></div>
                        <p className="text-sm text-gray-600 font-medium">Warning Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">from-warning-400 to-warning-600</p>
                    </div>
                    <div className="space-y-2">
                        <div className="h-24 rounded-lg bg-gradient-to-r from-valid-500 to-valid-700 shadow-sm"></div>
                        <p className="text-sm text-gray-600 font-medium">Valid Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">from-valid-500 to-valid-700</p>
                    </div>
                    <div className="space-y-2">
                        <div className="h-24 rounded-lg bg-gradient-to-r from-error-500 to-error-700 shadow-sm"></div>
                        <p className="text-sm text-gray-600 font-medium">Error Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">from-error-500 to-error-700</p>
                    </div>
                </div>
            </section>

            {/* Status Colors */}
            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">Status Colors</h2>
                {renderColorRow('Valid', 'valid', limitedShades)}
                {renderColorRow('Error', 'error', limitedShades)}
                {renderColorRow('Warning', 'warning', limitedShades)}
                {renderColorRow('Info', 'info', limitedShades)}
            </section>
        </div>
    );
};

export default ColorPalette;
