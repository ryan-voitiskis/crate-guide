import type {
	LocalAudioWorkerRequest,
	LocalAudioWorkerResponse
} from '~/types/localAudio'
import {
	type EssentiaLike,
	analyzeLocalAudioRequest
} from './localAudioAnalysisCore'

let essentiaInstance: EssentiaLike | null = null

async function getEssentia() {
	if (essentiaInstance) return essentiaInstance
	const [{ default: Essentia }, { EssentiaWASM }] = await Promise.all([
		import('essentia.js/dist/essentia.js-core.es.js'),
		import('essentia.js/dist/essentia-wasm.es.js')
	])
	essentiaInstance = new Essentia(EssentiaWASM)
	return essentiaInstance
}

self.onmessage = async (event: MessageEvent<LocalAudioWorkerRequest>) => {
	const request = event.data
	let response: LocalAudioWorkerResponse
	try {
		response = {
			id: request.id,
			result: analyzeLocalAudioRequest(request, await getEssentia())
		}
	} catch (error) {
		response = {
			id: request.id,
			error: error instanceof Error ? error.message : String(error)
		}
	}
	self.postMessage(response)
}
