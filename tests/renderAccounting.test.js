import { describe, it, expect, beforeEach } from 'vitest';
import { renderAccounting } from '../src/renderAccounting.js';
import { Store } from '../src/store.js';

// Smoke test du panneau Comptabilité : il doit se rendre dans #accountingDash
// sans lever d'erreur, exposer ses 4 onglets, et permettre la saisie d'une
// transaction manuelle (chemin Store.save + re-render).
function makeCtx() {
  return {
    Store,
    farmId: null,
    farmSettings: { currencyCode: 'XOF', currencySymbol: 'FCFA' },
    state: {
      rabbits: [], events: [], stock: [], stockMovements: [],
      transactions: [], recurringCharges: [],
    },
    navigate: null,
    render() {},
  };
}

describe('renderAccounting — panneau', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="accountingDash"></div>';
  });

  it('rend les 4 onglets et les tuiles de synthèse', () => {
    renderAccounting(makeCtx());
    const root = document.getElementById('accountingDash');
    const tabs = [...root.querySelectorAll('[data-acc-tab]')].map(b => b.dataset.accTab);
    expect(tabs).toEqual(['overview', 'journal', 'pl', 'recurring']);
    expect(root.textContent).toContain('Solde trésorerie');
    expect(root.querySelector('#accExportCsv')).toBeTruthy();
  });

  it('affiche le formulaire de saisie dans l\'onglet Journal et enregistre une transaction', () => {
    const ctx = makeCtx();
    renderAccounting(ctx);
    // basculer sur l'onglet Journal
    document.querySelector('[data-acc-tab="journal"]').click();
    const form = document.getElementById('accTxForm');
    expect(form).toBeTruthy();

    // remplir et soumettre
    form.elements.direction.value = 'out';
    form.elements.category.value = 'aliment';
    form.elements.date.value = '2026-05-01';
    form.elements.amount.value = '5000';
    form.elements.description.value = 'Test sac';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(ctx.state.transactions).toHaveLength(1);
    expect(ctx.state.transactions[0]).toMatchObject({ direction: 'out', category: 'aliment', amount: 5000 });
    // la ligne apparaît dans le journal re-rendu
    expect(document.getElementById('accLedgerList').textContent).toContain('Test sac');
  });
});
