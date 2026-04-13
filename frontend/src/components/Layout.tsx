import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Search, Database, GitBranch, Settings,
  Upload, Box, BarChart3, Layers, HardDrive, Network, LogOut, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const allNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'user'] },
  { to: '/search', label: 'Search', icon: Search, roles: ['admin', 'user'] },
  { to: '/graph', label: 'Graph', icon: Network, roles: ['admin', 'user'] },
  { to: '/sources', label: 'Sources (MCP)', icon: Layers, roles: ['admin'] },
  { to: '/redis', label: 'Redis', icon: HardDrive, roles: ['admin'] },
  { to: '/edges', label: 'Edges', icon: GitBranch, roles: ['admin'] },
  { to: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] },
  { to: '/admin/ingest', label: 'Ingest', icon: Upload, roles: ['admin'] },
  { to: '/admin/hllsets', label: 'HLLSets', icon: Box, roles: ['admin'] },
  { to: '/admin/consoles', label: 'Consoles', icon: BarChart3, roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'user';
  const navItems = allNavItems.filter(item => item.roles.includes(role));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">MDMS</h1>
          <p className="text-xs text-gray-500 mt-1">MetaData Management System</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info & logout */}
        <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <User className="h-5 w-5 text-gray-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.username}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
