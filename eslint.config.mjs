import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
	files: ['**/*.ts', '**/*.vue'],
	rules: {
		'no-console': 'off',
		'vue/require-default-prop': 'off',
		'vue/html-self-closing': 'off',
		'vue/component-tags-order': [
			'error',
			{
				order: [['script'], ['template'], ['style']]
			}
		]
	}
})
