<template>
  <button
    class="rpm-switch"
    :class="this.speed == 45 ? 'second' : ''"
    @click="$emit('activate', speed)"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text x="-120" y="80">{{ speed }}</text>
    </svg>
    <div
      class="indicator-light"
      :class="this.isActive == true ? 'active' : ''"
    ></div>
  </button>
</template>

<script lang="ts">
import { defineComponent, reactive } from "vue"

export default defineComponent({
  name: "RpmSwitch",
  props: {
    isActive: Boolean,
    speed: {
      required: true,
      type: Number,
    },
  },
  method: {
    activate() {
      this.$emit("switchRPM", this.speed)
    },
  },
})
</script>

<style scoped lang="scss">
.rpm-switch {
  width: 25/450 * 100%;
  height: 8/350 * 100%;
  border: 0.3rem solid #333;
  border-radius: 0;
  position: absolute;
  bottom: 1/35 * 100%;
  left: 59/450 * 100%;
  padding: 0;
  margin: 0;
  svg {
    font-size: 8rem;
    width: 100%;
    height: 100%;
  }
  &.second {
    left: 82/450 * 100%;
  }
}
.indicator-light {
  width: 22%;
  height: 36%;
  background: #333;
  position: absolute;
  right: 10%;
  top: 30%;
  &.active {
    background: #ff0000;
    box-shadow: 0 0 4px 4px rgba(255, 0, 0, 0.4);
  }
}
</style>
