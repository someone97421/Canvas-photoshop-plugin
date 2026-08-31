import i18n from 'i18next'
import { initReactI18next, useTranslation as useI18nextTranslation } from 'react-i18next'
import { type TranslationKey, type TranslationOptions } from './locales'
import { getMergedTranslations, setTranslationText as coreSetTranslationText, getCurrentLanguage, setTranslationChangeCallback } from './core'

// 初始化 i18next
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        'zh-CN': {
          translation: getMergedTranslations('zh-CN')
        },
        'en-US': {
          translation: getMergedTranslations('en-US')
        }
      },
      lng: getCurrentLanguage(),
      fallbackLng: 'en-US',
      interpolation: {
        escapeValue: false
      }
    })
    
  // 注册回调，当 core 中的翻译文本变化时自动更新 i18next
  setTranslationChangeCallback((language) => {
    i18n.addResourceBundle(language, 'translation', getMergedTranslations(language), true, true)
    // 实际切换 i18next 的当前语言
    i18n.changeLanguage(language)
  })
}

/**
 * React Hook for translations
 */
export function useTranslation() {
  const { t: i18nT, i18n: i18nInstance } = useI18nextTranslation()
  
  const t = (key: TranslationKey, options?: TranslationOptions): string => {
    return i18nT(key, options)
  }
  
  return {
    t,
    changeLanguage: (lng: 'zh-CN' | 'en-US') => i18nInstance.changeLanguage(lng),
    language: i18nInstance.language as 'zh-CN' | 'en-US',
    isZhCN: () => i18nInstance.language === 'zh-CN'
  }
}

export default i18n