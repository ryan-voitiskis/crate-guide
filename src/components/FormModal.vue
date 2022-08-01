<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <div class="form-header">
        <h2>{{ title }}</h2>
        <button class="close" type="button" @click="$emit('close')">
          <XIcon />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { defineProps } from "vue"
import XIcon from "@/components/svg/XIcon.vue"

defineProps({
  title: String,
})
</script>

<style lang="scss">
.modal-backdrop {
  position: fixed;
  background: rgba(0, 0, 0, 0.4);
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  .modal {
    background: #fff;
    border-radius: 1rem;
    width: 440px;
    form {
      width: 100%;
      margin: 0;
    }
    button {
      margin: 0;
      &.close {
        background: var(--btn-secondary);
        border: none;
        &:hover {
          background: var(--btn-secondary-hover);
        }
      }

      &.primary {
        background: var(--btn-primary);
        font: 600 1.6rem/3.8rem Manrope, sans-serif;
        color: var(--white-text);
        border: none;
        &:hover {
          background: var(--btn-primary-hover);
        }
      }
    }
    .form-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      padding: 1.8rem 4rem;
      h2 {
        font-weight: 500;
        color: var(--darkest-text);
        line-height: 3.8rem;
      }
      .close {
        padding: 0 0.8rem;
        svg {
          path {
            fill: var(--darkest-text);
          }
        }
      }
    }
    .form-fields {
      box-sizing: border-box;
      padding: 0 4rem;
      display: grid;
      gap: 1.4rem 2.8rem;
      grid-template-columns: [labels] auto [inputs] 1fr;
      width: 100%;
      margin-bottom: 2rem;
      label {
        margin: 0;
        line-height: 3.8rem;
        align-self: center;
        font-weight: 300;
        color: var(--darker-text);
        grid-column: labels;
        &.checkbox {
          grid-column: 1 / 3;
          text-align: center;
        }
      }
      input {
        margin: 0;
        grid-column: inputs;
        &[type="checkbox"] {
          justify-self: start;
        }
      }
    }
    .form-controls {
      gap: 2rem;
      padding: 2rem 4rem;
      box-sizing: border-box;
      width: 100%;
      display: flex;
      justify-content: end;
      background: var(--btn-secondary);
      border-radius: 0 0 1rem 1rem;
    }
  }
}
</style>
