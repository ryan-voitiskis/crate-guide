<template>
  <button class="start" @click="$emit('stopStart')">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text x="6" y="52">start • stop</text>
    </svg>
  </button>
</template>

<script>
export default {}
</script>

<style scoped lang="scss">
.start {
  width: 45/450 * 100%;
  height: 33/350 * 100%;
  border: 0.34rem solid #333;
  border-radius: 0;
  position: absolute;
  bottom: 1/35 * 100%;
  left: 1/45 * 100%;
  padding: 0;
  margin: 0;
  svg {
    width: 100%;
    height: 100%;
  }
}
</style>
