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
				outline: 'border border-input bg-transparent shadow-xs'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
)

export const toggleGroupItemVariants = cva(
	'inline-flex items-center justify-center text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline:
					'border-r border-input last:border-r-0 bg-transparent hover:bg-accent hover:text-accent-foreground'
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
export type ToggleGroupItemVariants = VariantProps<typeof toggleGroupItemVariants>
