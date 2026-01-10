import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as ToggleGroup } from './ToggleGroup.vue'
export { default as ToggleGroupItem } from './ToggleGroupItem.vue'

export const toggleGroupVariants = cva(
	'inline-flex items-center justify-center rounded-md',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline: 'border-input border bg-transparent shadow-xs'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
)

export const toggleGroupItemVariants = cva(
	'hover:bg-muted hover:text-muted-foreground focus-visible:ring-ring data-[state=on]:bg-accent data-[state=on]:text-accent-foreground inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline:
					'border-input hover:bg-accent hover:text-accent-foreground border-r bg-transparent last:border-r-0'
			},
			size: {
				default: 'h-9 min-w-9 px-3',
				sm: 'h-7 min-w-7 px-2',
				lg: 'h-10 min-w-10 px-3'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
)

export type ToggleGroupVariants = VariantProps<typeof toggleGroupVariants>
export type ToggleGroupItemVariants = VariantProps<
	typeof toggleGroupItemVariants
>
