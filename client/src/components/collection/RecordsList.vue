<template>
  <div class="controls" v-if="user.hasUser()">
    <button class="icon-button" @click="records.addRecordModal = true">
      <PlusCircleIcon /> Add new record
    </button>
    <button
      class="icon-button"
      @click="records.toCrate = records.checkboxed"
      v-if="records.checkboxed.length"
    >
      <FolderDownIcon />Add selected to
      {{ user.authd.settings.selectedCrate !== "all" ? "another " : "" }}crate
    </button>
    <button
      class="icon-button"
      @click="records.fromCrate = records.checkboxed"
      v-if="
        user.authd.settings.selectedCrate !== 'all' && records.checkboxed.length
      "
    >
      <FolderMinusIcon />Remove selected from crate
    </button>
    <button
      class="icon-button"
      @click="records.toDelete = records.checkboxed"
      v-if="records.checkboxed.length"
    >
      <TrashIcon />Delete selected
    </button>
    <button
      class="icon-button"
      @click="spotify.importDataForSelectedRecords()"
      v-if="records.checkboxed.length && user.authd.isSpotifyOAuthd"
    >
      <SpotifyLogo class="spotify-logo" />Get Spotify data for selected
    </button>
    <button
      v-if="user.hasUser()"
      class="icon-button"
      @click="discogs.selectDiscogsFolderModal = true"
    >
      <ImportIcon />Import from Discogs
    </button>
  </div>
  <div class="sort-controls">
    <label class="checkbox-hitbox">
      <input type="checkbox" v-model="records.checkAll" />
    </label>
    <SortByButton
      class="sort-by-button"
      title="Title"
      :active="state.sortBy === 'title'"
      :reversed="state.titleRvrs"
      @activate="state.sortBy = 'title'"
      @reverse="state.titleRvrs = !state.titleRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Catalog No."
      :active="state.sortBy === 'catno'"
      :reversed="state.catnoRvrs"
      @activate="state.sortBy = 'catno'"
      @reverse="state.catnoRvrs = !state.catnoRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Artists"
      :active="state.sortBy === 'artists'"
      :reversed="state.artistsRvrs"
      @activate="state.sortBy = 'artists'"
      @reverse="state.artistsRvrs = !state.artistsRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Label"
      :active="state.sortBy === 'label'"
      :reversed="state.labelRvrs"
      @activate="state.sortBy = 'label'"
      @reverse="state.labelRvrs = !state.labelRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Year"
      :active="state.sortBy === 'year'"
      :reversed="state.yearRvrs"
      @activate="state.sortBy = 'year'"
      @reverse="state.yearRvrs = !state.yearRvrs"
    />
  </div>
  <div class="record-list">
    <RecordSingle
      v-for="record in sortedRecords"
      v-bind="record"
      :key="record._id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue"
import RecordSingle from "./RecordSingle.vue"
import Record from "@/interfaces/Record"
import SortByButton from "@/components/utility/SortByButton.vue"
import { sortStr, sortNumWithNull } from "@/utils/sortFunctions"
import localeContains from "@/utils/localeContains"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { discogsStore } from "@/stores/discogsStore"
import { spotifyStore } from "@/stores/spotifyStore"
import PlusCircleIcon from "@/components/icons/PlusCircleIcon.vue"
import FolderDownIcon from "@/components/icons/FolderDownIcon.vue"
import FolderMinusIcon from "@/components/icons/FolderMinusIcon.vue"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import SpotifyLogo from "@/components/icons/SpotifyLogo.vue"
import ImportIcon from "../icons/ImportIcon.vue"
const user = userStore()
const crates = crateStore()
const discogs = discogsStore()
const records = recordStore()
const spotify = spotifyStore()
const yearsFilterRx = /^\d{4}\s*-\s*\d{4}$/
const yearFilterRx = /^\d{4}$/

const props = defineProps<{
  searchTitle: string
  searchArtists: string
  filterYear: string
}>()

const state = reactive({
  selectAll: false,
  sortBy: "title",
  titleRvrs: false,
  catnoRvrs: false,
  artistsRvrs: false,
  labelRvrs: false,
  yearRvrs: false,
})

// records from selected crate to display
const recordsByCrate = computed((): Record[] =>
  user.authd.settings.selectedCrate !== "all"
    ? crates
        .getRecordIDsByCrate(user.authd.settings.selectedCrate)
        .map((i) => records.getById(i))
    : records.recordList
)

const titleSearchedRecords = computed((): Record[] =>
  props.searchTitle !== ""
    ? recordsByCrate.value.filter((i) =>
        localeContains(i.title, props.searchTitle)
      )
    : recordsByCrate.value
)

const artistsSearchedRecords = computed((): Record[] =>
  props.searchArtists !== ""
    ? titleSearchedRecords.value.filter((i) =>
        localeContains(i.artists, props.searchArtists)
      )
    : titleSearchedRecords.value
)

const yearFilteredRecords = computed((): Record[] => {
  if (yearsFilterRx.test(props.filterYear.trim())) {
    const years = props.filterYear.matchAll(/\d{4}/g)
    const year1 = parseInt(years.next().value[0])
    const year2 = parseInt(years.next().value[0])
    if (year1 && year2)
      return artistsSearchedRecords.value.filter(
        (i) => year1 <= i.year && i.year <= year2
      )
  } else if (yearFilterRx.test(props.filterYear.trim()))
    return artistsSearchedRecords.value.filter(
      (i) => parseInt(props.filterYear.trim()) === i.year
    )
  return artistsSearchedRecords.value
})

// sort records by title alphabetically
const sortedRecords = computed((): Record[] => {
  switch (state.sortBy) {
    case "catno":
      return [...yearFilteredRecords.value].sort(
        sortStr("catno", state.catnoRvrs)
      )
    case "artists":
      return [...yearFilteredRecords.value].sort(
        sortStr("artists", state.artistsRvrs)
      )
    case "label":
      return [...yearFilteredRecords.value].sort(
        sortStr("label", state.labelRvrs)
      )
    case "year":
      return [...yearFilteredRecords.value].sort(
        sortNumWithNull("year", state.yearRvrs)
      )
    default: // default is title
      return [...yearFilteredRecords.value].sort(
        sortStr("title", state.titleRvrs)
      )
  }
})

// if select/deselect all checkbox is unchecked, clear checkboxed array
watch(
  () => records.checkAll,
  () => {
    if (records.checkAll === false) records.checkboxed = []
  }
)
</script>

<style scoped lang="scss">
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.spotify-logo {
  color: var(--spotify-light-green);
}
.input-controls {
  display: flex;
  column-gap: 10px;
  flex-wrap: wrap;
}
.sort-controls {
  .checkbox-hitbox {
    margin: 0;
  }
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
}
.record-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.sort-by-button {
  width: 120px;
}
</style>
