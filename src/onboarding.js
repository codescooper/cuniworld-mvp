/**
 * onboarding.js — Tour de bienvenue 3 étapes à la première connexion.
 *
 * Trigger : `state.rabbits.length === 0` ET pas de flag `onboardingDismissed`
 * en localStorage. L'utilisateur peut ignorer (le flag est posé) ou suivre :
 *   1. Bienvenue + résumé des fonctionnalités
 *   2. Création du premier lapin (utilise le bouton existant)
 *   3. Pointer vers Paramètres + Documentation
 *
 * Pas de dépendances : un simple overlay HTML inséré dans body.
 * Volontairement minimal — l'app a déjà un "Mode Guide" plus complet
 * (cf. guide.js) qui sert de tutoriel récurrent ; onboarding.js ne sert
 * qu'à éviter l'effet "page vide".
 */

const STORAGE_KEY = 'cuniworld_onboarding_dismissed';

export function shouldShowOnboarding(state) {
  if (!state || !Array.isArray(state.rabbits)) return false;
  if (state.rabbits.length > 0) return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return false;
  } catch (_) { /* localStorage inaccessible : on montre quand même */ }
  return true;
}

export function markOnboardingDone() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
}

export function resetOnboarding() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/**
 * Affiche l'overlay si l'état le justifie. Retourne true si affiché.
 *
 * @param {object} ctx — ctx applicatif (pour relancer `btnNewRabbit?.click()`)
 */
export function showOnboardingIfNeeded(ctx) {
  if (!shouldShowOnboarding(ctx.state)) return false;
  _renderOverlay(ctx);
  return true;
}

function _renderOverlay(ctx) {
  // Idempotence : on remplace si déjà présent
  document.getElementById('onboardingOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'onboardingOverlay';
  overlay.className = 'onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'onboardingTitle');
  overlay.innerHTML = `
    <div class="onboarding-card">
      <button class="onboarding-close" id="onboardingSkip" type="button" aria-label="Ignorer le tutoriel">✕</button>

      <div class="onboarding-step" data-step="1">
        <div class="onboarding-icon" aria-hidden="true">🐇</div>
        <h2 id="onboardingTitle">Bienvenue dans CuniWorld</h2>
        <p>Gérez votre élevage de lapins en quelques clics : cheptel, reproduction, santé, boutique.</p>
        <ul class="onboarding-list">
          <li>📱 Fonctionne <strong>hors-ligne</strong> sur mobile (PWA)</li>
          <li>☁️ Synchronisation cloud en option (multi-appareils)</li>
          <li>📊 Stats, comptabilité, carnet sanitaire imprimable</li>
        </ul>
        <div class="onboarding-actions">
          <button class="btn secondary" id="onboardingSkipBtn" type="button">Passer</button>
          <button class="btn" id="onboardingNext1" type="button">Commencer →</button>
        </div>
      </div>

      <div class="onboarding-step" data-step="2" hidden>
        <div class="onboarding-icon" aria-hidden="true">➕</div>
        <h2>Étape 1/2 — Enregistrez votre premier lapin</h2>
        <p>Le plus simple : ouvrez le formulaire de création pour saisir un reproducteur (code, nom, sexe, cage). Pas de panique, tout est modifiable plus tard.</p>
        <div class="onboarding-actions">
          <button class="btn secondary" id="onboardingPrev2" type="button">← Retour</button>
          <button class="btn" id="onboardingCreate" type="button">+ Nouveau lapin</button>
        </div>
      </div>

      <div class="onboarding-step" data-step="3" hidden>
        <div class="onboarding-icon" aria-hidden="true">🎯</div>
        <h2>Étape 2/2 — Pour aller plus loin</h2>
        <p>Quand votre cheptel s'étoffe :</p>
        <ul class="onboarding-list">
          <li>⚙️ <strong>Actions → Paramètres ferme</strong> : devise, cycle de pesée, prix vif/carcasse</li>
          <li>📖 <strong>Documentation</strong> dans la nav latérale : guide complet</li>
          <li>📊 <strong>Stats</strong> : tableau de bord temps réel</li>
        </ul>
        <div class="onboarding-actions">
          <button class="btn secondary" id="onboardingPrev3" type="button">← Retour</button>
          <button class="btn" id="onboardingFinish" type="button">C'est parti ✓</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const setStep = (n) => {
    overlay.querySelectorAll('.onboarding-step').forEach(el => {
      el.hidden = (Number(el.dataset.step) !== n);
    });
  };

  const dismiss = () => {
    markOnboardingDone();
    overlay.remove();
  };

  overlay.querySelector('#onboardingSkip')?.addEventListener('click', dismiss);
  overlay.querySelector('#onboardingSkipBtn')?.addEventListener('click', dismiss);
  overlay.querySelector('#onboardingNext1')?.addEventListener('click', () => setStep(2));
  overlay.querySelector('#onboardingPrev2')?.addEventListener('click', () => setStep(1));
  overlay.querySelector('#onboardingPrev3')?.addEventListener('click', () => setStep(2));
  overlay.querySelector('#onboardingCreate')?.addEventListener('click', () => {
    dismiss();
    // Ouvre le formulaire de création — le bouton existe toujours dans la top-bar.
    document.getElementById('btnNewRabbit')?.click();
  });
  overlay.querySelector('#onboardingFinish')?.addEventListener('click', dismiss);

  // Echap pour fermer.
  const onKey = (e) => {
    if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
}
