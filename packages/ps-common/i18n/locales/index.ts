export { zhCN } from './zh-CN'
export { enUS } from './en-US'

// 类型定义
export type TranslationKey = keyof typeof import('./zh-CN').zhCN
export type TranslationOptions = Record<string, string | number>