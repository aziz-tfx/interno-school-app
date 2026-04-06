export const expenseCategories = [
  { category: 'Зарплата', tashkent: 120, samarkand: 75, fergana: 58 },
  { category: 'Аренда', tashkent: 25, samarkand: 18, fergana: 14 },
  { category: 'Маркетинг', tashkent: 15, samarkand: 10, fergana: 8 },
  { category: 'Оборудование', tashkent: 8, samarkand: 4, fergana: 3 },
  { category: 'Коммунальные', tashkent: 6, samarkand: 3, fergana: 2 },
  { category: 'Прочее', tashkent: 4, samarkand: 2, fergana: 1 },
]

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' сум'
}
