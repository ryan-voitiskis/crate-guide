import { useField } from 'vee-validate'

// validate on blur until invalid, then validate on input
// https://vee-validate.logaretm.com/v4/guide/composition-api/custom-inputs#handling-events
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
