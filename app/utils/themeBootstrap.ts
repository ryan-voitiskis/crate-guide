import { ANONYMOUS_THEME_STORAGE_KEY } from '../../shared/constants/theme'

export function buildAnonymousThemeBootstrapScript(): string {
	const storageKey = JSON.stringify(ANONYMOUS_THEME_STORAGE_KEY)
	return `(()=>{const root=document.documentElement;const prefersDark=()=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches;let selected='auto';try{const saved=localStorage.getItem(${storageKey});if(saved==='light'||saved==='dark'||saved==='auto')selected=saved}catch{}const resolved=selected==='dark'||(selected==='auto'&&prefersDark())?'dark':'light';root.classList.remove('light','dark');root.classList.add(resolved)})()`
}
