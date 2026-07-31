import React, { useMemo, useState } from 'react';
import { List } from 'lucide-react';
import {
    CANONICAL_SPECIMENS,
    GROUP_LABELS,
    GROUP_ORDER,
    type ButtonSpecimen,
    type SpecimenGroup,
    type SpecimenInstance,
    type SpecimenReacts,
    type SpecimenStatus,
} from './buttonLabSpecimens';
import { INLINE_SPECIMENS } from './buttonLabInlineSpecimens';
import { CANONICAL_INSTANCES } from './buttonLabCanonicalInstances';
import { FILE_ENV, type SiteEnv } from './buttonLabSiteEnv';
import { CLUSTERS, FAMILY_LABELS, FAMILY_ORDER, SPECIMEN_CLUSTER, type StyleCluster } from './buttonLabClusters';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

/**
 * Internal design tool: the living register of the button design language
 * (consolidation executed 2026-07-23; data re-extracted from the migrated
 * codebase).
 *
 * Every distinct button style in the app appears here with a STATUS:
 * design-language (the blessed ui/ components + SSOT dialog styles),
 * legacy-frozen (untouched legacy dialog branches), widget-internal (blessed
 * bespoke widgets), recipe (sanctioned token recipes on native elements) —
 * and DRIFT, which should stay at zero: any drift card is a hand-written
 * button style that escaped the design language and needs migrating
 * (`npm run check:buttons` gates the same thing in CI).
 *
 * Each preview reproduces the button's REAL environment in the app (site-env
 * map): scoped screens follow the Appearances tokens live, dialog shells get
 * vars only, unscoped surfaces stay frozen. Preview only — nothing here
 * changes any screen in the app.
 */

type SourceFilter = 'all' | 'component' | 'inline';
type ReactsFilter = 'all' | SpecimenReacts;
type EnvFilter = 'all' | SiteEnv | 'mixed';
type StatusFilter = 'all' | SpecimenStatus;
type ViewMode = 'clusters' | 'roles';

const ALL_SPECIMENS: ButtonSpecimen[] = [...CANONICAL_SPECIMENS, ...INLINE_SPECIMENS];
const SPECIMEN_BY_KEY = new Map(ALL_SPECIMENS.map((s) => [s.key, s]));

/** Environment of one file:line ref, per the generated site-env map. */
function resolveRefEnv(ref: string): SiteEnv | 'mixed' | null {
    const m = /^(.+?\.tsx?):(\d+)/.exec(ref);
    const entry = m ? FILE_ENV[m[1]] : FILE_ENV[ref];
    if (!entry) return null;
    if (m) {
        const line = Number(m[2]);
        const exc = entry.exceptions?.find((e) => line >= e.from && line <= e.to);
        if (exc) return exc.env;
    }
    return entry.env;
}

/** Majority environment named in a mixed entry's mounts list. */
function dominantMountEnv(ref: string): SiteEnv {
    const m = /^(.+?\.tsx?)(?::\d+)?/.exec(ref);
    const mounts = (m && FILE_ENV[m[1]]?.mounts) || [];
    const counts: Record<SiteEnv, number> = { scoped: 0, 'dialog-vars': 0, unscoped: 0 };
    for (const mount of mounts) {
        if (mount.includes('scoped') && !mount.includes('unscoped')) counts.scoped += 1;
        else if (mount.includes('dialog-vars')) counts['dialog-vars'] += 1;
        else counts.unscoped += 1;
    }
    return (['scoped', 'dialog-vars', 'unscoped'] as SiteEnv[]).reduce((a, b) =>
        counts[b] > counts[a] ? b : a
    );
}

interface CardEnv {
    /** Aggregate across sites: single env, or 'mixed' when they disagree. */
    env: SiteEnv | 'mixed';
    /** Env used for the default (no instance selected) preview render. */
    renderEnv: SiteEnv;
    counts: Record<SiteEnv, number>;
    known: number;
}

function computeCardEnv(specimen: ButtonSpecimen, instances: SpecimenInstance[]): CardEnv {
    const refs = instances.length > 0 ? instances.map((i) => i.ref) : specimen.refs;
    const counts: Record<SiteEnv, number> = { scoped: 0, 'dialog-vars': 0, unscoped: 0 };
    let known = 0;
    for (const ref of refs) {
        const env = resolveRefEnv(ref);
        if (env === null) continue;
        known += 1;
        if (env === 'mixed') counts[dominantMountEnv(ref)] += 1;
        else counts[env] += 1;
    }
    const present = (['scoped', 'dialog-vars', 'unscoped'] as SiteEnv[]).filter((e) => counts[e] > 0);
    const renderEnv =
        present.length === 0
            ? 'unscoped'
            : present.reduce((a, b) => (counts[b] > counts[a] ? b : a));
    return { env: present.length === 1 ? present[0] : present.length === 0 ? 'unscoped' : 'mixed', renderEnv, counts, known };
}

function specimenStatus(specimen: ButtonSpecimen): SpecimenStatus {
    if (specimen.status) return specimen.status;
    return specimen.source === 'component' ? 'design-language' : 'drift';
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'All sources' },
    { value: 'component', label: 'Shared component' },
    { value: 'inline', label: 'Inline / hardcoded' },
];

const REACTS_OPTIONS: { value: ReactsFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'full', label: '● Follows appearances' },
    { value: 'partial', label: '◐ Partly follows' },
    { value: 'none', label: '○ Static' },
];

const ENV_OPTIONS: { value: EnvFilter; label: string }[] = [
    { value: 'all', label: 'All screens' },
    { value: 'scoped', label: 'In scope' },
    { value: 'dialog-vars', label: 'Dialog vars' },
    { value: 'unscoped', label: 'Out of scope' },
    { value: 'mixed', label: 'Mixed' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Whole register' },
    { value: 'design-language', label: '♛ Design language' },
    { value: 'recipe', label: 'Recipes' },
    { value: 'legacy-frozen', label: 'Legacy-frozen' },
    { value: 'widget-internal', label: 'Widget internals' },
    { value: 'drift', label: '⚠ Drift' },
];

const STATUS_CHIP: Record<SpecimenStatus, { label: string; className: string; title: string }> = {
    'design-language': {
        label: 'design language',
        className: 'bg-amber-100 text-amber-800',
        title: 'A blessed ui/ component or SSOT dialog style — the unified language',
    },
    recipe: {
        label: 'recipe',
        className: 'bg-teal-50 text-teal-700',
        title: 'Sanctioned token recipe on a native element (gradient primary, danger vars, ghost hover…)',
    },
    'legacy-frozen': {
        label: 'legacy-frozen',
        className: 'bg-neutral-200 text-neutral-600',
        title: 'Legacy dialog fallback branch — byte-identical by policy; disappears when legacy dialog paths are decommissioned',
    },
    'widget-internal': {
        label: 'widget internal',
        className: 'bg-indigo-50 text-indigo-700',
        title: 'Blessed bespoke widget internals (keyboard grid, tree rows, input adornments…) — outside the button language on purpose',
    },
    drift: {
        label: '⚠ DRIFT',
        className: 'bg-red-100 text-red-700',
        title: 'Hand-written button style outside the design language — migrate it onto a winner (check:buttons gates this in CI)',
    },
};

const SYSTEM_LABELS: Record<ButtonSpecimen['system'], string> = {
    canonical: 'ui/ component',
    ds1: 'DS v1',
    ds2: 'DS 2',
    'dialog-system': 'dialog system',
    hardcoded: 'hardcoded',
};

const SYSTEM_CHIP_CLASSES: Record<ButtonSpecimen['system'], string> = {
    canonical: 'bg-green-50 text-green-700',
    ds1: 'bg-purple-50 text-purple-700',
    ds2: 'bg-blue-50 text-blue-700',
    'dialog-system': 'bg-amber-50 text-amber-700',
    hardcoded: 'bg-neutral-100 text-neutral-600',
};

const REACTS_DOT: Record<SpecimenReacts, { glyph: string; className: string; title: string }> = {
    full: { glyph: '●', className: 'text-green-600', title: 'Style follows appearance tokens (when its screen is in scope)' },
    partial: { glyph: '◐', className: 'text-amber-500', title: 'Style partly follows (e.g. radius only) when its screen is in scope' },
    none: { glyph: '○', className: 'text-neutral-400', title: 'Static style — ignores appearance tokens everywhere' },
};

const ENV_CHIP: Record<SiteEnv | 'mixed', { label: string; className: string; title: string }> = {
    scoped: {
        label: 'in scope',
        className: 'bg-green-100 text-green-800',
        title: 'Renders inside .ds2-visual-scope in the app — appearance tokens apply',
    },
    'dialog-vars': {
        label: 'dialog vars',
        className: 'bg-amber-100 text-amber-800',
        title: 'Renders in a dialog shell on an unscoped screen — only var(--ds2-*) colours react; literal classes stay frozen',
    },
    unscoped: {
        label: 'out of scope',
        className: 'bg-red-50 text-red-700',
        title: 'Renders on a screen without .ds2-visual-scope — appearance changes never reach it',
    },
    mixed: {
        label: 'mixed',
        className: 'bg-violet-50 text-violet-700',
        title: 'Used in several environments — select a use below to preview each one exactly',
    },
};

const ENV_DOT_CLASS: Record<SiteEnv, string> = {
    scoped: 'bg-green-500',
    'dialog-vars': 'bg-amber-400',
    unscoped: 'bg-red-400',
};

const ENV_SHORT: Record<SiteEnv, string> = {
    scoped: 'in scope',
    'dialog-vars': 'dialog vars only',
    unscoped: 'out of scope',
};

interface FilterChipProps {
    label: string;
    selected: boolean;
    onClick: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, selected, onClick }) => (
    <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${selected
            ? 'border-green-500 bg-green-50 text-green-700'
            : 'border-neutral-200 bg-white text-neutral-600 hover:border-blue-200 hover:bg-blue-50'
            }`}
    >
        {label}
    </button>
);

const SpecimenCard = React.memo<{ specimen: ButtonSpecimen }>(({ specimen }) => {
    const dot = REACTS_DOT[specimen.reacts];
    const dark = specimen.surface === 'dark';
    const [listOpen, setListOpen] = useState(false);
    const [selected, setSelected] = useState<SpecimenInstance | null>(null);
    const instances = specimen.instances ?? CANONICAL_INSTANCES[specimen.key] ?? [];
    // Scope wraps ONLY the preview surface, so the card's own chrome (badges,
    // chips) never gets remapped by the appearance vars.
    const { visualStyle, prefs } = useDesignSystem2Customization();
    const cardEnv = useMemo(() => computeCardEnv(specimen, instances), [specimen, instances]);
    // The preview mirrors the REAL environment: the selected use's site, or the
    // specimen's dominant site when nothing is selected.
    const selectedEnv = selected ? resolveRefEnv(selected.ref) : null;
    const renderEnv: SiteEnv =
        selectedEnv === null || selectedEnv === 'mixed'
            ? selected
                ? dominantMountEnv(selected.ref)
                : cardEnv.renderEnv
            : selectedEnv;
    const envChip = ENV_CHIP[cardEnv.known === 0 ? 'unscoped' : cardEnv.env];
    const status = specimenStatus(specimen);
    const statusChip = STATUS_CHIP[status];
    return (
        <div className={`flex flex-col overflow-hidden rounded-xl border bg-white ${status === 'drift' ? 'border-red-300 ring-1 ring-red-200' : status === 'design-language' ? 'border-amber-300' : 'border-neutral-200'}`}>
            <div
                className={`${renderEnv === 'scoped' ? 'ds2-visual-scope ' : ''}flex min-h-[7rem] items-center justify-center overflow-x-auto p-4 ${dark ? 'bg-slate-900' : 'bg-neutral-50'}`}
                style={renderEnv === 'unscoped' ? undefined : visualStyle}
                data-ds2-neutral={renderEnv === 'scoped' ? prefs.neutralFamilyId : undefined}
            >
                {specimen.render(selected?.label)}
            </div>
            <div className="space-y-1.5 border-t border-neutral-200 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold leading-4 text-neutral-800">{specimen.name}</p>
                    <span className={`shrink-0 text-sm leading-4 ${dot.className}`} title={dot.title}>
                        {dot.glyph}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusChip.className}`} title={statusChip.title}>
                        {statusChip.label}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${SYSTEM_CHIP_CLASSES[specimen.system]}`}>
                        {SYSTEM_LABELS[specimen.system]}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${envChip.className}`} title={envChip.title}>
                        {cardEnv.env === 'mixed'
                            ? `mixed · ${cardEnv.counts.scoped}/${cardEnv.known} in scope`
                            : envChip.label}
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                        {specimen.source === 'component' ? 'real import' : 'replica'}
                    </span>
                    {instances.length > 0 ? (
                        <button
                            type="button"
                            aria-expanded={listOpen}
                            onClick={() => setListOpen((open) => !open)}
                            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${listOpen
                                ? 'bg-neutral-800 text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            title="Show the app buttons using this style"
                        >
                            <List className="h-3 w-3" />
                            {instances.length} {instances.length === 1 ? 'use' : 'uses'}
                        </button>
                    ) : (
                        specimen.instanceCount !== undefined && specimen.instanceCount > 1 && (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                                ×{specimen.instanceCount}
                            </span>
                        )
                    )}
                </div>
                {listOpen && instances.length > 0 && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-neutral-200">
                        {instances.map((instance, index) => {
                            const isSelected = selected === instance;
                            const instEnvRaw = resolveRefEnv(instance.ref);
                            const instEnv: SiteEnv | null =
                                instEnvRaw === 'mixed' ? dominantMountEnv(instance.ref) : instEnvRaw;
                            return (
                                <button
                                    key={`${instance.ref}-${index}`}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => setSelected(isSelected ? null : instance)}
                                    title={[instance.note ?? instance.label, instEnv ? ENV_SHORT[instEnv] : null].filter(Boolean).join(' — ')}
                                    className={`block w-full border-b border-neutral-100 px-2 py-1.5 text-left transition-colors last:border-b-0 ${isSelected ? 'bg-green-50' : 'hover:bg-neutral-50'
                                        }`}
                                >
                                    <span className={`flex items-center gap-1.5 truncate text-[11px] font-semibold ${isSelected ? 'text-green-700' : 'text-neutral-700'}`}>
                                        {instEnv && (
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENV_DOT_CLASS[instEnv]}`} aria-hidden />
                                        )}
                                        <span className="truncate">{instance.label}</span>
                                    </span>
                                    <span className="block truncate font-mono text-[9px] text-neutral-400">{instance.ref}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {selected && (
                    <p className="text-[10px] font-semibold leading-4 text-green-700">
                        Previewing “{selected.label}” ({ENV_SHORT[renderEnv]}) — click it again to reset
                    </p>
                )}
                {(specimen.reactsDetail || specimen.stateNote || specimen.notes) && (
                    <p className="text-[10px] leading-4 text-neutral-500" title={[specimen.reactsDetail, specimen.stateNote, specimen.notes].filter(Boolean).join(' — ')}>
                        {[specimen.reactsDetail, specimen.stateNote, specimen.notes].filter(Boolean).join(' — ').slice(0, 140)}
                    </p>
                )}
                <p className="truncate font-mono text-[10px] text-neutral-400" title={specimen.refs.join(', ')}>
                    {specimen.refs[0]}
                    {specimen.refs.length > 1 ? ` +${specimen.refs.length - 1}` : ''}
                </p>
            </div>
        </div>
    );
});
SpecimenCard.displayName = 'SpecimenCard';

interface ClusterCardProps {
    cluster: StyleCluster;
    /** Members passing the active filters, heaviest use first. */
    members: ButtonSpecimen[];
}

/**
 * One visual cluster: same fill / colour / radius / layout — members differ
 * only in padding, weight, hover shades etc. Preview one member at a time.
 */
const ClusterCard: React.FC<ClusterCardProps> = ({ cluster, members }) => {
    const [activeKey, setActiveKey] = useState(members[0]?.key);
    const active = members.find((m) => m.key === activeKey) ?? members[0];
    if (!active) return null;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1 px-0.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-neutral-600" title={cluster.label}>
                    {cluster.label}
                </span>
                {members.length > 1 && (
                    <span className="flex flex-wrap items-center gap-0.5">
                        {members.map((m, index) => (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => setActiveKey(m.key)}
                                title={m.name}
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${m.key === active.key
                                    ? 'bg-neutral-800 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                    }`}
                            >
                                {index + 1}
                            </button>
                        ))}
                    </span>
                )}
            </div>
            <SpecimenCard specimen={active} />
        </div>
    );
};

const ButtonLab: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('roles');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [reactsFilter, setReactsFilter] = useState<ReactsFilter>('all');
    const [envFilter, setEnvFilter] = useState<EnvFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const allSpecimens = ALL_SPECIMENS;

    const cardEnvs = useMemo(() => {
        const map = new Map<string, CardEnv>();
        for (const s of allSpecimens) {
            map.set(s.key, computeCardEnv(s, s.instances ?? CANONICAL_INSTANCES[s.key] ?? []));
        }
        return map;
    }, [allSpecimens]);

    const filtered = useMemo(
        () =>
            allSpecimens.filter(
                (s) =>
                    (sourceFilter === 'all' || s.source === sourceFilter) &&
                    (reactsFilter === 'all' || s.reacts === reactsFilter) &&
                    (envFilter === 'all' || cardEnvs.get(s.key)?.env === envFilter) &&
                    (statusFilter === 'all' || specimenStatus(s) === statusFilter)
            ),
        [allSpecimens, sourceFilter, reactsFilter, envFilter, statusFilter, cardEnvs]
    );

    /** Cluster view: families → clusters, keeping only filter-passing members. */
    const clusterGrouped = useMemo(() => {
        const passing = new Set(filtered.map((s) => s.key));
        const out: [string, { cluster: StyleCluster; members: ButtonSpecimen[] }[]][] = [];
        for (const fam of FAMILY_ORDER) {
            const items = CLUSTERS.filter((c) => c.family === fam)
                .map((c) => ({
                    cluster: c,
                    members: c.members
                        .map((k) => SPECIMEN_BY_KEY.get(k))
                        .filter((s): s is ButtonSpecimen => !!s && passing.has(s.key)),
                }))
                .filter((x) => x.members.length > 0);
            if (items.length > 0) out.push([fam, items]);
        }
        // Safety net: anything the cluster generator missed still shows up.
        const leftovers = filtered.filter((s) => !SPECIMEN_CLUSTER[s.key]);
        if (leftovers.length > 0) {
            out.push([
                'unclustered',
                leftovers.map((s) => ({
                    cluster: { id: `u-${s.key}`, label: s.name, family: 'unclustered', members: [s.key] },
                    members: [s],
                })),
            ]);
        }
        return out;
    }, [filtered]);

    const grouped = useMemo(() => {
        const map = new Map<SpecimenGroup, ButtonSpecimen[]>();
        for (const group of GROUP_ORDER) map.set(group, []);
        for (const s of filtered) map.get(s.group)?.push(s);
        return [...map.entries()].filter(([, list]) => list.length > 0);
    }, [filtered]);

    const statusCounts = useMemo(() => {
        const counts: Record<SpecimenStatus, number> = {
            'design-language': 0,
            recipe: 0,
            'legacy-frozen': 0,
            'widget-internal': 0,
            drift: 0,
        };
        for (const s of allSpecimens) counts[specimenStatus(s)] += 1;
        return counts;
    }, [allSpecimens]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip
                        label={`By role (${ALL_SPECIMENS.length})`}
                        selected={viewMode === 'roles'}
                        onClick={() => setViewMode('roles')}
                    />
                    <FilterChip
                        label={`Visual clusters (${CLUSTERS.length})`}
                        selected={viewMode === 'clusters'}
                        onClick={() => setViewMode('clusters')}
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((option) => (
                        <FilterChip
                            key={option.value}
                            label={option.label}
                            selected={statusFilter === option.value}
                            onClick={() => setStatusFilter(option.value)}
                        />
                    ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {SOURCE_OPTIONS.map((option) => (
                        <FilterChip
                            key={option.value}
                            label={option.label}
                            selected={sourceFilter === option.value}
                            onClick={() => setSourceFilter(option.value)}
                        />
                    ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {REACTS_OPTIONS.map((option) => (
                        <FilterChip
                            key={option.value}
                            label={option.label}
                            selected={reactsFilter === option.value}
                            onClick={() => setReactsFilter(option.value)}
                        />
                    ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {ENV_OPTIONS.map((option) => (
                        <FilterChip
                            key={option.value}
                            label={option.label}
                            selected={envFilter === option.value}
                            onClick={() => setEnvFilter(option.value)}
                        />
                    ))}
                </div>
                <p className="text-xs font-semibold text-neutral-500">
                    {filtered.length} of {allSpecimens.length} styles · ♛ {statusCounts['design-language']} design
                    language · {statusCounts.recipe} recipes · {statusCounts['legacy-frozen']} legacy-frozen ·{' '}
                    {statusCounts['widget-internal']} widget internals ·{' '}
                    <span className={statusCounts.drift > 0 ? 'font-bold text-red-600' : 'text-green-700'}>
                        {statusCounts.drift} drift{statusCounts.drift === 0 ? ' ✓' : ' ⚠'}
                    </span>
                </p>
            </div>

            <p className="text-xs leading-5 text-neutral-500">
                The living register of the button design language. ♛ design-language cards are the blessed
                components and SSOT dialog styles; recipes are their sanctioned token expressions on native
                elements; legacy-frozen styles live in the untouched legacy dialog branches; widget internals
                are blessed bespoke widgets. <strong className="text-red-600">Drift must stay at zero</strong>{' '}
                — a drift card is a hand-written button that escaped the language (same gate as{' '}
                <code className="rounded bg-neutral-100 px-1">npm run check:buttons</code>). Every preview
                reproduces the button's real screen environment: “in scope” follows the Appearances controls
                above live, “dialog vars” follows colours only, “out of scope” stays frozen. Pick a use from a
                card's list to preview that exact site.
            </p>

            {viewMode === 'clusters' && (
                <div className="space-y-6">
                    {clusterGrouped.map(([family, items]) => (
                        <section key={family}>
                            <h3 className="mb-2 text-sm font-bold text-neutral-700">
                                {FAMILY_LABELS[family] ?? (family === 'unclustered' ? 'Unclustered' : family)}
                                <span className="ml-2 font-mono text-xs font-semibold text-neutral-400">{items.length}</span>
                                <span className="ml-2 text-xs font-normal text-neutral-400">
                                    {items.reduce((n, x) => n + x.members.length, 0)} styles
                                </span>
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {items.map(({ cluster, members }) => (
                                    <ClusterCard key={cluster.id} cluster={cluster} members={members} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {viewMode === 'roles' && (
                <div className="space-y-6">
                    {grouped.map(([group, list]) => (
                        <section key={group}>
                            <h3 className="mb-2 text-sm font-bold text-neutral-700">
                                {GROUP_LABELS[group]}
                                <span className="ml-2 font-mono text-xs font-semibold text-neutral-400">{list.length}</span>
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {list.map((s) => (
                                    <SpecimenCard key={s.key} specimen={s} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ButtonLab;
