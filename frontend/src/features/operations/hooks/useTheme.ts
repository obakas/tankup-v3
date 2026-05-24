import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const storageKey = 'tankup-theme'

const getInitialTheme = (): Theme => {
  const savedTheme = window.localStorage.getItem(storageKey)

  return savedTheme === 'dark' ? 'dark' : 'light'
}

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(storageKey, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggleTheme }
}
