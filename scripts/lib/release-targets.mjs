export const releaseOrganization = 'grxffkeajwssrcfwtxny'
export const releaseRepository = 'ryan-voitiskis/crate-guide'

export const releaseTargets = Object.freeze({
	production: Object.freeze({
		projectRef: 'czlfiwivlgqhqezmywfx',
		projectName: 'crate-guide',
		pagesProject: 'crate-guide',
		origin: 'https://crate.guide'
	}),
	staging: Object.freeze({
		projectRef: 'xrekloexiottvfueijgb',
		projectName: 'crate-guide-staging',
		pagesProject: 'crate-guide-staging',
		origin: 'https://crate-guide-staging.pages.dev'
	})
})

export function releaseTarget(environment) {
	if (!Object.hasOwn(releaseTargets, environment)) {
		throw new Error('Environment must be exactly production or staging.')
	}
	return releaseTargets[environment]
}

export function parseReleaseArguments(args, required, optional = []) {
	const values = {}
	for (let index = 0; index < args.length; index += 2) {
		const name = args[index]?.replace(/^--/, '')
		if (
			args[index] !== `--${name}` ||
			![...required, ...optional].includes(name) ||
			Object.hasOwn(values, name) ||
			!args[index + 1] ||
			args[index + 1].startsWith('--')
		)
			throw new Error('Unknown, duplicate, or incomplete release argument.')
		values[name] = args[index + 1]
	}
	if (required.some((name) => !values[name])) {
		throw new Error(
			`Required arguments: ${required.map((name) => `--${name}`).join(', ')}.`
		)
	}
	return values
}

export function releaseOrigin(target, value = target.origin) {
	const url = new URL(value)
	const pagesDomain = `${target.pagesProject}.pages.dev`
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.port ||
		url.pathname !== '/' ||
		url.search ||
		url.hash ||
		!(
			url.origin === target.origin ||
			url.hostname === pagesDomain ||
			new RegExp(`^[a-f0-9]{8}\\.${pagesDomain.replaceAll('.', '\\.')}$`).test(
				url.hostname
			)
		)
	)
		throw new Error(
			'Smoke URL must be the selected environment or its immutable Pages deployment.'
		)
	return url.origin
}
