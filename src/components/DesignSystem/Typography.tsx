import React from 'react';

const Typography: React.FC = () => {
    return (
        <div className="space-y-12">
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-6 border-b pb-2">Font Family</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="text-sm text-neutral-500 font-mono pt-1">font-sans</div>
                    <div className="md:col-span-2">
                        <p className="text-lg font-medium text-neutral-900">
                            System UI sans
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                            ui-sans-serif, system-ui, sans-serif
                        </p>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-6 border-b pb-2">Headings</h3>
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">text-4xl font-bold</div>
                        <div className="md:col-span-2">
                            <h1 className="text-4xl font-bold text-neutral-900">Heading 1</h1>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">text-3xl font-bold</div>
                        <div className="md:col-span-2">
                            <h2 className="text-3xl font-bold text-neutral-900">Heading 2</h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">text-2xl font-bold</div>
                        <div className="md:col-span-2">
                            <h3 className="text-2xl font-bold text-neutral-900">Heading 3</h3>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">text-xl font-semibold</div>
                        <div className="md:col-span-2">
                            <h4 className="text-xl font-semibold text-neutral-900">Heading 4</h4>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-6 border-b pb-2">Body Text</h3>
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                        <div className="text-sm text-neutral-500 font-mono pt-1">text-base</div>
                        <div className="md:col-span-2">
                            <p className="text-base text-neutral-600">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                        <div className="text-sm text-neutral-500 font-mono pt-1">text-sm</div>
                        <div className="md:col-span-2">
                            <p className="text-sm text-neutral-600">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                        <div className="text-sm text-neutral-500 font-mono pt-1">text-xs</div>
                        <div className="md:col-span-2">
                            <p className="text-xs text-neutral-600">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-6 border-b pb-2">Font Weights</h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">font-light</div>
                        <div className="md:col-span-2">
                            <p className="font-light text-lg text-neutral-900">The quick brown fox jumps over the lazy dog</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">font-normal</div>
                        <div className="md:col-span-2">
                            <p className="font-normal text-lg text-neutral-900">The quick brown fox jumps over the lazy dog</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">font-medium</div>
                        <div className="md:col-span-2">
                            <p className="font-medium text-lg text-neutral-900">The quick brown fox jumps over the lazy dog</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">font-semibold</div>
                        <div className="md:col-span-2">
                            <p className="font-semibold text-lg text-neutral-900">The quick brown fox jumps over the lazy dog</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="text-sm text-neutral-500 font-mono">font-bold</div>
                        <div className="md:col-span-2">
                            <p className="font-bold text-lg text-neutral-900">The quick brown fox jumps over the lazy dog</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Typography;
