<script setup lang="ts">
const props = defineProps<{
	release: DiscogsReleaseToFilter
}>()

const coverImg = `url("${props.release.basic_information.cover_image}")`
</script>

<template>
	<div class="record">
		<div class="cover"></div>
		<h3 class="title">{{ release.basic_information.title }}</h3>
		<div class="label">
			<span class="catno">
				{{ release.basic_information.labels[0]?.catno }}
			</span>
			{{ release.basic_information.labels[0]?.name }}
			<span class="year">{{ release.basic_information.year }}</span>
		</div>
		<span class="artists">
			{{
				release.basic_information.artists
					.map((artist) => artist.name)
					.join(', ')
			}}
		</span>
		<Checkbox v-model="release.selected" />
	</div>
</template>

<style scoped lang="scss">
.record {
	background: var(--item-bg);
	display: grid;
	grid-template-columns: 90px 1fr 40px;
	grid-template-rows: 40px 20px 30px;
	width: 100%;
	.cover {
		grid-area: 1 / 1 / 5 / 2;
		background-image: v-bind(coverImg);
		overflow: hidden;
		z-index: 0;
		background-repeat: no-repeat;
		background-size: contain;
	}
	h3.title {
		color: var(--darker-text);
		grid-area: 1 / 2 / 2 / 3;
		line-height: 40px;
		margin: 0 0 0 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.label {
		grid-area: 2 / 2 / 3 / 3;
		line-height: 20px;
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
		grid-area: 3 / 2 / 4 / 3;
		line-height: 30px;
		margin: 0 0 0 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.controls {
		grid-area: 1 / 3 / 4 / 4;
		button {
			width: 100%;
			height: 100%;
			align-items: center;
			justify-content: center;
			display: flex;
			font-size: 12px;
		}
	}
}
</style>
