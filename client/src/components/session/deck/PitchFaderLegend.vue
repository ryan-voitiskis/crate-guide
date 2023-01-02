<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 250"
    stroke="currentColor"
    class="pitch-fader-legend"
    stroke-width=".5"
  >
    <line stroke-width="1.4" x1="22" y1="15" x2="22" y2="235" />
    <line stroke-width="6" x1="16" y1="18" x2="22" y2="18" />
    <line stroke-width="6" x1="16" y1="44.75" x2="22" y2="44.75" />
    <line stroke-width="6" x1="16" y1="71.5" x2="22" y2="71.5" />
    <line stroke-width="6" x1="16" y1="98.25" x2="22" y2="98.25" />
    <line stroke-width="6" x1="16" y1="125" x2="22" y2="125" />
    <line stroke-width="6" x1="16" y1="151.75" x2="22" y2="151.75" />
    <line stroke-width="6" x1="16" y1="178.5" x2="22" y2="178.5" />
    <line stroke-width="6" x1="16" y1="205.25" x2="22" y2="205.25" />
    <line stroke-width="6" x1="16" y1="232" x2="22" y2="232" />
    <line stroke-width="1.3" x1="1.4" y1="18" x2="5.5" y2="18" />
    <text x="7" y="18" dominant-baseline="central">8</text>
    <text x="7" y="44.75" dominant-baseline="central">6</text>
    <text x="7" y="71.5" dominant-baseline="central">4</text>
    <text x="7" y="98.25" dominant-baseline="central">2</text>
    <text x="7" y="125" dominant-baseline="central"></text>
    <text x="7" y="151.75" dominant-baseline="central">2</text>
    <text x="7" y="178.5" dominant-baseline="central">4</text>
    <text x="7" y="205.25" dominant-baseline="central">6</text>
    <text x="0" y="232" dominant-baseline="central">+</text>
    <text x="7" y="232" dominant-baseline="central">8</text>
  </svg>
</template>

<style scoped lang="scss">
.pitch-fader-legend {
  width: 24px;
  height: 250px;
  position: absolute;
  right: 84px;
  bottom: 63px;
  z-index: 1;
  color: var(--loaded-text);
  text {
    font-size: 1rem;
    font-weight: 100;
    font-family: Arial, Helvetica, sans-serif;
    fill: currentColor;
  }
}
</style>
