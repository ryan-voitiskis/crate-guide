import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
	files: ['**/*.ts', '**/*.tsx'],
	rules: {
		'no-console': 'off',
		'vue/component-tags-order': [
			'error',
			{
				order: [['script'], ['template'], ['style']]
			}
		]
	}
})
