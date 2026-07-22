<script setup lang="ts">
import {
	TRACK_EVIDENCE_AGREEMENT_POLICY,
	type TrackEvidenceAgreementStatus,
	compareTrackEvidenceAgreement
} from '~/utils/trackEvidenceAgreement'
import { decodeTrackEvidence } from '~/utils/trackEvidenceCodec'
import {
	type TrackEvidenceFieldAttribution,
	type TrackEvidenceInterpretationResult,
	interpretTrackEvidence
} from '~/utils/trackEvidenceInterpretation'
import { TRACK_EVIDENCE_SOURCE_KEYS } from '~~/shared/types/audioFeatures'
import type { LibraryKeyFormat } from '~~/shared/types/library'

const props = defineProps<{
	evidence: unknown
	currentBpm: number | null
	currentKey: number | null
	currentMode: number | null
	keyFormat: LibraryKeyFormat
}>()

type AvailableInterpretation = Extract<
	TrackEvidenceInterpretationResult,
	{ ok: true }
>
type AvailableAgreement = Extract<
	ReturnType<typeof compareTrackEvidenceAgreement>,
	{ ok: true }
>
type EvidenceView =
	| { available: false; reason: 'missing' | 'malformed' }
	| {
			available: true
			interpretation: AvailableInterpretation
			agreement: AvailableAgreement
	  }

type AttributionView = {
	state:
		| 'applied'
		| 'changed-since-application'
		| 'source-missing'
		| 'unattributed'
	label: string
	detail: string
	appliedAt: string | null
}

const headingId = useId()
const sourcesHeadingId = useId()
const comparisonHeadingId = useId()

function unavailableView(): Extract<EvidenceView, { available: false }> {
	return {
		available: false,
		reason:
			props.evidence === null || props.evidence === undefined
				? 'missing'
				: 'malformed'
	}
}

const evidenceView = computed<EvidenceView>(() => {
	const decoded = decodeTrackEvidence(props.evidence)
	if (!decoded.ok) return unavailableView()

	const interpretation = interpretTrackEvidence(decoded, {
		bpm: props.currentBpm,
		key: props.currentKey,
		mode: props.currentMode
	})
	const agreement = compareTrackEvidenceAgreement(decoded)
	if (!interpretation.ok || !agreement.ok) return unavailableView()

	return { available: true, interpretation, agreement }
})

const sourceCards = computed(() => {
	if (!evidenceView.value.available) return []
	const { agreement, interpretation } = evidenceView.value
	return TRACK_EVIDENCE_SOURCE_KEYS.map((source) => ({
		source,
		coverage: interpretation.sourceCoverage.bySource[source],
		bpm: agreement.bpm.sourceStates[source],
		keyMode: agreement.keyMode.sourceStates[source]
	}))
})

const comparisonCards = computed(() => {
	if (!evidenceView.value.available) return []
	const { agreement } = evidenceView.value
	return [
		{
			id: 'bpm',
			label: 'BPM',
			status: agreement.bpm.status,
			statusLabel: agreement.bpm.label,
			populatedSourceCount: agreement.bpm.populatedSourceCount,
			requiredSourceCount: agreement.bpm.requiredSourceCount,
			pairCount: agreement.bpm.pairs.length
		},
		{
			id: 'key-mode',
			label: 'Key',
			status: agreement.keyMode.status,
			statusLabel: agreement.keyMode.label,
			populatedSourceCount: agreement.keyMode.populatedSourceCount,
			requiredSourceCount: agreement.keyMode.requiredSourceCount,
			pairCount: agreement.keyMode.pairs.length
		}
	] as const
})

const currentBpmLabel = computed(() => formatBpm(props.currentBpm))
const currentKeyLabel = computed(() =>
	formatKeyMode(props.currentKey, props.currentMode)
)

const bpmAttribution = computed(() => {
	if (!evidenceView.value.available) return null
	return presentAttribution(
		evidenceView.value.interpretation.fields.bpm.attribution,
		formatBpm
	)
})

const keyModeAttribution = computed(() => {
	if (!evidenceView.value.available) return null
	return presentAttribution(
		evidenceView.value.interpretation.fields.keyMode.attribution,
		(value) => formatKeyMode(value.key, value.mode)
	)
})

const evidenceVersionLabel = computed(() => {
	if (!evidenceView.value.available) return null
	return evidenceView.value.interpretation.sourceVersion === 1
		? 'Evidence v1 · compatibility view'
		: 'Evidence v2'
})

type AgreementRelation =
	(typeof TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.agreementRelations)[number]

const AGREEMENT_RELATION_LABELS: Record<AgreementRelation, string> = {
	exact: 'exact',
	'relative-major-minor': 'a relative major/minor pair'
}

const agreementPolicyDescription = [
	`BPM values agree at an absolute difference of ${TRACK_EVIDENCE_AGREEMENT_POLICY.bpm.maximumAbsoluteDifference} BPM or less`,
	TRACK_EVIDENCE_AGREEMENT_POLICY.bpm.halfDoubleTempoCountsAsAgreement
		? 'half/double tempos may be treated as equivalent'
		: 'half/double tempos stay distinct',
	`keys agree only when ${TRACK_EVIDENCE_AGREEMENT_POLICY.keyMode.agreementRelations
		.map((relation) => AGREEMENT_RELATION_LABELS[relation])
		.join(' or ')}`
].join('; ')

function formatBpm(value: number | null): string {
	if (value === null) return 'Not set'
	if (!Number.isFinite(value)) return 'Unavailable'
	return `${value.toFixed(1)} BPM`
}

function formatKeyMode(key: number | null, mode: number | null): string {
	if (key === null && mode === null) return 'Not set'
	if (
		key === null ||
		mode === null ||
		!Number.isInteger(key) ||
		key < 0 ||
		key > 11 ||
		(mode !== 0 && mode !== 1)
	) {
		return 'Incomplete or unavailable'
	}
	return getFormattedKeyString(key, mode, props.keyFormat, 'short')
}

function formatTimestamp(value: string): string {
	const timestamp = new Date(value)
	if (Number.isNaN(timestamp.getTime())) return 'Time unavailable'
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(timestamp)
}

function formatMetric(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return 'Not available'
	return value.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function unavailableValueLabel(
	reason: 'not-retained' | 'missing-value' | 'invalid-value'
): string {
	if (reason === 'not-retained') return 'Source not retained'
	if (reason === 'missing-value') return 'Not observed'
	return 'Unavailable'
}

function presentAttribution<TValue>(
	attribution: TrackEvidenceFieldAttribution<TValue> | null,
	formatValue: (value: TValue) => string
): AttributionView | null {
	if (!attribution) return null
	if (attribution.state === 'unattributed') {
		return {
			state: attribution.state,
			label: attribution.label,
			detail: attribution.legacyApplication
				? `Legacy v1 marker names ${attribution.legacyApplication.sourceLabel}; its applied value and observation identity are unavailable.`
				: 'No attributable application snapshot is stored.',
			appliedAt: attribution.legacyApplication?.appliedAt ?? null
		}
	}

	const application = attribution.application
	const missingDetail =
		attribution.state !== 'source-missing'
			? ''
			: attribution.missingReason === 'source-not-retained'
				? '; the source observation is not retained'
				: '; the referenced observation is not retained'
	return {
		state: attribution.state,
		label: attribution.label,
		detail: `${application.sourceLabel} · applied value ${formatValue(application.value)}${missingDetail}`,
		appliedAt: application.appliedAt
	}
}

function attributionClasses(state: AttributionView['state']): string {
	if (state === 'applied') {
		return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
	}
	if (state === 'changed-since-application') {
		return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300'
	}
	if (state === 'source-missing') {
		return 'border-orange-500/40 bg-orange-500/10 text-orange-900 dark:text-orange-300'
	}
	return 'border-border bg-muted/40 text-muted-foreground'
}

function agreementClasses(status: TrackEvidenceAgreementStatus): string {
	if (status === 'agreement') {
		return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
	}
	if (status === 'conflict') {
		return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300'
	}
	return 'border-border bg-muted/40 text-muted-foreground'
}

function comparisonDescription(input: {
	status: TrackEvidenceAgreementStatus
	populatedSourceCount: number
	requiredSourceCount: number
	pairCount: number
}): string {
	if (input.status === 'insufficient-evidence') {
		return `${input.populatedSourceCount} populated retained sources; ${input.requiredSourceCount} required.`
	}
	if (input.status === 'agreement') {
		return `${input.pairCount} source ${input.pairCount === 1 ? 'pair meets' : 'pairs meet'} this policy.`
	}
	return `${input.pairCount} source ${input.pairCount === 1 ? 'pair was' : 'pairs were'} compared; at least one does not meet this policy.`
}
</script>

<template>
	<section :aria-labelledby="headingId">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 :id="headingId" class="text-xs font-semibold">
					Enrichment Evidence
				</h3>
				<p class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
					Stored observations and application attribution. This view is
					read-only.
				</p>
			</div>
			<span
				v-if="evidenceVersionLabel"
				class="border-border bg-muted/30 shrink-0 rounded-sm border px-1.5 py-1 font-mono text-[9px] tracking-wide uppercase"
			>
				{{ evidenceVersionLabel }}
			</span>
		</div>

		<div
			class="mt-3 grid grid-cols-2 gap-2"
			role="group"
			aria-label="Current track values"
		>
			<div class="border-border bg-card/40 rounded-sm border p-2.5">
				<p
					class="text-muted-foreground font-mono text-[9px] tracking-wide uppercase"
				>
					Current BPM
				</p>
				<p class="mt-1 font-mono text-sm font-semibold tabular-nums">
					{{ currentBpmLabel }}
				</p>
			</div>

			<div class="border-border bg-card/40 rounded-sm border p-2.5">
				<p
					class="text-muted-foreground font-mono text-[9px] tracking-wide uppercase"
				>
					Current key
				</p>
				<p class="mt-1 font-mono text-sm font-semibold">
					{{ currentKeyLabel }}
				</p>
			</div>
		</div>

		<div
			v-if="evidenceView.available"
			class="mt-2 space-y-2"
			role="group"
			aria-label="Application attribution"
		>
			<div
				v-if="bpmAttribution"
				class="rounded-sm border p-2.5 text-[10px] leading-relaxed"
				:class="attributionClasses(bpmAttribution.state)"
			>
				<p class="font-mono text-[9px] tracking-wide uppercase">
					BPM application
				</p>
				<p class="mt-0.5 font-semibold">{{ bpmAttribution.label }}</p>
				<p class="mt-0.5">{{ bpmAttribution.detail }}</p>
				<p v-if="bpmAttribution.appliedAt" class="mt-0.5">
					Applied
					<time :datetime="bpmAttribution.appliedAt">
						{{ formatTimestamp(bpmAttribution.appliedAt) }}
					</time>
				</p>
			</div>
			<div
				v-else
				class="border-border bg-muted/30 text-muted-foreground rounded-sm border p-2.5 text-[10px] leading-relaxed"
			>
				<p class="font-mono text-[9px] tracking-wide uppercase">
					BPM application
				</p>
				<p class="mt-0.5 font-semibold">No application attribution</p>
				<p class="mt-0.5">
					No current BPM or attributable application snapshot is available.
				</p>
			</div>

			<div
				v-if="keyModeAttribution"
				class="rounded-sm border p-2.5 text-[10px] leading-relaxed"
				:class="attributionClasses(keyModeAttribution.state)"
			>
				<p class="font-mono text-[9px] tracking-wide uppercase">
					Key application
				</p>
				<p class="mt-0.5 font-semibold">{{ keyModeAttribution.label }}</p>
				<p class="mt-0.5">{{ keyModeAttribution.detail }}</p>
				<p v-if="keyModeAttribution.appliedAt" class="mt-0.5">
					Applied
					<time :datetime="keyModeAttribution.appliedAt">
						{{ formatTimestamp(keyModeAttribution.appliedAt) }}
					</time>
				</p>
			</div>
			<div
				v-else
				class="border-border bg-muted/30 text-muted-foreground rounded-sm border p-2.5 text-[10px] leading-relaxed"
			>
				<p class="font-mono text-[9px] tracking-wide uppercase">
					Key application
				</p>
				<p class="mt-0.5 font-semibold">No application attribution</p>
				<p class="mt-0.5">
					No current key or attributable application snapshot is available.
				</p>
			</div>
		</div>

		<div
			v-if="!evidenceView.available"
			class="border-border bg-muted/25 mt-3 rounded-sm border border-dashed p-3"
			role="status"
			aria-label="Enrichment Evidence unavailable"
		>
			<p class="text-xs font-semibold">Evidence unavailable</p>
			<p class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
				<template v-if="evidenceView.reason === 'missing'">
					No enrichment Evidence is stored for this track.
				</template>
				<template v-else>
					Stored enrichment Evidence could not be read. Attribution, source
					values, and source comparison are unavailable.
				</template>
			</p>
		</div>

		<template v-else>
			<div class="border-border bg-muted/20 mt-3 rounded-sm border p-2.5">
				<div class="flex items-center justify-between gap-3">
					<p class="text-[10px] font-semibold tracking-wide uppercase">
						Source coverage
					</p>
					<p
						class="font-mono text-[10px] tabular-nums"
						:aria-label="`Evidence source coverage: ${evidenceView.interpretation.sourceCoverage.retainedCount} of ${evidenceView.interpretation.sourceCoverage.totalSourceSlots} source slots retained`"
					>
						{{ evidenceView.interpretation.sourceCoverage.retainedCount }} /
						{{ evidenceView.interpretation.sourceCoverage.totalSourceSlots }}
						retained
					</p>
				</div>
			</div>

			<div
				v-if="evidenceView.interpretation.legacyGlobalMatch"
				class="border-border bg-muted/25 mt-2 rounded-sm border border-dashed p-2.5"
				aria-label="Legacy global identity match"
			>
				<p class="text-[10px] font-semibold tracking-wide uppercase">
					Legacy global identity match
				</p>
				<p class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
					{{ evidenceView.interpretation.legacyGlobalMatch.label }}. Match score
					{{ evidenceView.interpretation.legacyGlobalMatch.score }} / 100.
				</p>
			</div>

			<div class="mt-4" :aria-labelledby="comparisonHeadingId">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h4
							:id="comparisonHeadingId"
							class="text-[10px] font-semibold tracking-wide uppercase"
						>
							Source comparison
						</h4>
						<p class="text-muted-foreground mt-1 text-[10px] leading-relaxed">
							{{ agreementPolicyDescription }}.
						</p>
					</div>
					<span
						class="border-border bg-muted/30 max-w-32 shrink-0 truncate rounded-sm border px-1.5 py-1 font-mono text-[8px]"
						:title="evidenceView.agreement.policyVersion"
					>
						{{ evidenceView.agreement.policyVersion }}
					</span>
				</div>

				<div class="mt-2 grid grid-cols-2 gap-2">
					<div
						v-for="comparison in comparisonCards"
						:key="comparison.id"
						class="border-border rounded-sm border p-2.5"
						:aria-label="`${comparison.label} source comparison: ${comparison.statusLabel}`"
					>
						<div class="flex items-center justify-between gap-2">
							<p class="text-[10px] font-semibold">{{ comparison.label }}</p>
							<span
								class="rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold"
								:class="agreementClasses(comparison.status)"
							>
								{{ comparison.statusLabel }}
							</span>
						</div>
						<p class="text-muted-foreground mt-1 text-[10px] leading-relaxed">
							{{ comparisonDescription(comparison) }}
						</p>
					</div>
				</div>
			</div>

			<div class="mt-4" :aria-labelledby="sourcesHeadingId">
				<h4
					:id="sourcesHeadingId"
					class="text-[10px] font-semibold tracking-wide uppercase"
				>
					Evidence sources
				</h4>
				<ul class="mt-2 space-y-2" aria-label="Fixed Evidence source cards">
					<li
						v-for="card in sourceCards"
						:key="card.source"
						:data-testid="`track-evidence-source-${card.source}`"
						class="border-border bg-card/40 rounded-sm border p-2.5"
					>
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="text-xs font-semibold">
									{{ card.coverage.sourceLabel }}
								</p>
								<p class="text-muted-foreground mt-0.5 text-[10px]">
									<template v-if="card.coverage.observedAt">
										Observed
										<time :datetime="card.coverage.observedAt">
											{{ formatTimestamp(card.coverage.observedAt) }}
										</time>
									</template>
									<template v-else-if="card.coverage.retained">
										Observation time unavailable
									</template>
									<template v-else>No retained observation</template>
								</p>
							</div>
							<span
								class="shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold"
								:class="
									card.coverage.retained
										? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
										: 'border-border bg-muted/40 text-muted-foreground'
								"
							>
								{{ card.coverage.retained ? 'Retained' : 'Not retained' }}
							</span>
						</div>

						<dl class="mt-2 grid grid-cols-2 gap-2">
							<div class="bg-muted/20 rounded-sm p-2">
								<dt class="text-muted-foreground text-[9px] uppercase">BPM</dt>
								<dd class="mt-0.5 font-mono text-xs tabular-nums">
									<template v-if="card.bpm.availability === 'populated'">
										{{ formatBpm(card.bpm.value) }}
									</template>
									<template v-else>
										{{ unavailableValueLabel(card.bpm.reason) }}
									</template>
								</dd>
							</div>
							<div class="bg-muted/20 rounded-sm p-2">
								<dt class="text-muted-foreground text-[9px] uppercase">Key</dt>
								<dd class="mt-0.5 font-mono text-xs">
									<template v-if="card.keyMode.availability === 'populated'">
										{{
											formatKeyMode(
												card.keyMode.value.key,
												card.keyMode.value.mode
											)
										}}
									</template>
									<template v-else>
										{{ unavailableValueLabel(card.keyMode.reason) }}
									</template>
								</dd>
							</div>
						</dl>

						<div class="border-border mt-2 border-t pt-2">
							<p
								class="text-muted-foreground text-[9px] tracking-wide uppercase"
							>
								Identity match
							</p>
							<p class="mt-0.5 text-[10px] leading-relaxed">
								<template v-if="card.coverage.identityMatch">
									{{ card.coverage.identityMatch.label }}
								</template>
								<template v-else>
									Identity match unavailable because this source is not
									retained.
								</template>
							</p>
						</div>

						<div
							v-if="card.coverage.analyzerMetrics"
							class="border-border mt-2 border-t pt-2"
							aria-label="Essentia analyzer metrics, separate from identity matching"
						>
							<p
								class="text-muted-foreground text-[9px] tracking-wide uppercase"
							>
								Analyzer metrics
							</p>
							<dl class="mt-1 space-y-1 text-[10px]">
								<div class="flex items-center justify-between gap-3">
									<dt>
										{{ card.coverage.analyzerMetrics.bpmConfidence.label }}
									</dt>
									<dd class="font-mono tabular-nums">
										{{
											formatMetric(
												card.coverage.analyzerMetrics.bpmConfidence.value
											)
										}}
									</dd>
								</div>
								<div class="flex items-center justify-between gap-3">
									<dt>{{ card.coverage.analyzerMetrics.keyStrength.label }}</dt>
									<dd class="font-mono tabular-nums">
										{{
											formatMetric(
												card.coverage.analyzerMetrics.keyStrength.value
											)
										}}
									</dd>
								</div>
							</dl>
						</div>
					</li>
				</ul>
			</div>
		</template>
	</section>
</template>
