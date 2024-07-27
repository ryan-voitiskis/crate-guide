<template>
  <div class="small-screen-warning">
    <h2>Small screen warning</h2>
    <p>
      Crate Guide has not been designed to work on small screens. A future
      update may provide a different interface for small screens.
    </p>
    <label class="checkbox">
      <input type="checkbox" v-model="form.understood" /> I know it doesn't work
      on small screens.
    </label>
    <button
      class="primary"
      type="submit"
      @click="$emit('close')"
      :disabled="!form.understood"
    >
      View anyway
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive } from "vue"

const form = reactive({
  understood: false,
})
</script>

<style scoped lang="scss">
.small-screen-warning {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  width: 100%;
  z-index: 1000;
  position: absolute;
  top: 0;
  left: 0;
  background: var(--page-bg);
  padding: 10px;
}

.checkbox {
  margin: 20px;
  input {
    margin-right: 20px;
  }
}

button {
  width: 100%;
  margin-bottom: 40px;
}
</style>
