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
        class="inline-btn edit"
        @click="records.toEdit = _id"
        :disabled="records.checkboxed.length !== 0"
      >
        <PencilIcon />Edit
      </button>
      <button
        class="inline-btn delete"
        @click="records.toDelete.push(_id)"
        :disabled="records.checkboxed.length !== 0"
      >
        <TrashIcon />Delete
      </button>
      <button
        v-show="user.authd.settings.selectedCrate === 'all'"
        class="inline-btn add"
        @click="records.toCrate.push(_id)"
        :disabled="records.checkboxed.length !== 0"
      >
        <FolderDownIcon />Add to crate
      </button>
      <button
        v-show="user.authd.settings.selectedCrate !== 'all'"
        class="inline-btn edit"
        @click="records.fromCrate.push(_id)"
        :disabled="records.checkboxed.length !== 0"
      >
        <FolderMinusIcon />Remove from crate
      </button>
      <button
        class="inline-btn add add-track"
        @click="trackStore().addTrackTo = _id"
        :disabled="records.checkboxed.length !== 0"
      >
        <PlusCircleIcon />Add track
      </button>
    </div>
    <div class="tracks">
      <TrackSingleShort
        v-for="track in sortedTracks"
        :track="track"
        :key="track._id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive, watch, computed } from "vue"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import FolderDownIcon from "@/components/icons/FolderDownIcon.vue"
import PencilIcon from "@/components/icons/PencilIcon.vue"
import PlusCircleIcon from "@/components/icons/PlusCircleIcon.vue"
import { Track } from "@/interfaces/Track"
import TrackSingleShort from "./TrackSingleShort.vue"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import FolderMinusIcon from "@/components/icons/FolderMinusIcon.vue"
const records = recordStore()
const user = userStore()

const props = defineProps<{
  _id: string
  cover?: string
  catno?: string
  title: string
  artists: string
  label?: string
  year?: number
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
    if (state.checked && !records.checkboxed.includes(props._id))
      records.checkboxed.push(props._id)
    else if (!state.checked && records.checkboxed.includes(props._id))
      records.checkboxed = records.checkboxed.filter((i) => i !== props._id)
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

const coverImg = computed(() => `url("${props.cover}")`)
</script>

<style scoped lang="scss">
.record {
  background: linear-gradient(to right, hsl(10, 24%, 96%), hsl(35, 24%, 96%));
  display: grid;
  grid-template-columns: 120px 4fr 6fr;
  grid-template-rows: 40px 20px 30px 30px;
  width: 100%;
  .cover {
    background-color: hsl(40, 13%, 82%);
    background-image: v-bind(coverImg);
    grid-area: 1 / 1 / 5 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
  }
  .checkbox-hitbox {
    grid-area: 1 / 1 / 5 / 2;
    z-index: 1;
  }
  h3.title {
    display: flex;
    align-items: center;
    color: var(--darker-text);
    grid-area: 1 / 2 / 2 / 3;
    margin: 0 0 0 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    grid-area: 2 / 2 / 3 / 3;
    font-size: 12px;
    margin: 0 0 0 10px;
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
    display: flex;
    align-items: center;
    grid-area: 3 / 2 / 4 / 3;
    margin: 0 0 0 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    button {
      margin: 0 10px;
      font-size: 12px;
      &.add-track {
        float: right;
      }
      &:disabled {
        cursor: default;
        color: var(--lighter-text);
        svg {
          color: var(--lighter-text);
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
