export function formatReleaseDisplayTitle(
	release: DiscogsReleaseToFilter
): string {
	return release.basic_information.labels[0]?.catno
		? `${release.basic_information.labels[0].catno} - ${release.basic_information.title}`
		: `${release.basic_information.title}`
}

export function formatFullReleaseDisplayTitle(
	release: DiscogsReleaseFull
): string {
	return release.labels[0]?.catno
		? `${release.labels[0].catno} - ${release.title}`
		: `${release.title}`
}
