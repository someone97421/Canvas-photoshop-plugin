import { zhCN, enUS, type TranslationKey, type TranslationOptions } from './locales'

// 语言检测函数
function detectLanguage(): 'zh-CN' | 'en-US' {
  // 1. 优先检测 navigator.language (浏览器环境)
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language === "zh-CN" ? 'zh-CN' : 'en-US'
  }
  
  // 2. 检测 UXP 环境
  try {
    //@ts-ignore
    const require_ = typeof require !== 'undefined' ? require : undefined
    if (require_) {
      const uxp = require_('uxp')
      return uxp.host.uiLocale.startsWith("zh") ? 'zh-CN' : 'en-US'
    }
  } catch {}
  
  // 3. 默认英文
  return 'en-US'
}

// 当前语言
let currentLanguage: 'zh-CN' | 'en-US' = detectLanguage()

// 运行时覆盖的翻译文本
const translationOverrides: {
  'zh-CN': Partial<Record<TranslationKey, string>>
  'en-US': Partial<Record<TranslationKey, string>>
} = {
  'zh-CN': {},
  'en-US': {}
}

/**
 * 获取合并后的翻译资源
 */
export function getMergedTranslations(language: 'zh-CN' | 'en-US') {
  const baseTranslations = language === 'zh-CN' ? zhCN : enUS
  const overrides = translationOverrides[language]
  return { ...baseTranslations, ...overrides }
}

// 回调函数，用于通知 React 模块更新
let onTranslationChange: ((language: 'zh-CN' | 'en-US') => void) | null = null

/**
 * 设置翻译变更回调（内部使用）
 */
export function setTranslationChangeCallback(callback: (language: 'zh-CN' | 'en-US') => void) {
  onTranslationChange = callback
}

/**
 * 修改特定语言的特定key的文本
 */
export function setTranslationText(
  language: 'zh-CN' | 'en-US', 
  key: TranslationKey, 
  text: string
): void {
  translationOverrides[language][key] = text
  // 通知 React 模块更新
  if (onTranslationChange) {
    onTranslationChange(language)
  }
}

/**
 * 切换语言
 */
export function changeLanguage(language: 'zh-CN' | 'en-US'): void {
  currentLanguage = language
  // 通知 React 模块更新
  if (onTranslationChange) {
    onTranslationChange(language)
  }
}

/**
 * 获取当前语言
 */
export function getCurrentLanguage(): 'zh-CN' | 'en-US' {
  return currentLanguage
}

/**
 * 检查是否为中文
 */
export function isZhCN(): boolean {
  return currentLanguage === 'zh-CN'
}

/**
 * 翻译函数
 */
export function t(key: TranslationKey, options: TranslationOptions = {}): string {
  const translations = getMergedTranslations(currentLanguage)
  let value = translations[key]
  
  if (!value) return key
  
  // 支持参数替换 {{paramName}}
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (match, paramName) => 
      options[paramName] !== undefined ? String(options[paramName]) : match
    )
  }
  
  return value as string
}