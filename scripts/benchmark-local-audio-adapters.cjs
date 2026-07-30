const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: options.encoding,
		maxBuffer: options.maxBuffer,
		stdio: ['ignore', 'pipe', 'pipe']
	})
	if (result.status !== 0) {
		const detail =
			String(result.stderr || '').trim() ||
			result.error?.message ||
			'unknown error'
		throw new Error(`${command} failed: ${detail}`)
	}
	return result.stdout
}

function createEssentia() {
	const Essentia = require('../node_modules/essentia.js/dist/essentia.js-core.umd.js')
	const EssentiaWASM = require('../node_modules/essentia.js/dist/essentia-wasm.umd.js')
	return new Essentia(EssentiaWASM)
}

function createNodeBenchmarkAdapters() {
	return {
		fileExists: fs.existsSync,
		readTextFile: (fileName) => fs.readFileSync(fileName, 'utf8'),
		runCommand,
		createEssentia,
		writeStdout: (line) => console.log(line),
		writeStderr: (line) => console.error(line)
	}
}

module.exports = {
	createNodeBenchmarkAdapters,
	runCommand
}
