import * as d3 from "d3-interpolate"

function getBPMColour(bpm: number, userTheme: string): string {
  const min = 80 // low end of bpm range clamp
  const max = 170 // high end of bpm range clamp
  let isLight
  if (userTheme === "auto") {
    const pageBackground = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--page-bg")
    //! if light theme --page-bg updated, update condition below: "hsl(0, 0%, 100%)" -> new --page-bg
    isLight = pageBackground === "hsl(40, 20%, 97%)" ? true : false
  } else isLight = userTheme === "light" ? true : false
  const lowColour = isLight ? "hsl(155, 100%, 40%)" : "hsl(155, 100%, 65%)"
  const highColour = isLight ? "hsl(342, 100%, 45%)" : "hsl(342, 100%, 65%)"
  const clampedBpm = Math.min(Math.max(bpm, min), max)
  return d3.interpolateCubehelixLong(
    lowColour,
    highColour
  )((clampedBpm - min) / (max - min))
}
export default getBPMColour
