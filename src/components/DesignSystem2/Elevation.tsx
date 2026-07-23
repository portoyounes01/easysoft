import React from 'react';

const Elevation: React.FC = () => {
    return (
        <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Elevation 1 */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-neutral-900">Elevation 1</h3>
                    <div className="h-64 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                    </div>
                </div>

                {/* Elevation 2 */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-neutral-900">Elevation 2</h3>
                    <div className="h-64 bg-white rounded-xl shadow-md border border-neutral-100 flex items-center justify-center">
                    </div>
                </div>

                {/* Elevation 3 */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-neutral-900">Elevation 3</h3>
                    <div className="h-64 bg-white rounded-xl shadow-xl border border-neutral-100 flex items-center justify-center">
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Elevation;
