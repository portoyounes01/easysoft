import React from 'react';
import { ChevronDown, Plus, Search, Mail, Lock } from 'lucide-react';
import { InputField } from '../ui/InputField';
// import { InputField } from '../ui/InputField';

const InputFields: React.FC = () => {
    return (
        <div className="space-y-12">
            <div className="flex gap-8 mb-8 border-b border-neutral-200 pb-4">
                <div className="hidden xl:block w-24 flex-shrink-0"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                    <div className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Icon = None</div>
                    <div className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Icon = Suffix</div>
                    <div className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Icon = Prefix</div>
                </div>
            </div>

            <div className="space-y-12">
                {/* Default */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">Default</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label="Label" placeholder="Value" />
                        <InputField label="Label" placeholder="Value" rightIcon={ChevronDown} />
                        <InputField label="Label" placeholder="Value" icon={Plus} />
                    </div>
                </div>

                {/* Active (Simulated with autoFocus or just showing style) */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">Active</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label="Label" placeholder="Value" autoFocus />
                        <InputField label="Label" placeholder="Value" rightIcon={ChevronDown} autoFocus />
                        <InputField label="Label" placeholder="Value" icon={Search} autoFocus />
                    </div>
                </div>

                {/* Completed */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">Completed</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label="Label" defaultValue="Value" />
                        <InputField label="Label" defaultValue="Value" rightIcon={ChevronDown} />
                        <InputField label="Label" defaultValue="Value" icon={Mail} />
                    </div>
                </div>

                {/* Disabled */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">Disabled</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label="Label" placeholder="Value" disabled />
                        <InputField label="Label" placeholder="Value" rightIcon={ChevronDown} disabled />
                        <InputField label="Label" placeholder="Value" icon={Lock} disabled />
                    </div>
                </div>

                {/* Error */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">Error</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label="Label" placeholder="Value" error="Invalid value" />
                        <InputField label="Label" placeholder="Value" rightIcon={ChevronDown} error="Selection required" />
                        <InputField label="Label" placeholder="Value" icon={Plus} error="Error message" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InputFields;
