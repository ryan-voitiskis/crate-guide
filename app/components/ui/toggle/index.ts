import { type VariantProps, cva } from 'class-variance-authority'

export { default as Toggle } from './Toggle.vue'

export const toggleVariants = cva(
	'ring-offset-background hover:bg-muted hover:text-muted-foreground focus-visible:ring-ring data-[state=on]:bg-accent data-[state=on]:text-accent-foreground inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline:
					'border-input hover:bg-accent hover:text-accent-foreground border bg-transparent'
			},
			size: {
				default: 'h-9 px-3',
				badge: 'h-7 rounded-full px-3',
				sm: 'h-8 px-2',
				lg: 'h-10 px-3',
				icon: 'h-9 w-9'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
)

export type ToggleVariants = VariantProps<typeof toggleVariants>
