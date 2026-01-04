import { ref, onMounted } from 'vue'

const currentTheme = ref('dark')
const accentColor = ref('blue')

const colorsMap = {
  blue: 'var(--blue-rgb)',
  green: 'var(--green-rgb)',
  purple: 'var(--purple-rgb)',
  red: 'var(--red-rgb)',
  orange: 'var(--orange-rgb)',
  yellow: 'var(--yellow-rgb)'
}

export function useTheme() {

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme.value)

    const rgb = colorsMap[accentColor.value] || colorsMap.blue
    document.documentElement.style.setProperty('--main-color-rgb', rgb)

    localStorage.setItem('user-theme', currentTheme.value)
    localStorage.setItem('user-accent', accentColor.value)
  }

  function toggleTheme() {
    currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark'
    applyTheme()
  }

  function setAccent(colorName) {
    if (colorsMap[colorName]) {
      accentColor.value = colorName
      applyTheme()
    }
  }

  onMounted(() => {
    const savedTheme = localStorage.getItem('user-theme')
    const savedAccent = localStorage.getItem('user-accent')

    if (savedTheme) {
      currentTheme.value = savedTheme
    } else {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        currentTheme.value = 'light'
      }
    }

    if (savedAccent) {
      accentColor.value = savedAccent
    }

    applyTheme()
  })

  return {
    currentTheme,
    accentColor,
    toggleTheme,
    setAccent,
    availableColors: Object.keys(colorsMap)
  }
}
