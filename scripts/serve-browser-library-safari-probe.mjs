import { createServer } from 'vite'

const repositoryRoot = process.cwd()
const portArgumentIndex = process.argv.indexOf('--port')
const requestedPort =
	portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : 41731

if (
	!Number.isInteger(requestedPort) ||
	requestedPort < 1 ||
	requestedPort > 65535
) {
	throw new Error('--port must be an integer between 1 and 65535.')
}

const server = await createServer({
	appType: 'mpa',
	configFile: false,
	logLevel: 'info',
	root: repositoryRoot,
	resolve: {
		alias: [
			{ find: /^~~\//, replacement: `${repositoryRoot}/` },
			{ find: /^~\//, replacement: `${repositoryRoot}/app/` }
		]
	},
	server: {
		host: '127.0.0.1',
		port: requestedPort,
		strictPort: true
	}
})

await server.listen()

const probeUrl = `http://127.0.0.1:${requestedPort}/test/e2e/fixtures/browserLibrarySafariProbe.html`
console.log(`Physical Safari probe ready at ${probeUrl}`)
console.log('Press Ctrl-C after recording the result.')

let stopping = false
async function stop() {
	if (stopping) return
	stopping = true
	await server.close()
}

process.once('SIGINT', () => {
	void stop().finally(() => process.exit(0))
})
process.once('SIGTERM', () => {
	void stop().finally(() => process.exit(0))
})
