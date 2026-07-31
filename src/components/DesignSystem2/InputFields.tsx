import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Search, Mail, Lock } from 'lucide-react';
import { InputField } from '../ui/InputField';
// import { InputField } from '../ui/InputField';

const InputFields: React.FC = () => {
    const { t } = useTranslation();
    const d = (key: string) => t(`designSystemPage.demo.${key}`);
    return (
        <div className="space-y-12">
            <div className="flex gap-8 mb-8 border-b border-neutral-200 pb-4">
                <div className="hidden xl:block w-24 flex-shrink-0"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                    <div className="text-sm font-medium text-neutral-400 uppercase tracking-wider">{d('iconNone')}</div>
                    <div className="text-sm font-medium text-neutral-400 uppercase tracking-wider">{d('iconSuffix')}</div>
                    <div className="text-sm font-medium text-neutral-400 uppercase tracking-wider">{d('iconPrefix')}</div>
                </div>
            </div>

            <div className="space-y-12">
                {/* Default */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">{d('stateDefault')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} rightIcon={ChevronDown} />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} icon={Plus} />
                    </div>
                </div>

                {/* Active (Simulated with autoFocus or just showing style) */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">Active</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} autoFocus />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} rightIcon={ChevronDown} autoFocus />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} icon={Search} autoFocus />
                    </div>
                </div>

                {/* Completed */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">{d('stateCompleted')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label={d('label')} defaultValue={d('valuePlaceholder')} />
                        <InputField label={d('label')} defaultValue={d('valuePlaceholder')} rightIcon={ChevronDown} />
                        <InputField label={d('label')} defaultValue={d('valuePlaceholder')} icon={Mail} />
                    </div>
                </div>

                {/* Disabled */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">{d('stateDisabled')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} disabled />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} rightIcon={ChevronDown} disabled />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} icon={Lock} disabled />
                    </div>
                </div>

                {/* Error */}
                <div className="flex items-start gap-8">
                    <div className="hidden xl:block w-24 flex-shrink-0 text-left pt-[26px]">
                        <span className="text-sm font-semibold text-neutral-900">{d('stateError')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-grow">
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} error={d('errorInvalid')} />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} rightIcon={ChevronDown} error={d('errorSelectionRequired')} />
                        <InputField label={d('label')} placeholder={d('valuePlaceholder')} icon={Plus} error={d('errorGeneric')} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InputFields;
