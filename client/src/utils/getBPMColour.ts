import * as d3 from "d3-interpolate"

function getBPMColour(bpm: number): string {
  const min = 80 // low end of bpm range clamp
  const max = 180 // high end of bpm range clamp
  const lowColour = "hsl(190, 94%, 55%)"
  const highColour = "hsl(310, 87%, 46%)"
  const clampedBpm = Math.min(Math.max(bpm, min), max)
  return d3.interpolate(lowColour, highColour)((clampedBpm - min) / (max - min))
}
export default getBPMColour
