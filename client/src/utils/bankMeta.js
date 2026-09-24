// Mirrors SUPPORT_LEVELS in server/src/schemas/bank.schema.js.
export const SUPPORT_LEVELS = ['Platinum', 'Gold', 'Silver']

const LEVEL_STYLE = {
  Platinum: { text: 'text-review', bg: 'bg-review/10', border: 'border-review/25', dot: 'bg-review' },
  Gold: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300/60', dot: 'bg-amber-500' },
  Silver: { text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300/70', dot: 'bg-slate-400' },
}

export const getSupportLevelStyle = (level) => LEVEL_STYLE[level] || LEVEL_STYLE.Silver
