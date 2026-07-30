import {
	ANONYMOUS_THEME_STORAGE_KEY,
	WORKSPACE_THEME_MIRROR_STORAGE_KEY
} from '../../shared/constants/theme'

export function buildThemeBootstrapScript(): string {
	const anonymousKey = JSON.stringify(ANONYMOUS_THEME_STORAGE_KEY)
	const mirrorKey = JSON.stringify(WORKSPACE_THEME_MIRROR_STORAGE_KEY)
	return `(()=>{const root=document.documentElement;const validTheme=value=>value==='light'||value==='dark'||value==='auto';const prefersDark=()=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches;let selected='auto';try{const saved=localStorage.getItem(${anonymousKey});if(validTheme(saved))selected=saved;const raw=localStorage.getItem(${mirrorKey});const mirror=raw?JSON.parse(raw):null;const opaqueOwner=mirror&&/^owner:[0-9a-f]{16}$/.test(mirror.ownerTag);const owned=opaqueOwner&&(mirror.location==='cloud'||mirror.location==='browser');if(owned&&validTheme(mirror.theme))selected=mirror.theme}catch{}const resolved=selected==='dark'||(selected==='auto'&&prefersDark())?'dark':'light';root.classList.remove('light','dark');root.classList.add(resolved)})()`
}
