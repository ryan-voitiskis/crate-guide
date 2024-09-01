import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
	files: ['**/*.ts', '**/*.vue'],
	exclude: ['/client_old', 'server_old'], // TODO: remove before v2.0.0
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
