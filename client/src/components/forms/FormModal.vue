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

<script setup lang="ts">
import { defineProps } from "vue"
import XIcon from "@/components/svg/XIcon.vue"

const props = defineProps<{
  title: string
  modalWidth: string
}>()
</script>

<style lang="scss">
.modal-backdrop {
  .modal {
    width: v-bind(modalWidth);
    margin: 1rem;
    form {
      width: 100%;
      margin: 0;
    }
    button {
      margin: 0;
      background: var(--btn-secondary);
      border: none;
      color: var(--dark-text);
      &:hover {
        background: var(--btn-secondary-hover);
        color: var(--darker-text);
      }
      &.primary {
        margin-top: 2rem;
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
      padding: 3rem 4rem;
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
    .form-body {
      box-sizing: border-box;
      padding: 0 4rem;
      margin-bottom: 4rem;
      p {
        text-align: center;
      }
      label {
        display: inline-block;
        font-weight: 300;
        color: var(--darker-text);
      }
      input[type="text"],
      input[type="email"],
      input[type="password"] {
        width: 100%;
      }
      // for simple form modals without a separate controls div
      button.primary {
        width: 100%;
      }
      &.inline-labels {
        display: grid;
        gap: 1.4rem 2.8rem;
        grid-template-columns: [labels] auto [inputs] 1fr;
        width: 100%;
        label {
          margin: 0;
          line-height: 3.8rem;
          align-self: center;
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
            width: unset;
            justify-self: start;
          }
        }
      }
    }
    // for more complex forms with multiple control buttons
    .form-controls {
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
  }
}
</style>
