import type {
	TrackEvidenceV2Current,
	TrackEvidenceV2FullyCurrent,
	TrackEvidenceV2MigratedV1
} from '../../shared/types/audioFeatures'

export const legacyTrackAudioFeaturesV1Golden = {
	version: 1,
	updatedAt: '2026-07-20T10:30:00.000Z',
	applied: {
		bpm: {
			source: 'rekordboxXml',
			appliedAt: '2026-07-18T09:00:00.000Z',
			futureMarkerField: 'preserve bpm marker metadata'
		},
		keyMode: {
			source: 'embeddedTags',
			appliedAt: '2026-07-19T09:00:00.000Z',
			futureMarkerField: { reviewed: true }
		},
		futureAppliedField: ['preserve', 2]
	},
	match: {
		confidence: 'high',
		score: 94,
		reasons: ['Artist and title agree'],
		warnings: ['Legacy match was stored globally'],
		futureMatchField: { policy: 'legacy-policy' }
	},
	sources: {
		rekordboxXml: {
			importedAt: '2026-07-18T08:45:00.000Z',
			fileName: 'collection.xml',
			name: 'Asterism',
			artist: 'Synthetic Artist',
			album: 'Synthetic Release',
			genre: 'Techno',
			locationHint: 'Synthetic Artist/Synthetic Release/Asterism.wav',
			averageBpm: 128,
			tonality: '6A',
			parsedKey: 5,
			parsedMode: 0,
			totalTimeSeconds: 377,
			year: 2025,
			kind: 'WAV File',
			sampleRate: 44100,
			bitRate: 1411,
			rating: 4,
			playCount: 12,
			comments: 'Peak-time mix',
			remixer: null,
			label: 'Synthetic Label',
			dateAdded: '2026-07-01',
			futureSourceField: { color: 'blue' }
		},
		embeddedTags: {
			importedAt: '2026-07-19T08:45:00.000Z',
			fileName: 'Asterism.wav',
			locationHint: 'Synthetic Artist/Synthetic Release/Asterism.wav',
			fileSize: 66_502_400,
			lastModified: 1_752_913_800_000,
			title: 'Asterism',
			artist: 'Synthetic Artist',
			album: 'Synthetic Release',
			genres: ['Techno'],
			durationSeconds: 377,
			bpm: 128,
			key: 'F minor',
			futureSourceField: ['tag-reader-vNext']
		},
		essentiaBrowser: {
			importedAt: '2026-07-20T10:30:00.000Z',
			analyzerVersion: 'essentia-0.1.3-rhythm-v1',
			configurationVersion: 'continuous-center-180s-v1',
			bpm: 127.99,
			bpmConfidence: 0.87,
			bpmEstimates: [127.99, 64, 128.01],
			key: 'F',
			scale: 'minor',
			keyStrength: 0.73,
			sampleRate: 44100,
			durationSeconds: 377,
			analyzedDurationSeconds: 180,
			analysisOffsetSeconds: 98.5,
			warnings: [],
			futureSourceField: { window: 'center' }
		},
		futureAnalyzer: {
			analyzerVersion: 'future-v1',
			scores: [0.7, 0.8]
		}
	},
	futureRootField: { retained: true }
}

export const migratedTrackEvidenceV2Golden: TrackEvidenceV2MigratedV1 = {
	version: 2,
	modelVersion: 'latest-per-source-v1',
	origin: 'v1-migrated',
	updatedAt: '2026-07-20T10:30:00.000Z',
	applied: { bpm: null, keyMode: null },
	sources: {
		rekordboxXml: {
			kind: 'legacy-v1',
			observationId: null,
			observedAt: '2026-07-18T08:45:00.000Z',
			match: null,
			data: {
				fileName: 'collection.xml',
				name: 'Asterism',
				artist: 'Synthetic Artist',
				album: 'Synthetic Release',
				genre: 'Techno',
				locationHint: 'Synthetic Artist/Synthetic Release/Asterism.wav',
				averageBpm: 128,
				tonality: '6A',
				parsedKey: 5,
				parsedMode: 0,
				totalTimeSeconds: 377,
				year: 2025,
				kind: 'WAV File',
				sampleRate: 44100,
				bitRate: 1411,
				rating: 4,
				playCount: 12,
				comments: 'Peak-time mix',
				remixer: null,
				label: 'Synthetic Label',
				dateAdded: '2026-07-01',
				rekordboxTrackId: null
			},
			limitations: [
				'missing-observation-id',
				'missing-source-match',
				'missing-rekordbox-track-id'
			],
			unknownFields: { futureSourceField: { color: 'blue' } }
		},
		embeddedTags: {
			kind: 'legacy-v1',
			observationId: null,
			observedAt: '2026-07-19T08:45:00.000Z',
			match: null,
			data: {
				fileName: 'Asterism.wav',
				locationHint: 'Synthetic Artist/Synthetic Release/Asterism.wav',
				fileSize: 66_502_400,
				lastModified: 1_752_913_800_000,
				title: 'Asterism',
				artist: 'Synthetic Artist',
				album: 'Synthetic Release',
				genres: ['Techno'],
				durationSeconds: 377,
				bpm: 128,
				key: 'F minor'
			},
			limitations: ['missing-observation-id', 'missing-source-match'],
			unknownFields: { futureSourceField: ['tag-reader-vNext'] }
		},
		essentiaBrowser: {
			kind: 'legacy-v1',
			observationId: null,
			observedAt: '2026-07-20T10:30:00.000Z',
			match: null,
			data: {
				analyzerVersion: 'essentia-0.1.3-rhythm-v1',
				configurationVersion: 'continuous-center-180s-v1',
				bpm: 127.99,
				bpmConfidence: 0.87,
				bpmEstimates: [127.99, 64, 128.01],
				key: 'F',
				scale: 'minor',
				keyStrength: 0.73,
				sampleRate: 44100,
				durationSeconds: 377,
				analyzedDurationSeconds: 180,
				analysisOffsetSeconds: 98.5,
				warnings: []
			},
			limitations: ['missing-observation-id', 'missing-source-match'],
			unknownFields: { futureSourceField: { window: 'center' } }
		}
	},
	legacy: {
		sourceVersion: 1,
		limitations: [
			'unattributed-global-match',
			'missing-application-values-and-observation-ids'
		],
		applied: {
			bpm: {
				source: 'rekordboxXml',
				appliedAt: '2026-07-18T09:00:00.000Z',
				unknownFields: {
					futureMarkerField: 'preserve bpm marker metadata'
				}
			},
			keyMode: {
				source: 'embeddedTags',
				appliedAt: '2026-07-19T09:00:00.000Z',
				unknownFields: { futureMarkerField: { reviewed: true } }
			}
		},
		globalMatch: {
			confidence: 'high',
			score: 94,
			reasons: ['Artist and title agree'],
			warnings: ['Legacy match was stored globally'],
			unknownFields: {
				futureMatchField: { policy: 'legacy-policy' }
			}
		},
		unknownFields: {
			root: { futureRootField: { retained: true } },
			applied: { futureAppliedField: ['preserve', 2] },
			sources: {
				futureAnalyzer: {
					analyzerVersion: 'future-v1',
					scores: [0.7, 0.8]
				}
			}
		}
	}
}

export const currentTrackEvidenceV2Golden: TrackEvidenceV2FullyCurrent = {
	version: 2,
	modelVersion: 'latest-per-source-v1',
	origin: 'v2',
	updatedAt: '2026-07-21T12:00:00.000Z',
	applied: {
		bpm: {
			source: 'rekordboxXml',
			observationId: 'obs-rbx-20260721-001',
			value: 128,
			appliedAt: '2026-07-21T12:01:00.000Z'
		},
		keyMode: {
			source: 'embeddedTags',
			observationId: 'obs-tags-20260721-001',
			value: { key: 5, mode: 0 },
			appliedAt: '2026-07-21T12:01:00.000Z'
		}
	},
	sources: {
		rekordboxXml: {
			kind: 'observation',
			observationId: 'obs-rbx-20260721-001',
			observedAt: '2026-07-21T11:58:00.000Z',
			match: {
				confidence: 'high',
				score: 96,
				reasons: ['Rekordbox ID and metadata agree'],
				warnings: [],
				matcherPolicyVersion: 'identity-match-v2'
			},
			data: {
				fileName: 'collection.xml',
				name: 'Asterism',
				artist: 'Synthetic Artist',
				album: 'Synthetic Release',
				genre: 'Techno',
				locationHint: 'Synthetic Artist/Synthetic Release/Asterism.wav',
				averageBpm: 128,
				tonality: '6A',
				parsedKey: 5,
				parsedMode: 0,
				totalTimeSeconds: 377,
				year: 2025,
				kind: 'WAV File',
				sampleRate: 44100,
				bitRate: 1411,
				rating: 4,
				playCount: 12,
				comments: null,
				remixer: null,
				label: 'Synthetic Label',
				dateAdded: '2026-07-01',
				rekordboxTrackId: 'RBX-1024'
			}
		},
		embeddedTags: {
			kind: 'observation',
			observationId: 'obs-tags-20260721-001',
			observedAt: '2026-07-21T11:59:00.000Z',
			match: {
				confidence: 'medium',
				score: 82,
				reasons: ['Filename and duration agree'],
				warnings: ['Artist tag punctuation differs'],
				matcherPolicyVersion: 'identity-match-v2'
			},
			data: {
				fileName: 'Asterism.wav',
				locationHint: 'Synthetic Artist/Synthetic Release/Asterism.wav',
				fileSize: 66_502_400,
				lastModified: 1_752_913_800_000,
				title: 'Asterism',
				artist: 'Synthetic Artist',
				album: 'Synthetic Release',
				genres: ['Techno'],
				durationSeconds: 377,
				bpm: 128.01,
				key: 'F minor'
			}
		},
		essentiaBrowser: {
			kind: 'observation',
			observationId: 'obs-analysis-20260721-001',
			observedAt: '2026-07-21T12:00:00.000Z',
			match: {
				confidence: 'medium',
				score: 82,
				reasons: ['Bound to the reviewed local file identity'],
				warnings: [],
				matcherPolicyVersion: 'identity-match-v2'
			},
			data: {
				analyzerVersion: 'essentia-0.1.3-rhythm-v1',
				configurationVersion: 'continuous-center-180s-v1',
				bpm: 127.99,
				bpmConfidence: 0.87,
				bpmEstimates: [127.99, 64, 128.01],
				key: 'F',
				scale: 'minor',
				keyStrength: 0.73,
				sampleRate: 44100,
				durationSeconds: 377,
				analyzedDurationSeconds: 180,
				analysisOffsetSeconds: 98.5,
				warnings: []
			}
		}
	},
	legacy: null
}

/**
 * The first current observation on a v1 row replaces only its own source slot.
 * Untouched source observations and the unattributed v1 envelope remain intact.
 */
export const mixedTrackEvidenceV2Golden = {
	...migratedTrackEvidenceV2Golden,
	origin: 'v2',
	updatedAt: '2026-07-21T12:00:00.000Z',
	applied: {
		bpm: currentTrackEvidenceV2Golden.applied.bpm,
		keyMode: null
	},
	sources: {
		...migratedTrackEvidenceV2Golden.sources,
		rekordboxXml: currentTrackEvidenceV2Golden.sources.rekordboxXml
	},
	legacy: migratedTrackEvidenceV2Golden.legacy
} satisfies TrackEvidenceV2Current
