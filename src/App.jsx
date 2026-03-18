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
import LMSDashboard from './pages/lms/LMSDashboard'
import LMSGroupView from './pages/lms/LMSGroupView'

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
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  const homePage = user.role === 'teacher' ? <Attendance /> : <Dashboard />

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" />} />
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
        <Route path="attendance" element={<Attendance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="lms" element={<LMSDashboard />} />
        <Route path="lms/group/:groupId" element={<LMSGroupView />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}
