<script setup lang="ts">
import LoadingSpinner from '@/components/utils/LoadingSpinner.vue'
import { cva } from 'class-variance-authority'

const buttonVariants = cva(
	'ring-offset-background focus-visible:ring-ring inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/80 shadow-sm',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
				outline:
					'border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground hover:border-primary/70 border shadow-xs hover:no-underline',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/60',
				ghost: 'hover:bg-accent hover:text-accent-foreground hover:underline',
				link: 'text-primary underline-offset-4 hover:underline',
				blank: 'whitespace-normal',
				image: 'focus-visible:ring-8'
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 rounded-md px-3 text-xs',
				lg: 'h-10 rounded-md px-8',
				icon: 'h-9 w-9',
				'lg-icon': 'h-12 w-12 p-2',
				'xl-icon': 'h-24 w-24 focus-visible:ring-4',
				image: 'h-full w-full object-cover'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
)

interface Props {
	variant?: NonNullable<Parameters<typeof buttonVariants>[0]>['variant']
	size?: NonNullable<Parameters<typeof buttonVariants>[0]>['size']
	as?: string
	loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	as: 'button',
	loading: false
})
</script>

<template>
	<component
		:is="as"
		:class="
			cn(buttonVariants({ variant, size }), $attrs.class ?? '', 'relative')
		"
		:disabled="loading"
	>
		<span
			v-if="loading"
			class="absolute inset-0 flex items-center justify-center"
		>
			<LoadingSpinner class="opacity-80" />
		</span>
		<div :class="['flex items-center', { 'opacity-0': loading }]">
			<slot />
		</div>
	</component>
</template>
