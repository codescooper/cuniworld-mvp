/**
 * legal.js — Pages légales : mentions, CGU, confidentialité.
 *
 * Cadre juridique : Côte d'Ivoire (juridiction principale), aligné sur les
 * standards internationaux les plus exigeants :
 *
 *   - Loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la protection
 *     des données à caractère personnel (autorité de contrôle : ARTCI).
 *   - Convention de l'Union Africaine sur la cybersécurité et la protection
 *     des données à caractère personnel (Malabo, 2014).
 *   - RGPD — Règlement UE 2016/679 (applicabilité extraterritoriale pour
 *     les utilisateurs résidant dans l'EEE).
 *   - Actes uniformes OHADA pour le droit commercial (vente, factures,
 *     procédures collectives).
 *   - Loi ivoirienne n° 2016-410 du 15 juin 2016 relative à la protection
 *     du consommateur.
 *   - Loi ivoirienne n° 2013-451 du 19 juin 2013 relative à la lutte
 *     contre la cybercriminalité.
 *
 * Les valeurs propres à l'éditeur (adresse exacte, RCCM) sont centralisées
 * dans LEGAL_CONFIG ci-dessous. Tant qu'une valeur commence par
 * "À COMPLÉTER", les pages affichent un bandeau d'avertissement visible.
 */

import { escapeHTML } from './utils.js';

// ── Config à remplir par l'éditeur ───────────────────────────────────────────

export const LEGAL_CONFIG = {
  editorName:        'Code Scooper (éditeur individuel)',
  editorAddress:     'À COMPLÉTER — Adresse postale exacte à Abidjan, Côte d\'Ivoire',
  editorEmail:       'codescooper@gmail.com',
  editorPhone:       '',
  editorRegistration:'À COMPLÉTER — N° RCCM (Registre du Commerce et du Crédit Mobilier) + Compte Contribuable',
  publicationLead:   'Code Scooper',
  hostingProvider:   'Vercel Inc.',
  hostingAddress:    '440 N Barranca Ave #4133, Covina, CA 91723, USA',
  hostingContact:    'https://vercel.com/contact',
  dataController:    'Identique à l\'éditeur ci-dessus',
  dpoContact:        '',
  applicableLaw:     'Droit ivoirien — notamment la loi n° 2013-450 du 19 juin 2013 (protection des données), la loi n° 2016-410 du 15 juin 2016 (protection du consommateur) et les Actes uniformes OHADA (droit commercial). Les exigences du RGPD (UE 2016/679) sont par ailleurs respectées pour les utilisateurs résidant dans l\'Espace Économique Européen.',
  jurisdiction:      'Tribunal de Commerce d\'Abidjan (Côte d\'Ivoire)',
  supervisoryAuthority: 'ARTCI — Autorité de Régulation des Télécommunications/TIC de Côte d\'Ivoire (https://www.artci.ci)',
  effectiveDate:     '2026-05-18',
};

export function isLegalConfigComplete() {
  return !Object.values(LEGAL_CONFIG).some(v =>
    typeof v === 'string' && v.startsWith('À COMPLÉTER')
  );
}

// ── Rendu d'une page légale ──────────────────────────────────────────────────

const PAGES = {
  legal:   { title: 'Mentions légales',           build: _buildLegal   },
  cgu:     { title: 'Conditions générales d\'utilisation', build: _buildCGU },
  privacy: { title: 'Politique de confidentialité', build: _buildPrivacy },
};

export function renderLegalPage(slug) {
  const page = PAGES[slug];
  if (!page) return `<p>Page introuvable.</p>`;

  const warning = isLegalConfigComplete() ? '' : `
    <div class="legal-warning" role="alert">
      ⚠️ Ces informations légales contiennent des placeholders. Avant tout déploiement
      commercial, complétez <code>src/legal.js → LEGAL_CONFIG</code>
      (notamment le numéro RCCM et l'adresse postale exacte).
    </div>`;

  return `
    <article class="legal-page">
      <header class="legal-header">
        <h1>${escapeHTML(page.title)}</h1>
        <p class="legal-meta">En vigueur le ${escapeHTML(LEGAL_CONFIG.effectiveDate)}</p>
      </header>
      ${warning}
      ${page.build()}
      <footer class="legal-footer">
        <a href="#" data-legal-page="legal">Mentions légales</a> ·
        <a href="#" data-legal-page="cgu">CGU</a> ·
        <a href="#" data-legal-page="privacy">Confidentialité</a>
      </footer>
    </article>`;
}

// ── Contenu des 3 pages ──────────────────────────────────────────────────────

function _buildLegal() {
  const c = LEGAL_CONFIG;
  return `
    <section>
      <h2>Éditeur du service</h2>
      <p><strong>${escapeHTML(c.editorName)}</strong><br>
      ${escapeHTML(c.editorAddress)}<br>
      Email : <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a><br>
      ${c.editorPhone ? `Téléphone : ${escapeHTML(c.editorPhone)}<br>` : ''}
      ${c.editorRegistration ? `Immatriculation : ${escapeHTML(c.editorRegistration)}<br>` : ''}
      Directeur de la publication : ${escapeHTML(c.publicationLead)}</p>
    </section>
    <section>
      <h2>Hébergement</h2>
      <p>${escapeHTML(c.hostingProvider)}<br>
      ${escapeHTML(c.hostingAddress)}<br>
      Contact : <a href="${escapeHTML(c.hostingContact)}" target="_blank" rel="noopener">${escapeHTML(c.hostingContact)}</a></p>
      <p class="small">Les bases de données et le stockage objet sont opérés par Supabase
      Inc. (région Union Européenne, eu-west) — voir la Politique de confidentialité pour
      le détail des sous-traitants et des transferts.</p>
    </section>
    <section>
      <h2>Propriété intellectuelle</h2>
      <p>L'ensemble des contenus (textes, interfaces, logos, code source) sont la propriété
      exclusive de l'éditeur, sauf mention contraire. Toute reproduction, représentation ou
      diffusion non autorisée constitue une contrefaçon sanctionnée par les articles
      pertinents du Code de la propriété intellectuelle ivoirien et les traités
      internationaux (Convention de Berne, Accord ADPIC).</p>
      <p>Les données saisies par l'utilisateur (lapins, événements, photos) restent
      la propriété exclusive de cet utilisateur. Voir la section « Données saisies »
      des CGU pour le détail.</p>
    </section>
    <section>
      <h2>Signalement de contenu illicite</h2>
      <p>Tout contenu manifestement illicite peut être signalé à
      <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a>.
      L'éditeur s'engage à examiner le signalement dans un délai raisonnable et, le cas
      échéant, à retirer ou désactiver l'accès au contenu concerné conformément à la loi
      n° 2013-451 du 19 juin 2013 relative à la lutte contre la cybercriminalité.</p>
    </section>
    <section>
      <h2>Loi applicable et juridiction</h2>
      <p>${escapeHTML(c.applicableLaw)}</p>
      <p>Tout litige sera porté devant <strong>${escapeHTML(c.jurisdiction)}</strong>,
      sauf disposition impérative contraire de la loi du domicile du consommateur.</p>
    </section>`;
}

function _buildCGU() {
  const c = LEGAL_CONFIG;
  return `
    <section>
      <h2>1. Objet</h2>
      <p>Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'utilisation
      de <strong>CuniWorld</strong>, application web progressive (PWA) de gestion d'élevage
      de lapins, éditée par ${escapeHTML(c.editorName)} et accessible à l'adresse
      <a href="https://cuniworld.app" target="_blank" rel="noopener">https://cuniworld.app</a>
      ou via toute déclinaison déployée par l'éditeur.</p>
    </section>
    <section>
      <h2>2. Acceptation</h2>
      <p>L'utilisation du service vaut acceptation pleine et entière des présentes CGU.
      L'utilisateur déclare avoir la capacité juridique de contracter en application du
      droit ivoirien (article 1108 du Code civil applicable et législation OHADA pour
      l'usage à fins commerciales). Pour les mineurs, l'usage requiert l'autorisation
      expresse d'un représentant légal.</p>
    </section>
    <section>
      <h2>3. Création et sécurité du compte</h2>
      <p>La création de compte requiert une adresse email valide et un mot de passe robuste
      (8 caractères minimum). L'utilisateur est seul responsable de la confidentialité de
      ses identifiants et de toute activité réalisée sur son compte. Toute compromission
      suspectée doit être notifiée sans délai à
      <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a>.</p>
    </section>
    <section>
      <h2>4. Données saisies et propriété</h2>
      <p>L'utilisateur conserve l'entière propriété des données qu'il saisit (lapins,
      événements, photos, ventes, paramètres ferme). L'éditeur n'acquiert aucun droit sur
      ces données autre que celui de les héberger et les rendre accessibles à l'utilisateur
      conformément aux finalités décrites dans la Politique de confidentialité.</p>
      <p>L'utilisateur peut <strong>exporter</strong> (format JSON et CSV) ou
      <strong>supprimer</strong> ses données à tout moment depuis le panneau Actions de
      l'application, conformément à l'article 17 du RGPD (droit à l'effacement) et à
      l'article 19 de la loi ivoirienne n° 2013-450.</p>
    </section>
    <section>
      <h2>5. Disponibilité du service</h2>
      <p>Le service est fourni « en l'état » et « selon disponibilité », sans garantie de
      disponibilité continue. L'éditeur met en œuvre les moyens raisonnables pour assurer
      l'accès au service (objectif indicatif de disponibilité 99 %) et se réserve le droit
      d'interrompre temporairement le service pour maintenance, mise à jour ou pour des
      raisons de sécurité, en avertissant les utilisateurs lorsque possible.</p>
      <p>Le mode hors-ligne (PWA) garantit la continuité de consultation et de saisie des
      données locales même en l'absence de connexion au service distant.</p>
    </section>
    <section>
      <h2>6. Obligations de l'utilisateur</h2>
      <p>L'utilisateur s'engage à :</p>
      <ul>
        <li>fournir des informations exactes lors de l'inscription ;</li>
        <li>ne pas utiliser le service à des fins illicites, frauduleuses ou portant
        atteinte aux droits de tiers ;</li>
        <li>ne pas tenter de contourner les mesures de sécurité, ni de procéder à du
        reverse-engineering hors des limites prévues par la loi ;</li>
        <li>respecter le bien-être animal conformément aux bonnes pratiques d'élevage ;</li>
        <li>respecter, le cas échéant, les droits des acheteurs au titre de la loi
        n° 2016-410 du 15 juin 2016 relative à la protection du consommateur.</li>
      </ul>
    </section>
    <section>
      <h2>7. Limitation de responsabilité</h2>
      <p>CuniWorld est un outil d'aide à la gestion. Les décisions sanitaires (vaccins,
      traitements vétérinaires), reproductives et commerciales relèvent de la seule
      responsabilité de l'éleveur. L'éditeur ne saurait être tenu responsable :</p>
      <ul>
        <li>des pertes économiques ou animales liées à l'usage ou au mésusage de l'application ;</li>
        <li>des dommages indirects (perte de chiffre d'affaires, perte de réputation) ;</li>
        <li>de l'indisponibilité temporaire du service due à un cas de force majeure,
        une panne d'un fournisseur tiers (hébergeur, opérateur télécom) ou une attaque
        informatique malveillante.</li>
      </ul>
      <p>En toute hypothèse, la responsabilité de l'éditeur, si elle venait à être
      retenue, est limitée au montant effectivement perçu de l'utilisateur au cours des
      douze (12) derniers mois.</p>
    </section>
    <section>
      <h2>8. Résiliation</h2>
      <p>L'utilisateur peut supprimer son compte à tout moment depuis le panneau Actions
      → « Supprimer mon compte ». La suppression est irréversible et déclenche
      l'effacement des données conformément aux délais indiqués dans la Politique de
      confidentialité.</p>
      <p>L'éditeur peut suspendre ou résilier un compte en cas de manquement grave aux
      présentes CGU, d'usage frauduleux ou de comportement portant atteinte à la sécurité
      du service. L'utilisateur en est informé par email lorsque possible.</p>
    </section>
    <section>
      <h2>9. Modification des CGU</h2>
      <p>L'éditeur peut modifier les CGU pour refléter une évolution légale, technique ou
      fonctionnelle. Les utilisateurs sont informés via l'application au moins
      <strong>15 jours</strong> avant l'entrée en vigueur des nouvelles versions. La
      poursuite de l'utilisation du service vaut acceptation des nouvelles CGU.</p>
    </section>
    <section>
      <h2>10. Données personnelles</h2>
      <p>Le traitement des données à caractère personnel est régi par la
      <a href="#" data-legal-page="privacy">Politique de confidentialité</a>, qui fait
      partie intégrante des présentes CGU.</p>
    </section>
    <section>
      <h2>11. Loi applicable et juridiction</h2>
      <p>${escapeHTML(c.applicableLaw)}</p>
      <p>Avant toute action judiciaire, les parties s'efforceront de résoudre tout
      différend à l'amiable. À défaut de résolution amiable, tout litige sera porté
      devant <strong>${escapeHTML(c.jurisdiction)}</strong>, sous réserve des règles
      impératives de procédure applicables au consommateur.</p>
    </section>`;
}

function _buildPrivacy() {
  const c = LEGAL_CONFIG;
  return `
    <section>
      <h2>Cadre normatif</h2>
      <p>La présente politique est établie en conformité avec :</p>
      <ul>
        <li><strong>Loi ivoirienne n° 2013-450</strong> du 19 juin 2013 relative à la
        protection des données à caractère personnel ;</li>
        <li><strong>Convention de l'Union Africaine</strong> sur la cybersécurité et la
        protection des données à caractère personnel (Malabo, 27 juin 2014) ;</li>
        <li><strong>RGPD — Règlement (UE) 2016/679</strong>, applicable aux personnes
        résidant dans l'Espace Économique Européen ;</li>
        <li><strong>Loi n° 2013-451</strong> du 19 juin 2013 relative à la lutte contre
        la cybercriminalité (sécurité du traitement).</li>
      </ul>
    </section>
    <section>
      <h2>Responsable du traitement</h2>
      <p>${escapeHTML(c.dataController)}.<br>
      Contact : <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a>
      ${c.dpoContact ? ` · DPO : <a href="mailto:${escapeHTML(c.dpoContact)}">${escapeHTML(c.dpoContact)}</a>` : ''}</p>
      <p class="small">Autorité de contrôle compétente : ${escapeHTML(c.supervisoryAuthority)}.
      Pour les résidents de l'EEE, l'autorité de contrôle nationale du pays de résidence est
      également compétente.</p>
    </section>
    <section>
      <h2>Données collectées</h2>
      <ul>
        <li><strong>Compte</strong> : email, mot de passe haché (bcrypt), prénom et nom
        facultatifs.</li>
        <li><strong>Données métier</strong> : lapins (code, nom, race, cage, parents),
        événements (saillies, mises-bas, pesées, vaccins, traitements, ventes), photos,
        paramètres ferme, comptabilité.</li>
        <li><strong>Données de commande</strong> (boutique publique) : nom, téléphone,
        email, adresse de livraison, message libre de l'acheteur invité.</li>
        <li><strong>Données techniques</strong> : journaux d'accès Vercel (IP
        partiellement anonymisée, user-agent, URL, code retour, durée), version de build,
        identifiants d'erreurs Sentry le cas échéant.</li>
        <li><strong>Stockage local</strong> : copie chiffrée par le navigateur des données
        métier (localStorage, IndexedDB) pour le fonctionnement hors-ligne.</li>
      </ul>
      <p><strong>Aucun cookie publicitaire, traceur tiers ni profilage comportemental</strong>
      n'est utilisé. Aucune donnée n'est revendue à des tiers.</p>
    </section>
    <section>
      <h2>Finalités du traitement</h2>
      <ul>
        <li>Fournir le service de gestion d'élevage commandé par l'utilisateur ;</li>
        <li>Synchroniser les données entre les appareils de l'utilisateur ;</li>
        <li>Envoyer les rappels d'élevage (notifications navigateur) ;</li>
        <li>Permettre la mise en relation entre éleveurs et acheteurs via la boutique ;</li>
        <li>Détecter, prévenir et corriger les incidents de sécurité et les abus ;</li>
        <li>Respecter les obligations légales (conservation des factures, etc.).</li>
      </ul>
    </section>
    <section>
      <h2>Bases légales</h2>
      <ul>
        <li><strong>Exécution du contrat</strong> (CGU) : compte, données métier, commandes.</li>
        <li><strong>Mesures précontractuelles</strong> à la demande de la personne :
        commande boutique invité.</li>
        <li><strong>Intérêt légitime</strong> de l'éditeur : journaux techniques, lutte
        anti-fraude, sécurité du service.</li>
        <li><strong>Obligation légale</strong> : conservation des factures (durée définie
        par la législation fiscale applicable).</li>
        <li><strong>Consentement</strong> : notifications navigateur (révocable à tout
        moment depuis les paramètres du navigateur).</li>
      </ul>
    </section>
    <section>
      <h2>Destinataires des données</h2>
      <ul>
        <li><strong>Sous-traitants ultimes</strong> :
          <ul>
            <li>Supabase Inc. (USA, instance UE eu-west) — hébergement BDD, authentification, stockage objet ;</li>
            <li>Vercel Inc. (USA) — hébergement front-end et journaux HTTP ;</li>
            <li>Resend Inc. (USA) — envoi d'emails transactionnels, le cas échéant.</li>
          </ul>
        </li>
        <li><strong>Membres de la ferme</strong> : les données métier sont visibles par les
        membres invités selon leur rôle (propriétaire, admin, membre, viewer).</li>
        <li><strong>Visiteurs anonymes</strong> : uniquement les lapins explicitement
        marqués en vente et leurs photos sont visibles publiquement.</li>
        <li>Aucune donnée n'est transmise à un tiers à des fins commerciales ou publicitaires.</li>
      </ul>
    </section>
    <section>
      <h2>Transferts hors de Côte d'Ivoire</h2>
      <p>Les données sont hébergées en région <strong>Union Européenne (eu-west)</strong>
      par Supabase Inc. Les éventuels transferts vers les États-Unis (Vercel, Resend) sont
      encadrés par les <strong>Clauses Contractuelles Types</strong> de la Commission
      Européenne et, lorsque applicable, par le <strong>EU-US Data Privacy Framework</strong>.</p>
      <p>Pour les utilisateurs résidant en Côte d'Ivoire, ces transferts sont considérés
      comme appropriés au sens de la loi n° 2013-450, sous réserve d'éventuelles
      instructions contraires de l'ARTCI.</p>
    </section>
    <section>
      <h2>Durée de conservation</h2>
      <ul>
        <li><strong>Compte actif</strong> : tant que l'utilisateur l'utilise.</li>
        <li><strong>Compte supprimé</strong> : effacement immédiat en base, jusqu'à 90 jours
        dans les sauvegardes glissantes (purgées par rotation).</li>
        <li><strong>Journaux d'accès</strong> : 12 mois maximum.</li>
        <li><strong>Sauvegardes</strong> : 90 jours glissants.</li>
        <li><strong>Données de commande / facturation</strong> : 10 ans après la fin de
        l'exercice comptable (obligation OHADA).</li>
      </ul>
    </section>
    <section>
      <h2>Mesures de sécurité</h2>
      <p>Conformément à l'article 16 de la loi n° 2013-450 et à l'article 32 du RGPD,
      l'éditeur met en œuvre les mesures techniques et organisationnelles suivantes :</p>
      <ul>
        <li>Chiffrement TLS 1.2+ pour toutes les communications réseau ;</li>
        <li>Mot de passe haché avec algorithme à coût élevé (bcrypt) ;</li>
        <li>Cloisonnement par <em>Row-Level Security</em> PostgreSQL (RLS) : chaque ferme
        ne peut accéder qu'à ses propres données — audit ligne par ligne documenté ;</li>
        <li>Tests d'intégration automatisés (194 tests unitaires + tests E2E) incluant
        des scénarios anti-XSS ;</li>
        <li>Monitoring d'erreurs en production (Sentry) et page de status publique ;</li>
        <li>Sauvegardes quotidiennes et procédure de restauration documentée et testée
        périodiquement ;</li>
        <li>Procédure d'incident interne (<em>runbook</em>) pour notifier les personnes
        concernées et l'ARTCI sous 72 heures en cas de violation, conformément à
        l'article 21 de la loi n° 2013-450 et à l'article 33 du RGPD.</li>
      </ul>
    </section>
    <section>
      <h2>Vos droits</h2>
      <p>Vous disposez des droits suivants, exercables à
      <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a> :</p>
      <ul>
        <li><strong>Accès</strong> : un export complet JSON est disponible 24/7 dans
        l'application (Actions → Exporter les données).</li>
        <li><strong>Rectification</strong> : modification directe dans l'application ou
        sur demande.</li>
        <li><strong>Effacement</strong> (« droit à l'oubli ») : bouton « Supprimer mon
        compte » dans Actions, ou sur demande.</li>
        <li><strong>Portabilité</strong> : le format JSON exporté est lisible par toute
        autre application — vous restez maître de vos données.</li>
        <li><strong>Opposition</strong> au traitement fondé sur l'intérêt légitime de
        l'éditeur.</li>
        <li><strong>Limitation</strong> du traitement dans les cas prévus par la loi.</li>
        <li><strong>Retrait du consentement</strong> à tout moment lorsque le traitement
        est fondé sur celui-ci (notifications notamment).</li>
        <li><strong>Réclamation</strong> auprès de l'autorité de contrôle compétente :
        ${escapeHTML(c.supervisoryAuthority)}.</li>
      </ul>
      <p>Délai de réponse aux demandes : <strong>30 jours maximum</strong>, prolongeable
      de 60 jours en cas de complexité justifiée.</p>
    </section>
    <section>
      <h2>Cookies et stockage local</h2>
      <p>CuniWorld n'utilise <strong>aucun cookie publicitaire ni traceur tiers</strong>.
      Seuls sont utilisés :</p>
      <ul>
        <li><strong>localStorage</strong> et <strong>IndexedDB</strong> du navigateur :
        cache des données métier pour le fonctionnement hors-ligne, file de mutations en
        attente de synchronisation, préférences UI (thème, panneau actif, langue, choix
        de consentement).</li>
        <li><strong>Cookies d'authentification</strong> Supabase, strictement nécessaires
        à la persistance de la session utilisateur (durée : jusqu'à déconnexion ou
        expiration du jeton, typiquement 7 jours).</li>
      </ul>
      <p>Ces éléments sont purement techniques et ne nécessitent pas de consentement
      préalable au sens de la directive ePrivacy et de la loi ivoirienne n° 2013-546.</p>
    </section>
    <section>
      <h2>Modifications de la politique</h2>
      <p>La présente politique peut évoluer pour refléter une évolution légale ou
      fonctionnelle. La date d'entrée en vigueur figure en tête de page. Toute modification
      substantielle est notifiée aux utilisateurs via l'application au moins 15 jours
      avant son entrée en vigueur.</p>
    </section>`;
}
