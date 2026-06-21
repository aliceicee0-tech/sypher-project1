import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import Chat from './pages/Chat.jsx';
import History from './pages/History.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Collection from './pages/Collection.jsx';
import Player from './pages/Player.jsx';
import Account from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import 'reactflow/dist/style.css';
import './styles/nodes.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/sidebar.css';
import './styles/responsive.css';

/** Guard: redirects to /login when the user is not authenticated. */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app__loading"><span className="pulse">loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Guard: blocks the admin area from non-admin accounts. */
function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="app__loading"><span className="pulse">loading…</span></div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/** Inner shell: sidebar + a content area that fades on route change. */
function Shell() {
  const location = useLocation();
  return (
    <div className="app">
      <Sidebar />
      <main className="app__main" key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Chat />} />
          <Route path="/history" element={<History />} />
          <Route path="/collections" element={<Dashboard />} />
          <Route path="/collections/:id" element={<Collection />} />
          <Route path="/account" element={<Account />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
        </Routes>
      </main>
      <MiniPlayer />
    </div>
  );
}

/**
 * AppShell — the persistent frame.
 *
 * The sidebar lives on the far left for every route; the active page renders
 * to its right inside .app__main. The public share Player and the Login page
 * stay full-bleed (no sidebar).
 */
export default function App() {
  return (
    <Routes>
      {/* Full-bleed pages (no sidebar). The share Player stays public. */}
      <Route path="/share/:id" element={<Player />} />
      <Route path="/login" element={<Login />} />

      {/* Everything else requires authentication and shares the sidebar. */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
