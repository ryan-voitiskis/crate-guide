<template>
  <div class="record">
    <div class="cover"></div>
    <label class="checkbox-hitbox">
      <input type="checkbox" v-model="state.checked" />
    </label>
    <h3 class="title">{{ title }}</h3>
    <div class="label">
      <span class="catno">{{ catno }}</span> {{ label }}
      <span class="year">{{ year }}</span>
    </div>
    <span class="artists">{{ artists }}</span>
    <div class="controls">
      <button
        class="inline-button edit"
        @click="records.toEdit = id"
        :disabled="records.checkboxed.length !== 0"
      >
        <PencilIcon />Edit
      </button>
      <button
        class="inline-button delete"
        @click="records.toDelete.push(id)"
        :disabled="records.checkboxed.length !== 0"
      >
        <TrashIcon />Delete
      </button>
      <button
        v-show="user.authd.settings.selectedCrate === 'all'"
        class="inline-button add"
        @click="records.toCrate.push(id)"
        :disabled="records.checkboxed.length !== 0"
      >
        <FolderDownIcon />Add to crate
      </button>
      <button
        v-show="user.authd.settings.selectedCrate !== 'all'"
        class="inline-button edit"
        @click="records.fromCrate.push(id)"
        :disabled="records.checkboxed.length !== 0"
      >
        <FolderMinusIcon />Remove from crate
      </button>
      <button
        class="inline-button add add-track"
        @click="trckStore.addTrackTo = id"
        :disabled="records.checkboxed.length !== 0"
      >
        <PlusCircleIcon />Add track
      </button>
    </div>
    <div class="tracks">
      <TrackSingle
        v-for="track in sortedTracks"
        v-bind="track"
        :key="track.id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive, watch, computed } from "vue"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import FolderDownIcon from "../svg/FolderDownIcon.vue"
import PencilIcon from "../svg/PencilIcon.vue"
import PlusCircleIcon from "../svg/PlusCircleIcon.vue"
import Track from "@/interfaces/Track"
import TrackSingle from "./TrackSingle.vue"
import TrashIcon from "../svg/TrashIcon.vue"
import FolderMinusIcon from "../svg/FolderMinusIcon.vue"
const records = recordStore()
const trckStore = trackStore() // ! "trckStore" because conflict w tracks prop
const user = userStore()

const props = defineProps<{
  id: string
  catno?: string
  title: string
  artists: string
  label?: string
  year?: number
  mixable: boolean
  tracks: Track[]
}>()

const state = reactive({
  checked: false,
})

// sort tracks by position
const sortedTracks = computed((): Track[] =>
  [...props.tracks].sort(
    (a: any, b: any) =>
      a.position !== "" && b.position !== ""
        ? a.position.localeCompare(b.position, undefined, {
            sensitivity: "base",
          }) // both a + b defined
        : a.position !== "" && b.position === ""
        ? -1 // a is defined, b is empty: sort a before b
        : a.position === "" && b.position !== ""
        ? 1 // a is empty, b is defined: sort b before a
        : 0 // both a + b empty: keep original order
  )
)

// when checkbox changed, either add or remove record from checkboxed array
watch(
  () => state.checked,
  () => {
    if (state.checked && !records.checkboxed.includes(props.id))
      records.checkboxed.push(props.id)
    else if (!state.checked && records.checkboxed.includes(props.id))
      records.checkboxed = records.checkboxed.filter((i) => i !== props.id)
  }
)

// when checkbox changed, either add or remove record from checkboxed array
watch(
  () => records.checkboxed,
  () => {
    if (records.checkboxed.length === 0) state.checked = false
  }
)

// when select/deselect all checkbox is checked, check this records checkbox
watch(
  () => records.checkAll,
  () => {
    if (records.checkAll === true) state.checked = true
  }
)
</script>

<style scoped lang="scss">
.record {
  background: linear-gradient(to right, hsl(10, 24%, 96%), hsl(35, 24%, 96%));
  display: grid;
  grid-template-columns: 12rem 4fr 6fr;
  grid-template-rows: 4rem 2rem 3rem 3rem;
  width: 100%;
  .cover {
    background-color: hsl(40, 13%, 82%);
    grid-area: 1 / 1 / 5 / 2;
    overflow: hidden;
    z-index: 0;
  }
  .checkbox-hitbox {
    grid-area: 1 / 1 / 5 / 2;
    z-index: 1;
  }
  h3.title {
    color: var(--darker-text);
    grid-area: 1 / 2 / 2 / 3;
    line-height: 4rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label {
    grid-area: 2 / 2 / 3 / 3;
    line-height: 2rem;
    font-size: 1.2rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    .catno {
      font-weight: 600;
    }
    .year {
      color: var(--light-text);
    }
  }
  .artists {
    grid-area: 3 / 2 / 4 / 3;
    line-height: 3rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    button {
      margin: 0 1rem;
      font-size: 1.2rem;
      &.add-track {
        float: right;
      }
      &:disabled {
        cursor: default;
        color: var(--lighter-text);
        svg {
          fill: var(--lighter-text);
        }
      }
    }
  }
  .tracks {
    grid-area: 1 / 3 / 5 / 4;
    overflow-y: scroll;
    scrollbar-color: hsl(210, 46%, 67%) hsla(210, 46%, 84%, 0.437);
    scrollbar-gutter: stable both-edges;
  }
}
</style>