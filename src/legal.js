/**
 * legal.js — Pages légales : mentions, CGU, confidentialité.
 *
 * Les valeurs dépendantes de l'éditeur (raison sociale, adresse, etc.) sont
 * centralisées dans LEGAL_CONFIG ci-dessous. À remplir avant déploiement
 * commercial. Voir ROADMAP_PRODUCTION.md item 1.1.
 */

import { escapeHTML } from './utils.js';

// ── Config à remplir par l'éditeur ───────────────────────────────────────────
// Tant que les valeurs commencent par "À COMPLÉTER", les pages affichent un
// bandeau d'avertissement clairement visible.

export const LEGAL_CONFIG = {
  editorName:        'Code Scooper (éditeur individuel)',
  editorAddress:     'À COMPLÉTER — Adresse postale',
  editorEmail:       'codescooper@gmail.com',
  editorPhone:       '',
  editorRegistration:'',          // ex. SIREN, NINEA, RCCM, …
  publicationLead:   'Code Scooper',
  hostingProvider:   'Vercel Inc.',
  hostingAddress:    '440 N Barranca Ave #4133, Covina, CA 91723, USA',
  hostingContact:    'https://vercel.com/contact',
  dataController:    'Identique à l\'éditeur ci-dessus',
  dpoContact:        '',          // facultatif — laissez vide si pas de DPO
  applicableLaw:     'Loi sénégalaise et/ou française selon résidence de l\'utilisateur',
  jurisdiction:      'À COMPLÉTER — Tribunal compétent',
  effectiveDate:     '2026-05-17',
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
      commercial, complétez <code>src/legal.js → LEGAL_CONFIG</code>.
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
    </section>
    <section>
      <h2>Propriété intellectuelle</h2>
      <p>L'ensemble des contenus (textes, interfaces, logos, code source) sont la propriété
      exclusive de l'éditeur, sauf mention contraire. Toute reproduction non autorisée est interdite.</p>
    </section>
    <section>
      <h2>Loi applicable</h2>
      <p>${escapeHTML(c.applicableLaw)}. Tout litige sera soumis à
      ${escapeHTML(c.jurisdiction)}.</p>
    </section>`;
}

function _buildCGU() {
  const c = LEGAL_CONFIG;
  return `
    <section>
      <h2>1. Objet</h2>
      <p>Les présentes conditions régissent l'utilisation de <strong>CuniWorld</strong>,
      application web de gestion d'élevage de lapins, accessible en ligne et installable
      comme application progressive (PWA).</p>
    </section>
    <section>
      <h2>2. Acceptation</h2>
      <p>L'utilisation du service vaut acceptation pleine et entière des présentes CGU.
      L'utilisateur déclare avoir la capacité juridique de contracter.</p>
    </section>
    <section>
      <h2>3. Compte utilisateur</h2>
      <p>La création de compte requiert une adresse email valide. L'utilisateur est responsable
      de la confidentialité de ses identifiants et de toute activité sur son compte.</p>
    </section>
    <section>
      <h2>4. Données saisies</h2>
      <p>L'utilisateur reste propriétaire des données qu'il saisit (lapins, événements, photos).
      Il peut les exporter ou les supprimer à tout moment depuis le panneau Actions.</p>
    </section>
    <section>
      <h2>5. Disponibilité</h2>
      <p>Le service est fourni « tel quel », sans garantie de disponibilité continue. L'éditeur
      se réserve le droit d'interrompre temporairement le service pour maintenance.</p>
    </section>
    <section>
      <h2>6. Responsabilité</h2>
      <p>CuniWorld est un outil d'aide à la gestion. Les décisions sanitaires, reproductives
      et commerciales relèvent de la seule responsabilité de l'éleveur. L'éditeur ne peut être
      tenu responsable de pertes économiques ou animales liées à l'usage de l'application.</p>
    </section>
    <section>
      <h2>7. Résiliation</h2>
      <p>L'utilisateur peut supprimer son compte à tout moment depuis les paramètres. L'éditeur
      peut suspendre un compte en cas d'usage abusif ou frauduleux.</p>
    </section>
    <section>
      <h2>8. Modification des CGU</h2>
      <p>L'éditeur peut modifier les CGU. Les utilisateurs sont informés via l'application au
      moins 15 jours avant l'entrée en vigueur des nouvelles versions.</p>
    </section>
    <section>
      <h2>9. Loi applicable</h2>
      <p>${escapeHTML(c.applicableLaw)}.</p>
    </section>`;
}

function _buildPrivacy() {
  const c = LEGAL_CONFIG;
  return `
    <section>
      <h2>Responsable du traitement</h2>
      <p>${escapeHTML(c.dataController)}.<br>
      Contact : <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a>
      ${c.dpoContact ? ` · DPO : <a href="mailto:${escapeHTML(c.dpoContact)}">${escapeHTML(c.dpoContact)}</a>` : ''}</p>
    </section>
    <section>
      <h2>Données collectées</h2>
      <ul>
        <li><strong>Compte</strong> : email, mot de passe haché, nom/prénom optionnels</li>
        <li><strong>Données métier</strong> : lapins, événements, photos, ventes, paramètres ferme</li>
        <li><strong>Techniques</strong> : journaux d'accès Vercel (IP anonymisée, user-agent), version build</li>
      </ul>
      <p>Aucun cookie publicitaire ni traceur tiers n'est utilisé.</p>
    </section>
    <section>
      <h2>Finalités</h2>
      <ul>
        <li>Fournir le service de gestion d'élevage</li>
        <li>Synchroniser les données entre vos appareils</li>
        <li>Envoyer les rappels (notifications navigateur)</li>
        <li>Détecter et corriger les erreurs techniques</li>
      </ul>
    </section>
    <section>
      <h2>Bases légales</h2>
      <p>Exécution du contrat (CGU) pour les données métier ; intérêt légitime de l'éditeur
      pour les journaux techniques anti-abus.</p>
    </section>
    <section>
      <h2>Durée de conservation</h2>
      <ul>
        <li>Compte actif : tant que l'utilisateur l'utilise</li>
        <li>Compte supprimé : suppression effective sous 30 jours</li>
        <li>Journaux d'accès : 12 mois maximum</li>
        <li>Sauvegardes : 90 jours glissants</li>
      </ul>
    </section>
    <section>
      <h2>Vos droits (RGPD)</h2>
      <p>Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et
      d'opposition. Pour les exercer : <a href="mailto:${escapeHTML(c.editorEmail)}">${escapeHTML(c.editorEmail)}</a>.<br>
      Un export complet de vos données est disponible à tout moment depuis le panneau Actions
      (bouton « Exporter »).</p>
    </section>
    <section>
      <h2>Hébergement</h2>
      <p>Les données sont hébergées par Supabase (Union européenne, région eu-west) et servies
      via Vercel. Aucun transfert vers un pays tiers sans clause appropriée.</p>
    </section>`;
}
