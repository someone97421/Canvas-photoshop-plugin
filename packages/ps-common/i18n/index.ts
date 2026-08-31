// 导出类型
export * from './locales'
import i18n from 'i18next'
export { t, getCurrentLanguage, changeLanguage, setTranslationText } from './core'

// React 相关导出
export { useTranslation } from './react'

export { I18nextProvider } from 'react-i18next'
export { i18n }
export default i18n
