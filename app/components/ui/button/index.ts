import { type VariantProps, cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

// TODO: remove unused variants and sizes on final cleanup
export const buttonVariants = cva(
	'focus-visible:ring-ring inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/80 shadow-sm',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
				outline:
					'text-foreground hover:border-primary/70 border shadow-xs hover:no-underline',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/60',
				ghost: 'hover:underline',
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

export type ButtonVariants = VariantProps<typeof buttonVariants>
