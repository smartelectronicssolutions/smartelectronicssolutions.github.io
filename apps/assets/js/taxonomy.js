// taxonomy.js - ONE definition of the ledger's two classification systems (spec: ledger-taxonomy-spec.md, 2026-08-26;
// wired 2026-09-17). Every app that reads {uid}/ledgerTx imports from here instead of hardcoding emojis or category names.
//
//   System 1 - personal spending: exactly one emoji in tx.tags[]        -> financials, budget, analytics, gas
//   System 2 - business parts:   tags has "inv" + cat/sub/altAmt/sku    -> invoice, inventory, analytics
//
// Rule from L: no new fields on the node. Everything here is about VALUES inside the existing tags[] and cat.

export const SPENDING_TAGS = [
  { tag: '🍽', label: 'Dining',            children: ['☕', '🍔', '🍺'] },   // coffee / fast food / bar roll up under Dining in app views
  { tag: '🛒', label: 'Groceries' },
  { tag: '🛍', label: 'Retail / shopping' },
  { tag: '🛠', label: 'Tools / home improvement' },
  { tag: '⛽', label: 'Gas' },                                                // onlinegas filters on this one - never rename
  { tag: '🚥', label: 'Tolls' },
  { tag: '🅿️', label: 'Parking' },
  { tag: '🚗', label: 'Auto (parts, repair, rideshare)', children: ['🛻'] },   // 🛻 = DMV/registration; 3 rows ever, so it rolls up rather than holding its own chip

  { tag: '🏦', label: 'Bank fees / interest' },
  { tag: '🔌', label: 'Utilities / electronics' },
  { tag: '💳', label: 'Subscriptions' },
  { tag: '🏠', label: 'Property A' },                                        // two different properties - never merge
  { tag: '🏡', label: 'Property B' },
  { tag: '📞', label: 'Phone' },
  { tag: '💵', label: 'Cash / deposits' },
  { tag: '📈', label: 'Investing' },
  { tag: '🎮', label: 'Games' },
  { tag: '🎓', label: 'Education' },
];

export const INV_TAG = 'inv';            // "this is a tracked / billable part" - the inventory/invoice link
export const GAS_TAG = '⛽';

// SECOND TIER (wired 2026-09-23). L wanted few tags but still a way to see one KIND of spend:
// "so if i want to see say all the fast food or gas or whatever i could somehow filter". The tag
// stays coarse and `sub` - already on the node, no new field - carries the flavour. These are
// SUGGESTIONS for the input datalist, not a closed list; anything typed is kept.
export const SUB_SUGGESTIONS = {
  '🍽': ['fast food', 'coffee', 'restaurant', 'bar', 'liquor', 'delivery'],
  '🛒': ['groceries', 'household', 'pharmacy'],
  '🚗': ['dmv', 'parts', 'repair', 'rideshare', 'insurance'],
  '🛍': ['clothes', 'personal care', 'travel', 'gifts'],
  '🔌': ['utilities', 'electronics', 'internet'],
  '💳': ['subscription', 'software', 'streaming'],
  '🛠': ['materials', 'tools', 'hardware'],
};
export function subSuggestions(t) { return SUB_SUGGESTIONS[normTag(parentTag(t))] || []; }

// System 2: canonical part categories for tx.cat (only meaningful on inv-tagged rows). Resale = goods bought to sell on.
export const PART_CATEGORIES = ['Tools', 'Electronics', 'Storage', 'Supplies', 'Networking', 'Cables/Wires', 'Resale'];

// strip U+FE0F so "⛽️" and "⛽" are the same tag (the variation-selector duplicate that split gas once)
export function normTag(t) { return String(t == null ? '' : t).trim().replace(/️/g, ''); }

const PARENT = {};
for (const s of SPENDING_TAGS) for (const c of (s.children || [])) PARENT[normTag(c)] = s.tag;
// the tag a sub-flavor rolls up to for reports (☕ -> 🍽); everything else maps to itself
export function parentTag(t) { const n = normTag(t); return PARENT[n] || n; }

const LABEL = {};
for (const s of SPENDING_TAGS) { LABEL[normTag(s.tag)] = s.label; for (const c of (s.children || [])) LABEL[normTag(c)] = s.label; }
export function tagLabel(t) { return LABEL[normTag(t)] || ''; }

export function isSpendingTag(t) { return normTag(t) in LABEL; }
export function isPart(tx) { return Array.isArray(tx && tx.tags) && tx.tags.some(x => normTag(x).toLowerCase() === INV_TAG); }

// one line for prompts / hints: "🍽 Dining · 🛒 Groceries · ..."
export const SPENDING_HINT = SPENDING_TAGS.map(s => `${s.tag} ${s.label}`).join(' · ');
