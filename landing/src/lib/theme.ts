export type ThemeChoice = 'light' | 'dark'

/** Shared with the web app (same origin, same key), so the chosen theme follows the user into the app. */
export const THEME_STORAGE_KEY = 'theme'

/** Runs before first paint to apply the stored or system theme without a flash. */
export const themeBootScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`
