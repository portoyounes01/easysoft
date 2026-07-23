import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Crown, List } from 'lucide-react';
import {
    CANONICAL_SPECIMENS,
    GROUP_LABELS,
    GROUP_ORDER,
    type ButtonSpecimen,
    type SpecimenGroup,
    type SpecimenInstance,
    type SpecimenReacts,
} from './buttonLabSpecimens';
import { INLINE_SPECIMENS } from './buttonLabInlineSpecimens';
import { CANONICAL_INSTANCES } from './buttonLabCanonicalInstances';
import { FILE_ENV, type SiteEnv } from './buttonLabSiteEnv';
import { CLUSTERS, FAMILY_LABELS, FAMILY_ORDER, SPECIMEN_CLUSTER, type StyleCluster } from './buttonLabClusters';
import { PROPOSED_PLAN } from './buttonLabProposedPlan';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

/**
 * Internal design tool: previews every distinct button style found in the app
 * (button audit, 2026-07-22) — shared components rendered via their REAL
 * imports, inline/hardcoded styles as verbatim class-string replicas.
 *
 * Each preview reproduces the button's REAL environment in the app (site-env
 * map, 2026-07-22): buttons on `.ds2-visual-scope` screens render inside the
 * live scope and follow the Appearances tokens; buttons inside dialog shells
 * on unscoped screens only get the colour vars; buttons on unscoped screens
 * render bare and stay frozen — exactly like the app. Preview only — nothing
 * here changes any screen in the app.
 */

type SourceFilter = 'all' | 'component' | 'inline';
type ReactsFilter = 'all' | SpecimenReacts;
type EnvFilter = 'all' | SiteEnv | 'mixed';
type PlanFilter = 'all' | 'targets' | 'assigned' | 'retiring' | 'undecided';

/** Sentinel migration target meaning "remove this style entirely". */
export const RETIRE_TARGET = '__retire__';

/**
 * The consolidation plan: which specimens are the blessed target styles for
 * the rebuild, and where every other style should migrate.
 */
interface WinnerPlan {
    /** Specimen keys chosen as target styles. */
    blessed: string[];
    /** Non-blessed specimen key → blessed key, or RETIRE_TARGET. */
    targets: Record<string, string>;
}

const PLAN_STORAGE_KEY = 'button-lab-winner-plan';
const ALL_SPECIMENS: ButtonSpecimen[] = [...CANONICAL_SPECIMENS, ...INLINE_SPECIMENS];
const VALID_KEYS = new Set(ALL_SPECIMENS.map((s) => s.key));
const SPECIMEN_BY_KEY = new Map(ALL_SPECIMENS.map((s) => [s.key, s]));
type ViewMode = 'clusters' | 'roles';

/** Validate a raw plan: prune keys that no longer exist after regeneration. */
function sanitizePlan(parsed: Partial<WinnerPlan>): WinnerPlan {
    const blessed = (parsed.blessed ?? []).filter((k) => VALID_KEYS.has(k));
    const blessedSet = new Set(blessed);
    const targets: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.targets ?? {})) {
        if (!VALID_KEYS.has(key) || blessedSet.has(key)) continue;
        if (value === RETIRE_TARGET || blessedSet.has(value)) targets[key] = value;
    }
    return { blessed, targets };
}

/** Load the stored plan; when none exists (or it is empty — merely opening the
 *  lab persists an empty plan), start from the curated proposal. */
function loadPlan(): WinnerPlan {
    try {
        const raw = localStorage.getItem(PLAN_STORAGE_KEY);
        const stored = raw ? sanitizePlan(JSON.parse(raw) as Partial<WinnerPlan>) : null;
        if (!stored || (stored.blessed.length === 0 && Object.keys(stored.targets).length === 0)) {
            return sanitizePlan(PROPOSED_PLAN);
        }
        return stored;
    } catch {
        return sanitizePlan(PROPOSED_PLAN);
    }
}

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

interface SpecimenCardProps {
    specimen: ButtonSpecimen;
    /** Chosen as a target style for the rebuild. */
    blessed: boolean;
    /** Migration target key (blessed key or RETIRE_TARGET), if assigned. */
    target?: string;
    /** How many other styles are assigned to migrate to this one. */
    assignedToThis: number;
    /** All blessed specimens, for the target picker. */
    blessedOptions: ButtonSpecimen[];
    onToggleBless: (key: string) => void;
    onSetTarget: (key: string, value: string) => void;
}

const SpecimenCard = React.memo<SpecimenCardProps>(({ specimen, blessed, target, assignedToThis, blessedOptions, onToggleBless, onSetTarget }) => {
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
    const sameGroupTargets = blessedOptions.filter((b) => b.group === specimen.group && b.key !== specimen.key);
    const otherGroupTargets = blessedOptions.filter((b) => b.group !== specimen.group);
    return (
        <div className={`flex flex-col overflow-hidden rounded-xl border bg-white ${blessed ? 'border-amber-400 ring-1 ring-amber-300' : 'border-neutral-200'}`}>
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
                    <button
                        type="button"
                        aria-pressed={blessed}
                        onClick={() => onToggleBless(specimen.key)}
                        title={blessed ? 'Target style for the rebuild — click to unmark' : 'Mark as a target style for the rebuild'}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${blessed
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-neutral-100 text-neutral-400 hover:bg-amber-100 hover:text-amber-700'
                            }`}
                    >
                        <Crown className="h-3 w-3" />
                        {blessed && 'target'}
                        {blessed && assignedToThis > 0 && (
                            <span className="rounded bg-amber-200/80 px-1 font-bold text-amber-900">← {assignedToThis}</span>
                        )}
                    </button>
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
                {/* Keep the picker mounted while a target is set even if no
                    winners remain, so a retire choice never becomes invisible
                    or uneditable. */}
                {!blessed && (blessedOptions.length > 0 || target !== undefined) && (
                    <select
                        value={target ?? ''}
                        onChange={(event) => onSetTarget(specimen.key, event.target.value)}
                        title="Where this style migrates in the rebuild"
                        className={`w-full rounded border px-1.5 py-1 text-[10px] font-semibold ${target === RETIRE_TARGET
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : target
                                ? 'border-amber-300 bg-amber-50 text-amber-800'
                                : 'border-neutral-200 bg-white text-neutral-500'
                            }`}
                    >
                        <option value="">Migrate to… (undecided)</option>
                        <option value={RETIRE_TARGET}>Retire — remove this style</option>
                        {sameGroupTargets.length > 0 && (
                            <optgroup label={`${GROUP_LABELS[specimen.group]} targets`}>
                                {sameGroupTargets.map((b) => (
                                    <option key={b.key} value={b.key}>{b.name}</option>
                                ))}
                            </optgroup>
                        )}
                        {otherGroupTargets.length > 0 && (
                            <optgroup label="Targets from other roles">
                                {otherGroupTargets.map((b) => (
                                    <option key={b.key} value={b.key}>{GROUP_LABELS[b.group]} · {b.name}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                )}
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
    blessedSet: Set<string>;
    targets: Record<string, string>;
    assignedCounts: Record<string, number>;
    blessedSpecimens: ButtonSpecimen[];
    onToggleBless: (key: string) => void;
    onSetTarget: (key: string, value: string) => void;
    onSetTargetBulk: (keys: string[], value: string) => void;
}

/**
 * One visual cluster: same fill / colour / radius / layout — members differ
 * only in padding, weight, hover shades etc. Preview one member at a time;
 * crown the variant that should be the target; bulk-assign the rest.
 */
const ClusterCard: React.FC<ClusterCardProps> = ({ cluster, members, blessedSet, targets, assignedCounts, blessedSpecimens, onToggleBless, onSetTarget, onSetTargetBulk }) => {
    const [activeKey, setActiveKey] = useState(members[0]?.key);
    const active = members.find((m) => m.key === activeKey) ?? members[0];
    if (!active) return null;
    const nonBlessed = members.filter((m) => !blessedSet.has(m.key));
    // Common bulk value: shared target across all non-blessed members, else ''.
    const firstTarget = nonBlessed.length > 0 ? targets[nonBlessed[0].key] ?? '' : '';
    const bulkValue = nonBlessed.every((m) => (targets[m.key] ?? '') === firstTarget) ? firstTarget : '';
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
                                    : blessedSet.has(m.key)
                                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                    }`}
                            >
                                {index + 1}
                            </button>
                        ))}
                    </span>
                )}
            </div>
            <SpecimenCard
                specimen={active}
                blessed={blessedSet.has(active.key)}
                target={targets[active.key]}
                assignedToThis={assignedCounts[active.key] ?? 0}
                blessedOptions={blessedSpecimens}
                onToggleBless={onToggleBless}
                onSetTarget={onSetTarget}
            />
            {nonBlessed.length > 1 && blessedSpecimens.length > 0 && (
                <select
                    value={bulkValue}
                    onChange={(event) => onSetTargetBulk(nonBlessed.map((m) => m.key), event.target.value)}
                    title="Assign every variant in this cluster at once"
                    className={`w-full rounded border px-1.5 py-1 text-[10px] font-semibold ${bulkValue === RETIRE_TARGET
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : bulkValue
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-dashed border-neutral-300 bg-neutral-50 text-neutral-500'
                        }`}
                >
                    <option value="">Migrate ALL {nonBlessed.length} variants to…</option>
                    <option value={RETIRE_TARGET}>Retire — remove all of them</option>
                    {blessedSpecimens.map((b) => (
                        <option key={b.key} value={b.key}>{GROUP_LABELS[b.group]} · {b.name}</option>
                    ))}
                </select>
            )}
        </div>
    );
};

const ENV_OPTIONS: { value: EnvFilter; label: string }[] = [
    { value: 'all', label: 'All screens' },
    { value: 'scoped', label: 'In scope' },
    { value: 'dialog-vars', label: 'Dialog vars' },
    { value: 'unscoped', label: 'Out of scope' },
    { value: 'mixed', label: 'Mixed' },
];

const PLAN_OPTIONS: { value: PlanFilter; label: string }[] = [
    { value: 'all', label: 'Whole plan' },
    { value: 'targets', label: '♛ Targets' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'retiring', label: 'Retiring' },
    { value: 'undecided', label: 'Undecided' },
];

const ButtonLab: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('clusters');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [reactsFilter, setReactsFilter] = useState<ReactsFilter>('all');
    const [envFilter, setEnvFilter] = useState<EnvFilter>('all');
    const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
    const [plan, setPlan] = useState<WinnerPlan>(loadPlan);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        try {
            localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
        } catch {
            /* ignore quota / private mode */
        }
    }, [plan]);

    // Adopt plan edits made in other tabs, so a stale in-memory snapshot never
    // clobbers them on the next write (last-writer-wins race).
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== PLAN_STORAGE_KEY) return;
            setPlan(loadPlan());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const allSpecimens = ALL_SPECIMENS;

    const blessedSet = useMemo(() => new Set(plan.blessed), [plan.blessed]);
    const blessedSpecimens = useMemo(
        () => allSpecimens.filter((s) => blessedSet.has(s.key)),
        [allSpecimens, blessedSet]
    );

    const toggleBless = useCallback((key: string) => {
        setPlan((prev) => {
            const wasBlessed = prev.blessed.includes(key);
            const blessed = wasBlessed ? prev.blessed.filter((k) => k !== key) : [...prev.blessed, key];
            const targets: Record<string, string> = {};
            for (const [k, v] of Object.entries(prev.targets)) {
                if (k === key) continue; // a newly blessed style has no migration target
                if (v === key && wasBlessed) continue; // unblessed winner: drop styles assigned to it
                targets[k] = v;
            }
            return { blessed, targets };
        });
    }, []);

    const setTarget = useCallback((key: string, value: string) => {
        setPlan((prev) => {
            const targets = { ...prev.targets };
            if (!value) delete targets[key];
            else targets[key] = value;
            return { ...prev, targets };
        });
    }, []);

    const setTargetBulk = useCallback((keys: string[], value: string) => {
        setPlan((prev) => {
            const blessed = new Set(prev.blessed);
            const targets = { ...prev.targets };
            for (const key of keys) {
                if (blessed.has(key)) continue;
                if (!value) delete targets[key];
                else targets[key] = value;
            }
            return { ...prev, targets };
        });
    }, []);

    /** blessed key → number of styles assigned to migrate to it */
    const assignedCounts = useMemo(() => {
        const map: Record<string, number> = {};
        for (const v of Object.values(plan.targets)) {
            if (v !== RETIRE_TARGET) map[v] = (map[v] ?? 0) + 1;
        }
        return map;
    }, [plan.targets]);

    const planCounts = useMemo(() => {
        let assigned = 0;
        let retiring = 0;
        for (const v of Object.values(plan.targets)) {
            if (v === RETIRE_TARGET) retiring += 1;
            else assigned += 1;
        }
        return {
            targets: plan.blessed.length,
            assigned,
            retiring,
            undecided: allSpecimens.length - plan.blessed.length - assigned - retiring,
        };
    }, [plan, allSpecimens]);

    const copyPlan = useCallback(async () => {
        const byKey = new Map(allSpecimens.map((s) => [s.key, s]));
        const uses = (s: ButtonSpecimen) =>
            (s.instances ?? CANONICAL_INSTANCES[s.key] ?? []).map((i) => ({ label: i.label, ref: i.ref }));
        const entries = Object.entries(plan.targets).filter(([k]) => byKey.has(k));
        const doc = {
            tool: 'button-lab-winner-plan',
            exportedAt: new Date().toISOString(),
            targets: blessedSpecimens.map((s) => ({
                key: s.key,
                name: s.name,
                group: s.group,
                refs: s.refs,
                assignedStyles: assignedCounts[s.key] ?? 0,
            })),
            migrations: entries
                .filter(([, v]) => v !== RETIRE_TARGET && byKey.has(v))
                .map(([k, v]) => {
                    const s = byKey.get(k)!;
                    const t = byKey.get(v)!;
                    return { key: k, name: s.name, group: s.group, migrateTo: { key: v, name: t.name, group: t.group }, uses: uses(s) };
                }),
            retire: entries
                .filter(([, v]) => v === RETIRE_TARGET)
                .map(([k]) => {
                    const s = byKey.get(k)!;
                    return { key: k, name: s.name, group: s.group, uses: uses(s) };
                }),
            undecided: allSpecimens
                .filter((s) => !blessedSet.has(s.key) && !plan.targets[s.key])
                .map((s) => ({ key: s.key, name: s.name, group: s.group })),
        };
        const text = JSON.stringify(doc, null, 2);
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch {
            // Headless / permission-less fallback
            const area = document.createElement('textarea');
            area.value = text;
            document.body.appendChild(area);
            area.select();
            ok = document.execCommand('copy');
            area.remove();
        }
        if (!ok) {
            console.error('ButtonLab: clipboard write failed — plan JSON follows:\n', text);
            return;
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }, [allSpecimens, plan.targets, blessedSpecimens, blessedSet, assignedCounts]);

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
                    (planFilter === 'all' ||
                        (planFilter === 'targets' && blessedSet.has(s.key)) ||
                        (planFilter === 'assigned' &&
                            !blessedSet.has(s.key) &&
                            plan.targets[s.key] !== undefined &&
                            plan.targets[s.key] !== RETIRE_TARGET) ||
                        (planFilter === 'retiring' && plan.targets[s.key] === RETIRE_TARGET) ||
                        (planFilter === 'undecided' && !blessedSet.has(s.key) && plan.targets[s.key] === undefined))
            ),
        [allSpecimens, sourceFilter, reactsFilter, envFilter, cardEnvs, planFilter, blessedSet, plan.targets]
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

    const visibleClusters = useMemo(
        () => clusterGrouped.reduce((n, [, items]) => n + items.length, 0),
        [clusterGrouped]
    );

    /** Per-role plan progress over ALL specimens (not the filtered view). */
    const groupStats = useMemo(() => {
        const map = new Map<SpecimenGroup, { blessed: number; decided: number; total: number }>();
        for (const s of allSpecimens) {
            const entry = map.get(s.group) ?? { blessed: 0, decided: 0, total: 0 };
            entry.total += 1;
            if (blessedSet.has(s.key)) entry.blessed += 1;
            else if (plan.targets[s.key] !== undefined) entry.decided += 1;
            map.set(s.group, entry);
        }
        return map;
    }, [allSpecimens, blessedSet, plan.targets]);

    const grouped = useMemo(() => {
        const map = new Map<SpecimenGroup, ButtonSpecimen[]>();
        for (const group of GROUP_ORDER) map.set(group, []);
        for (const s of filtered) map.get(s.group)?.push(s);
        return [...map.entries()].filter(([, list]) => list.length > 0);
    }, [filtered]);

    const reactCounts = useMemo(() => {
        const counts = { full: 0, partial: 0, none: 0 };
        for (const s of allSpecimens) counts[s.reacts] += 1;
        return counts;
    }, [allSpecimens]);

    const envCounts = useMemo(() => {
        const counts = { scoped: 0, 'dialog-vars': 0, unscoped: 0, mixed: 0, live: 0 };
        for (const s of allSpecimens) {
            const e = cardEnvs.get(s.key);
            if (!e) continue;
            counts[e.env] += 1;
            // "live" = actually follows Appearances in the app today: reactive
            // style AND every one of its sites is in scope.
            if (e.env === 'scoped' && s.reacts !== 'none') counts.live += 1;
        }
        return counts;
    }, [allSpecimens, cardEnvs]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip
                        label={`Deduped clusters (${CLUSTERS.length})`}
                        selected={viewMode === 'clusters'}
                        onClick={() => setViewMode('clusters')}
                    />
                    <FilterChip
                        label={`All styles by role (${ALL_SPECIMENS.length})`}
                        selected={viewMode === 'roles'}
                        onClick={() => setViewMode('roles')}
                    />
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
                <div className="flex flex-wrap items-center gap-1.5">
                    {PLAN_OPTIONS.map((option) => (
                        <FilterChip
                            key={option.value}
                            label={option.label}
                            selected={planFilter === option.value}
                            onClick={() => setPlanFilter(option.value)}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={() => void copyPlan()}
                        disabled={planCounts.targets === 0 && planCounts.assigned === 0 && planCounts.retiring === 0}
                        title="Copy the consolidation plan (targets, migrations, retirements, undecided) as JSON"
                        className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy plan'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm('Replace the current plan with the curated proposal? Your edits will be lost.')) {
                                setPlan(sanitizePlan(PROPOSED_PLAN));
                            }
                        }}
                        title="Load the curated consolidation proposal (winners + assignments)"
                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                    >
                        Reset to proposal
                    </button>
                </div>
                <p className="text-xs font-semibold text-neutral-500">
                    {viewMode === 'clusters' && `${visibleClusters} visual designs (${filtered.length} styles) · `}
                    {viewMode === 'roles' && `${filtered.length} of ${allSpecimens.length} styles · `}
                    only {envCounts.live} actually follow
                    Appearances in the app today · {envCounts.scoped} in scope · {envCounts['dialog-vars']} dialog
                    vars · {envCounts.unscoped} out of scope · {envCounts.mixed} mixed · style: ● {reactCounts.full} ◐ {reactCounts.partial} ○ {reactCounts.none}
                </p>
                <p className="text-xs font-semibold text-amber-700">
                    Plan: ♛ {planCounts.targets} target styles · {planCounts.assigned} assigned ·{' '}
                    {planCounts.retiring} retiring · {planCounts.undecided} undecided
                </p>
            </div>

            <p className="text-xs leading-5 text-neutral-500">
                Every preview reproduces the button's REAL environment in the app. Buttons on screens
                wrapped in the appearance scope (green “in scope” chip) follow the controls above, exactly
                as they do in the app. Buttons in dialog shells on unscoped screens (amber “dialog vars”)
                only follow the colour vars. Buttons on unscoped screens (red “out of scope”) are frozen —
                changing Appearances never reaches them, so they stay frozen here too. For “mixed” styles,
                pick a use from its list to preview each real site exactly. Style dots: ● reactive style ·
                ◐ partly reactive · ○ static CSS. Preview only — nothing here changes the app.
            </p>

            <p className="text-xs leading-5 text-neutral-500">
                <strong className="text-neutral-700">Deduped clusters</strong> collapses buttons that share
                the same visual design — fill, colour family, radius, content layout, border, size tier —
                into one card; padding / font-weight / hover-shade drift becomes numbered variants you can
                flip through (all grays count as one family since the appearance scope remaps them to a
                single neutral; green / emerald / primary are all the brand green).
            </p>

            <p className="text-xs leading-5 text-neutral-500">
                <Crown className="mr-1 inline h-3.5 w-3.5 text-amber-500" aria-hidden />
                <strong className="text-neutral-700">Choosing the winners:</strong> crown the styles that
                should survive the rebuild (a role can have several — e.g. primary / secondary / danger),
                then use the “Migrate to…” pickers — per style, or the dashed cluster-wide picker to assign
                every variant at once — or retire styles outright. Choices are saved locally; “Copy plan”
                exports the full work-list (with every file:line use) as JSON for the migration phase.
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
                                    <ClusterCard
                                        key={cluster.id}
                                        cluster={cluster}
                                        members={members}
                                        blessedSet={blessedSet}
                                        targets={plan.targets}
                                        assignedCounts={assignedCounts}
                                        blessedSpecimens={blessedSpecimens}
                                        onToggleBless={toggleBless}
                                        onSetTarget={setTarget}
                                        onSetTargetBulk={setTargetBulk}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {viewMode === 'roles' && (
            <div className="space-y-6">
                {grouped.map(([group, list]) => {
                    const stats = groupStats.get(group);
                    return (
                        <section key={group}>
                            <h3 className="mb-2 text-sm font-bold text-neutral-700">
                                {GROUP_LABELS[group]}
                                <span className="ml-2 font-mono text-xs font-semibold text-neutral-400">{list.length}</span>
                                {stats && (stats.blessed > 0 || stats.decided > 0) && (
                                    <span className="ml-2 text-xs font-semibold text-amber-600">
                                        ♛ {stats.blessed} · {stats.decided}/{stats.total - stats.blessed} decided
                                    </span>
                                )}
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {list.map((s) => (
                                    <SpecimenCard
                                        key={s.key}
                                        specimen={s}
                                        blessed={blessedSet.has(s.key)}
                                        target={plan.targets[s.key]}
                                        assignedToThis={assignedCounts[s.key] ?? 0}
                                        blessedOptions={blessedSpecimens}
                                        onToggleBless={toggleBless}
                                        onSetTarget={setTarget}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
            )}
        </div>
    );
};

export default ButtonLab;
