import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGauge, faChalkboardUser, faCalendarDays, faUserTie, faChartBar, faGraduationCap,
  faClipboardList, faVideo,
  faUniversity, faCodeBranch, faLayerGroup, faBook,
  faUsers, faClockRotateLeft,
  faArrowRightFromBracket, faBarsStaggered, faChevronLeft,
  faBookOpen, faTableCells,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

// ── Nav items config ─────────────────────────────────────────────────────────

const NAV_MAIN = [
  { to: '/dashboard',  label: 'Dashboard',  icon: faGauge },
  { to: '/classes',    label: 'Classes',    icon: faChalkboardUser },
  { to: '/timetable',  label: 'Timetable',  icon: faCalendarDays },
  { to: '/faculty',    label: 'Faculty',    icon: faUserTie, adminOnly: true },
  { to: '/reports',    label: 'Reports',    icon: faChartBar },
  { to: '/curriculum',      label: 'Curriculum',     icon: faGraduationCap },
  { to: '/class-overview',       label: 'Class Overview',       icon: faClipboardList },
  { to: '/recording-overview',  label: 'Recordings',   icon: faVideo },
];

const NAV_SETTINGS = [
  { to: '/settings/universities', label: 'Universities', icon: faUniversity },
  { to: '/settings/streams',      label: 'Streams',      icon: faCodeBranch },
  { to: '/settings/batches',      label: 'Batches',      icon: faLayerGroup },
  { to: '/settings/subjects',     label: 'Subjects',     icon: faBook },
];

const NAV_ADMIN = [
  { to: '/users',        label: 'Users',        icon: faUsers },
  { to: '/activity-log', label: 'Activity Log', icon: faClockRotateLeft },
];

const NAV_NIOS = [
  { to: '/nios/curriculum',         label: 'NIOS Curriculum',         icon: faBookOpen },
  { to: '/nios/classes',            label: 'NIOS Classes',            icon: faChalkboardUser },
  { to: '/nios/timetable',          label: 'NIOS Timetable',          icon: faTableCells },
  { to: '/nios/recording-overview', label: 'NIOS Recordings', icon: faVideo },
  { to: '/nios/reports',            label: 'NIOS Reports',            icon: faChartBar },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function SidebarLink({ to, label, icon, collapsed }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-md text-sm transition-all duration-150 group
         ${collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2'}
         ${isActive
           ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200 font-medium'
           : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
         }`
      }
    >
      <FontAwesomeIcon icon={icon} className="w-4 h-4 shrink-0" fixedWidth />
      {!collapsed && <span className="truncate">{label}</span>}

      {/* Tooltip shown when collapsed */}
      {collapsed && (
        <span className="
          pointer-events-none absolute left-full ml-3 whitespace-nowrap
          rounded-md bg-slate-900 dark:bg-slate-700 text-white text-xs px-2 py-1
          opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
          shadow-md
        ">
          {label}
        </span>
      )}
    </NavLink>
  );
}

function NavGroup({ label, collapsed }) {
  return (
    <div className="pt-1 pb-0.5">
      <div className="border-t border-slate-200 dark:border-slate-700 mb-2" />
      {!collapsed && (
        <p className="px-3 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
          {label}
        </p>
      )}
    </div>
  );
}

function UserAvatar({ name }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-white">{initials}</span>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export default function AppLayout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sidebarW = collapsed ? 'w-16' : 'w-64';
  const contentML = collapsed ? 'ml-16' : 'ml-64';

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">

      {/* ── Sidebar ── */}
      <aside className={`${sidebarW} shrink-0 bg-white dark:bg-slate-900 flex flex-col border-r border-slate-200 dark:border-slate-700 fixed inset-y-0 left-0 z-30 transition-all duration-200 overflow-hidden`}>

        {/* Branding + toggle */}
        <div className={`flex items-center border-b border-slate-200 dark:border-slate-700 h-14 shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-indigo-600 dark:text-indigo-400 font-bold text-sm tracking-tight truncate">
                Class Management
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">EdDream</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <FontAwesomeIcon icon={faBarsStaggered} className="w-4 h-4" />
              : <FontAwesomeIcon icon={faChevronLeft} className="w-3.5 h-3.5" />
            }
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {NAV_MAIN.map((item) =>
            item.adminOnly && !isAdmin() ? null : (
              <SidebarLink key={item.to} {...item} collapsed={collapsed} />
            )
          )}

          <NavGroup label="NIOS" collapsed={collapsed} />
          {NAV_NIOS.map((item) => (
            <SidebarLink key={item.to} {...item} collapsed={collapsed} />
          ))}

          {isAdmin() && (
            <>
              <NavGroup label="Settings" collapsed={collapsed} />
              {NAV_SETTINGS.map((item) => (
                <SidebarLink key={item.to} {...item} collapsed={collapsed} />
              ))}
            </>
          )}

          {isAdmin() && (
            <>
              <NavGroup label="Admin" collapsed={collapsed} />
              {NAV_ADMIN.map((item) => (
                <SidebarLink key={item.to} {...item} collapsed={collapsed} />
              ))}
            </>
          )}
        </nav>

        {/* Logout */}
        <div className={`border-t border-slate-200 dark:border-slate-700 shrink-0 ${collapsed ? 'p-2' : 'p-3'}`}>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`relative w-full flex items-center gap-3 rounded-md text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group
              ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'}`}
          >
            <FontAwesomeIcon icon={faArrowRightFromBracket} className="w-4 h-4 shrink-0" fixedWidth />
            {!collapsed && <span>Logout</span>}
            {collapsed && (
              <span className="
                pointer-events-none absolute left-full ml-3 whitespace-nowrap
                rounded-md bg-slate-900 dark:bg-slate-700 text-white text-xs px-2 py-1
                opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
                shadow-md
              ">
                Logout
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* ── Right side ── */}
      {/* min-w-0 lets this column shrink below the width of wide content (e.g. the
          Classes table) so the table scrolls inside its own container instead of
          forcing the whole page to scroll horizontally. */}
      <div className={`flex-1 flex flex-col min-w-0 ${contentML} min-h-screen transition-all duration-200`}>

        {/* Top header */}
        <header className="sticky top-0 z-20 h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-end px-6 gap-4 shrink-0">
          <ThemeToggle />
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-600" />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-none">
                {user?.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                {user?.role}
              </p>
            </div>
            <UserAvatar name={user?.name} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 bg-slate-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}
