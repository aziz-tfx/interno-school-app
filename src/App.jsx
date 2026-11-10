import { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useLmsData } from './contexts/DataContext'
import Layout from './components/Layout'
import Logo from './components/Logo'
import Login from './pages/Login'
import { lazyPage } from './utils/lazyPage'
const Dashboard = lazyPage(() => import('./pages/Dashboard'))
const MyDay = lazyPage(() => import('./pages/MyDay'))
const Branches = lazyPage(() => import('./pages/Branches'))
const Students = lazyPage(() => import('./pages/Students'))
const Teachers = lazyPage(() => import('./pages/Teachers'))
const Courses = lazyPage(() => import('./pages/Courses'))
const Finance = lazyPage(() => import('./pages/Finance'))
const Attendance = lazyPage(() => import('./pages/Attendance'))
const BranchOps = lazyPage(() => import('./pages/BranchOps'))
const Employees = lazyPage(() => import('./pages/Employees'))
const Profile = lazyPage(() => import('./pages/Profile'))
const Reports = lazyPage(() => import('./pages/Reports'))
const Leaderboard = lazyPage(() => import('./pages/Leaderboard'))
const LMSDashboard = lazyPage(() => import('./pages/lms/LMSDashboard'))
const LMSGroupView = lazyPage(() => import('./pages/lms/LMSGroupView'))
const LMSCourseView = lazyPage(() => import('./pages/lms/LMSCourseView'))
const LMSLessonView = lazyPage(() => import('./pages/lms/LMSLessonView'))
const Integrations = lazyPage(() => import('./pages/Integrations'))
const AiAgent = lazyPage(() => import('./pages/AiAgent'))
const ContractTemplates = lazyPage(() => import('./pages/ContractTemplates'))
const AmoPerformance = lazyPage(() => import('./pages/AmoPerformance'))
const Crm = lazyPage(() => import('./pages/Crm'))
const Schedule = lazyPage(() => import('./pages/Schedule'))
const AuditLog = lazyPage(() => import('./pages/AuditLog'))
const Automations = lazyPage(() => import('./pages/Automations'))
const SuperAdmin = lazyPage(() => import('./pages/SuperAdmin'))
const ContractSign = lazyPage(() => import('./pages/ContractSign'))
const StudentCabinet = lazyPage(() => import('./pages/StudentCabinet'))
const Register = lazyPage(() => import('./pages/Register'))
const RegisterSchool = lazyPage(() => import('./pages/RegisterSchool'))
const CourseLanding = lazyPage(() => import('./pages/CourseLanding'))
const TelegramApp = lazyPage(() => import('./pages/TelegramApp'))
import { USE_SERVER } from './backend/api'
import { hasMyDay } from './utils/startPage'

function ProtectedRoute({ children, permission }) {
  const { user, hasPermission } = useAuth()
  if (!user) return <Navigate to="/login" />
  if (permission && !hasPermission(permission)) return <Navigate to="/" />
  return children
}

// /tg is the old student-only mini app. Bots (menu button, BotFather's
// «Open App») that still point there would lock staff into a student login,
// so on the server backend it forwards to the whole app, which signs anyone
// in — staff and students — via Telegram. ?tenantId= is kept: the app needs
// it to check Telegram's signature with this school's bot.
function TelegramEntry() {
  const { search } = useLocation()
  if (!USE_SERVER) return <TelegramApp />
  return <Navigate to={`/${search}`} replace />
}

// LMS screens: staff get the LMS collections only while one of these is
// open (see DataContext) — hold the page until the data has arrived instead
// of flashing «ничего нет».
function LmsData({ children }) {
  const { lmsReady } = useLmsData()
  if (lmsReady) return children
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Загрузка">
      <div className="w-7 h-7 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )
}

function SplashScreen() {
  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center gap-4">
      <Logo size="md" variant="auto" />
      <div className="w-8 h-8 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const { user, telegramAuthPending, hasPermission } = useAuth()

  // Telegram mini app: signing in with Telegram — don't flash the login form
  if (!user && telegramAuthPending) return <SplashScreen />

  if (!user) {
    return (
      <Suspense fallback={<SplashScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-school" element={<RegisterSchool />} />
        <Route path="/course/:courseId" element={<CourseLanding />} />
        <Route path="/contract/:paymentId" element={<ContractSign />} />
        <Route path="/tg" element={<TelegramEntry />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
      </Suspense>
    )
  }

  // Staff start on «Мой день»; a role it has nothing for — on the dashboard
  const myDay = hasMyDay(user, hasPermission)
  const homePage = user.role === 'student' ? <StudentCabinet />
    : myDay ? <MyDay /> : <Dashboard />

  // Pages inside <Layout> have their own Suspense there (the menu stays on
  // screen while a page loads); this one covers the full-screen routes.
  return (
    <Suspense fallback={<SplashScreen />}>
    <Routes>
      <Route path="/login" element={<Navigate to="/" />} />
      <Route path="/contract/:paymentId" element={<ContractSign />} />
      <Route path="/course/:courseId" element={<CourseLanding />} />
      <Route path="/tg" element={<TelegramEntry />} />
      <Route path="/" element={<Layout />}>
        <Route index element={homePage} />
        {/* the address «Мой день» had before it became the start page */}
        <Route path="today" element={user.role === 'student' || myDay ? <Navigate to="/" replace /> : <MyDay />} />
        <Route path="dashboard" element={
          <ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>
        } />
        <Route path="branches" element={
          <ProtectedRoute permission="branches"><Branches /></ProtectedRoute>
        } />
        <Route path="students" element={
          <ProtectedRoute permission="students"><Students /></ProtectedRoute>
        } />
        <Route path="teachers" element={
          <ProtectedRoute permission="teachers"><Teachers /></ProtectedRoute>
        } />
        <Route path="courses" element={
          <ProtectedRoute permission="courses"><Courses /></ProtectedRoute>
        } />
        <Route path="finance" element={
          <ProtectedRoute permission="finance"><Finance /></ProtectedRoute>
        } />
        <Route path="employees" element={
          <ProtectedRoute permission="employees"><Employees /></ProtectedRoute>
        } />
        <Route path="branch-ops" element={
          <ProtectedRoute permission="attendance"><BranchOps /></ProtectedRoute>
        } />
        <Route path="attendance" element={
          <ProtectedRoute permission="attendance"><Attendance /></ProtectedRoute>
        } />
        <Route path="reports" element={<Reports />} />
        <Route path="leaderboard" element={
          <ProtectedRoute permission="finance"><Leaderboard /></ProtectedRoute>
        } />
        <Route path="lms" element={
          <ProtectedRoute permission="lms"><LmsData><LMSDashboard /></LmsData></ProtectedRoute>
        } />
        <Route path="lms/group/:groupId" element={
          <ProtectedRoute permission="lms"><LmsData><LMSGroupView /></LmsData></ProtectedRoute>
        } />
        <Route path="lms/course/:courseId" element={
          <ProtectedRoute permission="lms"><LmsData><LMSCourseView /></LmsData></ProtectedRoute>
        } />
        <Route path="lms/lesson/:lessonId" element={
          <ProtectedRoute permission="lms"><LmsData><LMSLessonView /></LmsData></ProtectedRoute>
        } />
        <Route path="schedule" element={
          <ProtectedRoute permission="schedule"><Schedule /></ProtectedRoute>
        } />
        <Route path="audit" element={
          <ProtectedRoute permission="audit"><AuditLog /></ProtectedRoute>
        } />
        <Route path="automations" element={
          <ProtectedRoute permission="settings"><Automations /></ProtectedRoute>
        } />
        <Route path="integrations" element={
          <ProtectedRoute permission="settings"><Integrations /></ProtectedRoute>
        } />
        <Route path="ai-agent" element={
          <ProtectedRoute permission="settings"><AiAgent /></ProtectedRoute>
        } />
        <Route path="contract-templates" element={
          <ProtectedRoute permission="settings"><ContractTemplates /></ProtectedRoute>
        } />
        {USE_SERVER && (
          <Route path="crm" element={
            <ProtectedRoute permission="crm"><Crm /></ProtectedRoute>
          } />
        )}
        <Route path="amo" element={
          <ProtectedRoute permission="finance"><AmoPerformance /></ProtectedRoute>
        } />
        <Route path="superadmin" element={<SuperAdmin />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
