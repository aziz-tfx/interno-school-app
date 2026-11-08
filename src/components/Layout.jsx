import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileTabBar from './MobileTabBar'
import StaffOnboarding from './StaffOnboarding'
import { useTableCardLabels } from '../utils/tableCards'

// Dialogs render in a portal on <body>, so captions are kept in sync there, not just in <main>
const BODY = { get current() { return typeof document !== 'undefined' ? document.body : null } }

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef(null)
  // .table-cards tables turn into cards on phones; captions come from <thead>
  useTableCardLabels(BODY)

  // Floating UI (toasts, banners, chat buttons) sits above the bottom tab
  // bar on phones — see --tabbar-h in index.css.
  useEffect(() => {
    document.documentElement.classList.add('has-tabbar')
    return () => document.documentElement.classList.remove('has-tabbar')
  }, [])

  // Any navigation closes the mobile menu
  useEffect(() => { setSidebarOpen(false) }, [location.pathname, location.search])

  return (
    <div className="app-shell flex overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Header />
        <main ref={mainRef} className="app-main flex-1 min-w-0 overflow-y-auto overscroll-contain px-3 pt-3 sm:px-4 sm:pt-4 md:p-6">
          {/* key forces remount on route change → page-in animation */}
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(v => !v)} />
      <StaffOnboarding />
    </div>
  )
}
