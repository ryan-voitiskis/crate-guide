import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
	{
		ignores: ['docs/tmp/**']
	},
	{
		files: ['**/*.ts', '**/*.vue'],
		rules: {
			'no-console': 'off',
			'vue/require-default-prop': 'off',
			'vue/html-self-closing': 'off',
			'vue/block-order': [
				'error',
				{
					order: [['script'], ['template'], ['style']]
				}
			]
		}
	}
)
