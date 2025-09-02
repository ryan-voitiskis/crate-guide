import { useField } from 'vee-validate'

// Validation strategy: wait for user to finish typing (blur), then provide real-time feedback on errors
export function useValidation(fieldName: () => string) {
	const { errorMessage, handleChange, handleBlur } = useField(
		fieldName,
		undefined,
		{ validateOnValueUpdate: false }
	)

	const validationListeners = computed(() => ({
		blur: (evt: Event) => handleBlur(evt, true),
		change: handleChange,
		input: (evt: Event) => handleChange(evt, !!errorMessage.value)
	}))

	return {
		errorMessage,
		validationListeners
	}
}
