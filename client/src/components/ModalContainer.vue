<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2 v-if="title">{{ title }}</h2>
        <button class="close" type="button" @click="$emit('close')">
          <XIcon />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import XIcon from "@/components/svg/XIcon.vue"

const props = defineProps<{
  title?: string
  width?: string
}>()

// set default width
const modalWidth = props.width ? props.width : "440px"
</script>

<style lang="scss">
.modal-backdrop {
  .modal {
    width: v-bind(modalWidth);
    margin: 1rem;
  }
}

.modal-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  padding: 3rem 4rem;
  h2 {
    font-weight: 500;
    color: var(--darkest-text);
    line-height: 3.8rem;
    margin: 0 2rem 0 0;
  }
  .close {
    margin-left: auto; // right align when no h2
    padding: 0 0.8rem;
  }
}

.modal-body {
  box-sizing: border-box;
  padding: 0 4rem;
  margin-bottom: 4rem;
  p {
    text-align: center;
    color: var(--dark-text);
  }
}

// for more complex forms with multiple control buttons
.modal-controls {
  margin-top: -2rem;
  gap: 2rem;
  padding: 2rem 4rem;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  justify-content: end;
  background: var(--btn-secondary);
  border-radius: 0 0 1rem 1rem;
  button[type="reset"] {
    margin-right: auto;
  }
  button.primary {
    margin-top: unset;
  }
}
</style>
