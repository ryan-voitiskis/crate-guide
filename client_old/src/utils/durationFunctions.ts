function getDurationString(duration: number): string {
  if (!(duration < 3600000)) return ""
  const min = (Math.floor(duration / 60000) % 60).toString()
  const sec = (Math.floor(duration / 1000) % 60).toString()
  const secFinal = sec.length === 1 ? `0${sec}` : sec
  return `${min}:${secFinal}`
}

function getDurationMs(duration: string): number | null {
  if (!duration) return null
  const durationSplit = duration.split(":")
  return durationSplit.length === 2
    ? parseInt(durationSplit[0]) * 60000 + parseInt(durationSplit[1]) * 1000
    : parseInt(durationSplit[0]) * 1000
}

export { getDurationString, getDurationMs }
