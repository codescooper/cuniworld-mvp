/**
 * i18n.js — Internationalisation minimaliste pour CuniWorld.
 *
 * Pas de framework : un simple dictionnaire `LOCALE → key → string`. La
 * locale active est résolue dans cet ordre :
 *   1. URL `?lang=fr|en` (utile pour des liens de partage anglophones)
 *   2. localStorage `cuniworld_lang`
 *   3. `navigator.language` si commence par "en"
 *   4. "fr" par défaut.
 *
 * L'API publique :
 *   t(key, vars?)      — retourne la traduction. Fallback : la clé elle-même.
 *   getLocale()        — locale active.
 *   setLocale(lang)    — bascule + persiste.
 *   available()        — locales connues.
 *
 * Stratégie : on n'extrait QUE les clés utilisateur-facing les plus
 * fréquentes (nav, boutons d'action, KPI labels). Le contenu métier
 * reste en français — internationaliser TOUT le texte serait un projet
 * en soi (3-4 semaines). Ce module sert de fondation à étendre.
 */

const DICT = {
  fr: {
    'nav.dashboard':     'Tableau de bord',
    'nav.rabbits':       'Mes Lapins',
    'nav.lots':          'Lots & Jeunes',
    'nav.genealogy':     'Généalogie',
    'nav.buildings':     'Bâtiments',
    'nav.shop':          'Magasin',
    'nav.stats':         'Statistiques',
    'nav.orders':        'Commandes',
    'nav.actions':       'Actions',
    'nav.settings':      'Paramètres',
    'nav.help':          'Documentation',

    'kpi.total':         'Lapins (total)',
    'kpi.active':        'Actifs',
    'kpi.females':       'Femelles actives',
    'kpi.males':         'Mâles actifs',
    'kpi.events7d':      'Événements (7 jours)',
    'kpi.dueSoon':       'Mise-bas bientôt (≤7j)',
    'kpi.remindersSoon': 'Rappels (≤7j)',
    'kpi.remindersLate': 'Rappels en retard',
    'kpi.dead':          'Morts',
    'kpi.liveValue':     'Valeur vif (cheptel)',
    'kpi.carcassValue':  'Valeur carcasse',

    'action.newRabbit':  'Nouveau lapin',
    'action.export':     'Exporter les données',
    'action.import':     'Importer des données',
    'action.print':      'Imprimer',
    'action.cancel':     'Annuler',
    'action.confirm':    'Confirmer',
    'action.save':       'Enregistrer',
    'action.delete':     'Supprimer',
    'action.close':      'Fermer',

    'common.male':       'Mâle',
    'common.female':     'Femelle',
    'common.unknown':    'Inconnu',
    'common.yes':        'Oui',
    'common.no':         'Non',
    'common.loading':    'Chargement…',
  },
  en: {
    'nav.dashboard':     'Dashboard',
    'nav.rabbits':       'My Rabbits',
    'nav.lots':          'Lots & Young',
    'nav.genealogy':     'Genealogy',
    'nav.buildings':     'Buildings',
    'nav.shop':          'Shop',
    'nav.stats':         'Stats',
    'nav.orders':        'Orders',
    'nav.actions':       'Actions',
    'nav.settings':      'Settings',
    'nav.help':          'Help',

    'kpi.total':         'Total rabbits',
    'kpi.active':        'Active',
    'kpi.females':       'Active females',
    'kpi.males':         'Active males',
    'kpi.events7d':      'Events (last 7 days)',
    'kpi.dueSoon':       'Kindling soon (≤7d)',
    'kpi.remindersSoon': 'Reminders (≤7d)',
    'kpi.remindersLate': 'Overdue reminders',
    'kpi.dead':          'Dead',
    'kpi.liveValue':     'Live weight value',
    'kpi.carcassValue':  'Carcass value',

    'action.newRabbit':  'New rabbit',
    'action.export':     'Export data',
    'action.import':     'Import data',
    'action.print':      'Print',
    'action.cancel':     'Cancel',
    'action.confirm':    'Confirm',
    'action.save':       'Save',
    'action.delete':     'Delete',
    'action.close':      'Close',

    'common.male':       'Male',
    'common.female':     'Female',
    'common.unknown':    'Unknown',
    'common.yes':        'Yes',
    'common.no':         'No',
    'common.loading':    'Loading…',
  },
};

const STORAGE_KEY = 'cuniworld_lang';
const FALLBACK = 'fr';
const SUPPORTED = ['fr', 'en'];

let _current = _detect();

function _detect() {
  try {
    if (typeof window !== 'undefined') {
      const url = new URLSearchParams(window.location.search).get('lang');
      if (url && SUPPORTED.includes(url)) return url;
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      const lang = navigator.language.toLowerCase().slice(0, 2);
      if (SUPPORTED.includes(lang)) return lang;
    }
  } catch (_) { /* env restreint : on retombe sur le fallback */ }
  return FALLBACK;
}

export function getLocale() {
  return _current;
}

export function setLocale(lang) {
  if (!SUPPORTED.includes(lang)) throw new Error(`Locale non supportée : ${lang}`);
  _current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
}

export function available() {
  return SUPPORTED.slice();
}

/**
 * Retourne la traduction de `key` dans la locale active, avec fallback FR
 * puis sur la clé elle-même. `vars` permet une interpolation simple :
 * `t('hello.user', { name: 'X' })` avec une valeur `'Bonjour, {name}'`.
 */
export function t(key, vars) {
  const table = DICT[_current] || DICT[FALLBACK];
  let str = table[key] ?? DICT[FALLBACK][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

// Exposé pour les tests
export const _internals = { DICT, STORAGE_KEY };
