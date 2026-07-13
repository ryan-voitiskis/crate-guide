import { z } from 'zod'

export const emailSchema = z
	.string()
	.trim()
	.min(1, 'Email is required')
	.max(254, 'Email cannot exceed 254 characters')
	.email('Enter a valid email address')

export const newPasswordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.max(64, 'Password cannot exceed 64 characters')
	.regex(/[a-z]/, 'Password must include a lowercase letter')
	.regex(/[A-Z]/, 'Password must include an uppercase letter')
	.regex(/[0-9]/, 'Password must include a digit')
