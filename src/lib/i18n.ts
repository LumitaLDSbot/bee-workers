export type Language = 'es' | 'pt' | 'en';

export const translations: Record<Language, Record<string, string>> = {
  es: {
    'nav.dashboard': 'Panel',
    'nav.shifts': 'Turnos',
    'nav.applications': 'Aplicaciones',
    'nav.settings': 'Ajustes',
    'nav.admin': 'Admin',
    'common.loading': 'Cargando...',
    'common.error': 'Ha ocurrido un error',
    'common.retry': 'Reintentar',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
  },
  pt: {
    'nav.dashboard': 'Painel',
    'nav.shifts': 'Turnos',
    'nav.applications': 'Candidaturas',
    'nav.settings': 'Definições',
    'nav.admin': 'Admin',
    'common.loading': 'A carregar...',
    'common.error': 'Ocorreu um erro',
    'common.retry': 'Tentar novamente',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.shifts': 'Shifts',
    'nav.applications': 'Applications',
    'nav.settings': 'Settings',
    'nav.admin': 'Admin',
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
  },
};

export function createTranslator(language: Language) {
  return function t(key: string): string {
    return translations[language]?.[key] ?? translations.es[key] ?? key;
  };
}
