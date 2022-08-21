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
    .form-header {
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
        padding: 0 0.8rem;
      }
    }
    // for InfoDropdown.vue and other similar elements within the form
    .form-hint {
      box-sizing: border-box;
      padding: 0 4rem;
      margin: -2rem 0 1rem 0;
    }
    .form-body {
      box-sizing: border-box;
      padding: 0 4rem;
      margin-bottom: 4rem;

      p {
        text-align: center;
        color: var(--dark-text);
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
        svg {
          fill: #fff;
        }
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
