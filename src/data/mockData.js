export const branches = [
  {
    id: 'tashkent',
    name: 'Ташкент',
    address: 'ул. Амира Темура, 45',
    phone: '+998 71 200-00-01',
    director: 'Каримов Азиз',
    openDate: '2020-03-15',
    status: 'active',
    students: 342,
    teachers: 28,
    courses: 15,
    groups: 38,
    capacity: 400,
    monthlyRevenue: 285000000,
    monthlyExpenses: 178000000,
    rating: 4.8,
  },
  {
    id: 'samarkand',
    name: 'Самарканд',
    address: 'ул. Регистан, 12',
    phone: '+998 66 233-00-02',
    director: 'Рахимова Дилноза',
    openDate: '2021-09-01',
    status: 'active',
    students: 218,
    teachers: 18,
    courses: 12,
    groups: 24,
    capacity: 280,
    monthlyRevenue: 176000000,
    monthlyExpenses: 112000000,
    rating: 4.6,
  },
  {
    id: 'fergana',
    name: 'Фергана',
    address: 'ул. Мустакиллик, 78',
    phone: '+998 73 244-00-03',
    director: 'Алиев Бахтиёр',
    openDate: '2022-06-10',
    status: 'active',
    students: 156,
    teachers: 14,
    courses: 10,
    groups: 18,
    capacity: 200,
    monthlyRevenue: 124000000,
    monthlyExpenses: 86000000,
    rating: 4.5,
  },
]

export const revenueByMonth = [
  { month: 'Сен', tashkent: 245, samarkand: 148, fergana: 98 },
  { month: 'Окт', tashkent: 258, samarkand: 155, fergana: 105 },
  { month: 'Ноя', tashkent: 270, samarkand: 162, fergana: 110 },
  { month: 'Дек', tashkent: 240, samarkand: 145, fergana: 95 },
  { month: 'Янв', tashkent: 265, samarkand: 158, fergana: 108 },
  { month: 'Фев', tashkent: 278, samarkand: 168, fergana: 118 },
  { month: 'Мар', tashkent: 285, samarkand: 176, fergana: 124 },
]

export const studentsByMonth = [
  { month: 'Сен', tashkent: 290, samarkand: 180, fergana: 120 },
  { month: 'Окт', tashkent: 305, samarkand: 190, fergana: 128 },
  { month: 'Ноя', tashkent: 315, samarkand: 198, fergana: 135 },
  { month: 'Дек', tashkent: 308, samarkand: 195, fergana: 130 },
  { month: 'Янв', tashkent: 320, samarkand: 205, fergana: 140 },
  { month: 'Фев', tashkent: 335, samarkand: 212, fergana: 148 },
  { month: 'Мар', tashkent: 342, samarkand: 218, fergana: 156 },
]

export const courseDistribution = [
  { name: 'Английский', value: 35, color: '#3b82f6' },
  { name: 'Математика', value: 22, color: '#10b981' },
  { name: 'IT/Программирование', value: 18, color: '#8b5cf6' },
  { name: 'Русский язык', value: 12, color: '#f59e0b' },
  { name: 'Подготовка к IELTS', value: 8, color: '#ef4444' },
  { name: 'Другие', value: 5, color: '#6b7280' },
]

export const expenseCategories = [
  { category: 'Зарплата', tashkent: 120, samarkand: 75, fergana: 58 },
  { category: 'Аренда', tashkent: 25, samarkand: 18, fergana: 14 },
  { category: 'Маркетинг', tashkent: 15, samarkand: 10, fergana: 8 },
  { category: 'Оборудование', tashkent: 8, samarkand: 4, fergana: 3 },
  { category: 'Коммунальные', tashkent: 6, samarkand: 3, fergana: 2 },
  { category: 'Прочее', tashkent: 4, samarkand: 2, fergana: 1 },
]

export const students = [
  { id: 1, name: 'Иванов Алексей', branch: 'tashkent', course: 'Английский', group: 'ENG-A1-01', phone: '+998 90 123-45-67', balance: 1500000, status: 'active', startDate: '2025-09-01' },
  { id: 2, name: 'Каримова Мадина', branch: 'tashkent', course: 'IT/Программирование', group: 'IT-B1-03', phone: '+998 91 234-56-78', balance: 0, status: 'active', startDate: '2025-10-15' },
  { id: 3, name: 'Рахимов Сардор', branch: 'samarkand', course: 'Математика', group: 'MATH-02', phone: '+998 93 345-67-89', balance: -500000, status: 'debtor', startDate: '2025-09-01' },
  { id: 4, name: 'Азизова Нилуфар', branch: 'samarkand', course: 'Английский', group: 'ENG-B2-01', phone: '+998 94 456-78-90', balance: 2000000, status: 'active', startDate: '2025-11-01' },
  { id: 5, name: 'Тошпулатов Жасур', branch: 'fergana', course: 'Подготовка к IELTS', group: 'IELTS-01', phone: '+998 95 567-89-01', balance: 750000, status: 'active', startDate: '2026-01-10' },
  { id: 6, name: 'Мирзаева Шахло', branch: 'fergana', course: 'Русский язык', group: 'RUS-A2-01', phone: '+998 97 678-90-12', balance: -1200000, status: 'debtor', startDate: '2025-09-15' },
  { id: 7, name: 'Абдуллаев Фаррух', branch: 'tashkent', course: 'Английский', group: 'ENG-C1-02', phone: '+998 90 789-01-23', balance: 0, status: 'active', startDate: '2025-09-01' },
  { id: 8, name: 'Хасанова Гулнора', branch: 'tashkent', course: 'Математика', group: 'MATH-01', phone: '+998 91 890-12-34', balance: 1000000, status: 'active', startDate: '2026-02-01' },
  { id: 9, name: 'Юсупов Достон', branch: 'samarkand', course: 'IT/Программирование', group: 'IT-A1-01', phone: '+998 93 901-23-45', balance: -800000, status: 'debtor', startDate: '2025-10-01' },
  { id: 10, name: 'Норматова Зарина', branch: 'fergana', course: 'Английский', group: 'ENG-A2-01', phone: '+998 95 012-34-56', balance: 500000, status: 'active', startDate: '2025-12-01' },
  { id: 11, name: 'Саидов Умид', branch: 'tashkent', course: 'Подготовка к IELTS', group: 'IELTS-02', phone: '+998 90 111-22-33', balance: 0, status: 'frozen', startDate: '2025-09-01' },
  { id: 12, name: 'Тургунова Лола', branch: 'samarkand', course: 'Английский', group: 'ENG-B1-02', phone: '+998 94 222-33-44', balance: 1800000, status: 'active', startDate: '2026-01-15' },
]

export const teachers = [
  { id: 1, name: 'Смирнова Елена', branch: 'tashkent', subject: 'Английский', groups: 4, students: 48, salary: 8500000, rating: 4.9 },
  { id: 2, name: 'Нурматов Ойбек', branch: 'tashkent', subject: 'Математика', groups: 3, students: 36, salary: 7800000, rating: 4.7 },
  { id: 3, name: 'Johnson Michael', branch: 'tashkent', subject: 'IELTS', groups: 2, students: 24, salary: 12000000, rating: 4.9 },
  { id: 4, name: 'Камилова Дильфуза', branch: 'tashkent', subject: 'IT/Программирование', groups: 3, students: 32, salary: 9500000, rating: 4.8 },
  { id: 5, name: 'Эргашев Бобур', branch: 'samarkand', subject: 'Английский', groups: 3, students: 38, salary: 7500000, rating: 4.6 },
  { id: 6, name: 'Ким Виктория', branch: 'samarkand', subject: 'Математика', groups: 3, students: 30, salary: 7200000, rating: 4.5 },
  { id: 7, name: 'Рустамов Шерзод', branch: 'samarkand', subject: 'IT/Программирование', groups: 2, students: 22, salary: 8800000, rating: 4.7 },
  { id: 8, name: 'Холматова Наргиза', branch: 'fergana', subject: 'Английский', groups: 3, students: 35, salary: 7000000, rating: 4.5 },
  { id: 9, name: 'Маматов Ислом', branch: 'fergana', subject: 'Математика', groups: 2, students: 26, salary: 6800000, rating: 4.4 },
  { id: 10, name: 'Петрова Анна', branch: 'fergana', subject: 'Русский язык', groups: 2, students: 20, salary: 6500000, rating: 4.6 },
]

export const payments = [
  { id: 1, student: 'Иванов Алексей', branch: 'tashkent', amount: 1500000, date: '2026-03-15', type: 'income', method: 'Перевод' },
  { id: 2, student: 'Каримова Мадина', branch: 'tashkent', amount: 2000000, date: '2026-03-14', type: 'income', method: 'Наличные' },
  { id: 3, student: 'Азизова Нилуфар', branch: 'samarkand', amount: 1800000, date: '2026-03-14', type: 'income', method: 'Перевод' },
  { id: 4, student: 'Аренда офиса', branch: 'tashkent', amount: 25000000, date: '2026-03-01', type: 'expense', method: 'Перевод' },
  { id: 5, student: 'Тошпулатов Жасур', branch: 'fergana', amount: 1500000, date: '2026-03-13', type: 'income', method: 'Перевод' },
  { id: 6, student: 'Зарплата март', branch: 'tashkent', amount: 120000000, date: '2026-03-10', type: 'expense', method: 'Перевод' },
  { id: 7, student: 'Хасанова Гулнора', branch: 'tashkent', amount: 1000000, date: '2026-03-12', type: 'income', method: 'Карта' },
  { id: 8, student: 'Маркетинг Instagram', branch: 'samarkand', amount: 5000000, date: '2026-03-05', type: 'expense', method: 'Перевод' },
  { id: 9, student: 'Норматова Зарина', branch: 'fergana', amount: 1200000, date: '2026-03-11', type: 'income', method: 'Наличные' },
  { id: 10, student: 'Коммунальные услуги', branch: 'fergana', amount: 2000000, date: '2026-03-01', type: 'expense', method: 'Перевод' },
]

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' сум'
}

export const getBranchName = (id) => {
  const branch = branches.find(b => b.id === id)
  return branch ? branch.name : id
}
