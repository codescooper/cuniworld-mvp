import { Store } from './store.js';

export const STOCK_CATEGORIES = {
  aliment:     { label: 'Aliments',    icon: '🌾' },
  medicament:  { label: 'Médicaments', icon: '💊' },
  equipement:  { label: 'Équipements', icon: '🔧' },
  autre:       { label: 'Autres',      icon: '📦' },
};

const { uid, nowISO } = Store.helpers;

// ── CRUD stock items ──────────────────────────────────────────────────────────

export function createStockItem(state, { name, category = 'autre', quantity = 0, unit = 'unité', minQuantity = 0, notes = '' }) {
  if (!name?.trim()) throw new Error('Nom de l\'article requis.');
  const item = {
    id:          uid('st'),
    name:        name.trim(),
    category:    STOCK_CATEGORIES[category] ? category : 'autre',
    quantity:    Number(quantity) || 0,
    unit:        unit.trim() || 'unité',
    minQuantity: Number(minQuantity) || 0,
    notes:       notes.trim(),
    createdAt:   nowISO(),
    updatedAt:   nowISO(),
  };
  return { ...state, stock: [...(state.stock || []), item] };
}

export function updateStockItem(state, itemId, fields) {
  const stock = (state.stock || []).map(item => {
    if (item.id !== itemId) return item;
    return { ...item, ...fields, id: item.id, updatedAt: nowISO() };
  });
  return { ...state, stock };
}

export function deleteStockItem(state, itemId) {
  return {
    ...state,
    stock:          (state.stock || []).filter(x => x.id !== itemId),
    stockMovements: (state.stockMovements || []).filter(x => x.stockItemId !== itemId),
  };
}

// ── Stock movements ───────────────────────────────────────────────────────────

export function addStockMovement(state, { stockItemId, type, quantity, date, notes = '' }) {
  const item = (state.stock || []).find(x => x.id === stockItemId);
  if (!item) throw new Error('Article introuvable.');
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantité invalide.');
  if (!['entree', 'sortie', 'ajustement'].includes(type)) throw new Error('Type de mouvement invalide.');

  const movement = {
    id:          uid('sm'),
    stockItemId,
    type,
    quantity:    qty,
    date:        date || new Date().toISOString().slice(0, 10),
    notes:       notes.trim(),
    createdAt:   nowISO(),
  };

  let newQty;
  if (type === 'entree')     newQty = item.quantity + qty;
  else if (type === 'sortie') newQty = Math.max(0, item.quantity - qty);
  else                        newQty = qty; // ajustement = fixer directement

  const stock = (state.stock || []).map(x =>
    x.id === stockItemId ? { ...x, quantity: newQty, updatedAt: nowISO() } : x
  );
  const stockMovements = [...(state.stockMovements || []), movement];
  return { ...state, stock, stockMovements };
}

export function getStockMovements(state, stockItemId) {
  return (state.stockMovements || [])
    .filter(m => m.stockItemId === stockItemId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function getLowStockItems(state) {
  return (state.stock || []).filter(item =>
    item.minQuantity > 0 && item.quantity <= item.minQuantity
  );
}

export function getStockByCategory(state) {
  const result = {};
  for (const cat of Object.keys(STOCK_CATEGORIES)) result[cat] = [];
  for (const item of (state.stock || [])) {
    const cat = STOCK_CATEGORIES[item.category] ? item.category : 'autre';
    result[cat].push(item);
  }
  return result;
}
