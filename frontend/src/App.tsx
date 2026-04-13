import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SearchPage from './pages/SearchPage'
import SourcesPage from './pages/SourcesPage'
import EdgesPage from './pages/EdgesPage'
import AdminPage from './pages/AdminPage'
import IngestPage from './pages/IngestPage'
import HLLSetsPage from './pages/HLLSetsPage'
import ConsolesPage from './pages/ConsolesPage'
import RedisPage from './pages/RedisPage'
import GraphPage from './pages/GraphPage'
import LoginPage from './pages/LoginPage'
import { useAuth } from './contexts/AuthContext'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        {/* Everyone can access these */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/graph" element={<GraphPage />} />
        {/* Admin only */}
        <Route path="/sources" element={<RequireAdmin><SourcesPage /></RequireAdmin>} />
        <Route path="/edges" element={<RequireAdmin><EdgesPage /></RequireAdmin>} />
        <Route path="/redis" element={<RequireAdmin><RedisPage /></RequireAdmin>} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/admin/ingest" element={<RequireAdmin><IngestPage /></RequireAdmin>} />
        <Route path="/admin/hllsets" element={<RequireAdmin><HLLSetsPage /></RequireAdmin>} />
        <Route path="/admin/consoles" element={<RequireAdmin><ConsolesPage /></RequireAdmin>} />
      </Route>
    </Routes>
  )
}

export default App
