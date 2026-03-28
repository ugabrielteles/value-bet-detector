import { useI18nStore } from '../store/i18nStore'
import { translations } from '../i18n/translations'

export function useI18n() {
  const locale = useI18nStore((s) => s.locale)
  const setLocale = useI18nStore((s) => s.setLocale)
  const dict = translations[locale]

  return {
    locale,
    setLocale,
    dict,
  }
}
