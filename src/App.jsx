import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Branches from './pages/Branches'
import Students from './pages/Students'
import Teachers from './pages/Teachers'
import Courses from './pages/Courses'
import Finance from './pages/Finance'
import Attendance from './pages/Attendance'
import Employees from './pages/Employees'
import Profile from './pages/Profile'
import Reports from './pages/Reports'
import Leaderboard from './pages/Leaderboard'
import LMSDashboard from './pages/lms/LMSDashboard'
import LMSGroupView from './pages/lms/LMSGroupView'
import LMSCourseView from './pages/lms/LMSCourseView'
import LMSLessonView from './pages/lms/LMSLessonView'
import Integrations from './pages/Integrations'
import ContractTemplates from './pages/ContractTemplates'
import AmoPerformance from './pages/AmoPerformance'
import Schedule from './pages/Schedule'
import AuditLog from './pages/AuditLog'
import SuperAdmin from './pages/SuperAdmin'
import ContractSign from './pages/ContractSign'
import StudentCabinet from './pages/StudentCabinet'
import Register from './pages/Register'
import RegisterSchool from './pages/RegisterSchool'
import TelegramApp from './pages/TelegramApp'

function ProtectedRoute({ children, permission }) {
  const { user, hasPermission } = useAuth()
  if (!user) return <Navigate to="/login" />
  if (permission && !hasPermission(permission)) return <Navigate to="/" />
  return children
}

export default function App() {
  const { user } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-school" element={<RegisterSchool />} />
        <Route path="/contract/:paymentId" element={<ContractSign />} />
        <Route path="/tg" element={<TelegramApp />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  const homePage = user.role === 'student' ? <StudentCabinet /> : user.role === 'teacher' ? <Attendance /> : <Dashboard />

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" />} />
      <Route path="/contract/:paymentId" element={<ContractSign />} />
      <Route path="/tg" element={<TelegramApp />} />
      <Route path="/" element={<Layout />}>
        <Route index element={homePage} />
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
        <Route path="attendance" element={
          <ProtectedRoute permission="attendance"><Attendance /></ProtectedRoute>
        } />
        <Route path="reports" element={<Reports />} />
        <Route path="leaderboard" element={
          <ProtectedRoute permission="finance"><Leaderboard /></ProtectedRoute>
        } />
        <Route path="lms" element={
          <ProtectedRoute permission="lms"><LMSDashboard /></ProtectedRoute>
        } />
        <Route path="lms/group/:groupId" element={
          <ProtectedRoute permission="lms"><LMSGroupView /></ProtectedRoute>
        } />
        <Route path="lms/course/:courseId" element={
          <ProtectedRoute permission="lms"><LMSCourseView /></ProtectedRoute>
        } />
        <Route path="lms/lesson/:lessonId" element={
          <ProtectedRoute permission="lms"><LMSLessonView /></ProtectedRoute>
        } />
        <Route path="schedule" element={
          <ProtectedRoute permission="schedule"><Schedule /></ProtectedRoute>
        } />
        <Route path="audit" element={
          <ProtectedRoute permission="audit"><AuditLog /></ProtectedRoute>
        } />
        <Route path="integrations" element={
          <ProtectedRoute permission="settings"><Integrations /></ProtectedRoute>
        } />
        <Route path="contract-templates" element={
          <ProtectedRoute permission="settings"><ContractTemplates /></ProtectedRoute>
        } />
        <Route path="amo" element={
          <ProtectedRoute permission="finance"><AmoPerformance /></ProtectedRoute>
        } />
        <Route path="superadmin" element={<SuperAdmin />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}
