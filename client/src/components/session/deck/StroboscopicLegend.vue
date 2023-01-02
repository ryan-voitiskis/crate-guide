<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 128 128"
    stroke="currentColor"
    class="stroboscopic-legend"
  >
    <line stroke-width="4" x1="112" y1="16" x2="112" y2="64" />
    <line stroke-width="4" x1="112" y1="96" x2="112" y2="112" />
    <line stroke-width="4" x1="92" y1="16" x2="114" y2="16" />
    <line stroke-width="4" x1="92" y1="112" x2="114" y2="112" />
    <circle fill="currentColor" cx="10" cy="16" r="6" />
    <circle fill="currentColor" cx="10" cy="48" r="6" />
    <circle fill="currentColor" cx="10" cy="80" r="10" />
    <circle fill="currentColor" cx="10" cy="112" r="6" />
    <text x="46" y="16" dominant-baseline="central">6.4</text>
    <text x="46" y="48" dominant-baseline="central">3.3</text>
    <text x="46" y="80" dominant-baseline="central">0</text>
    <text x="46" y="112" dominant-baseline="central">3.3</text>
    <text x="26" y="16" dominant-baseline="central">+</text>
    <line stroke-width="4" x1="28" y1="112" x2="40" y2="112" />
    <text x="112" y="80" text-anchor="middle" dominant-baseline="central">
      %
    </text>
  </svg>
</template>

<style scoped lang="scss">
.stroboscopic-legend {
  width: 50px;
  height: 50px;
  position: absolute;
  left: 4.4%;
  bottom: 13.4%;
  z-index: 1;
  color: var(--loaded-text);
  text {
    font-size: 3rem;
    font-weight: 200;
    font-family: Arial, Helvetica, sans-serif;
    fill: currentColor;
  }
  circle {
    stroke: none;
  }
}
</style>
