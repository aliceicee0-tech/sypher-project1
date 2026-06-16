import { Routes, Route } from 'react-router-dom';
import Chat from './pages/Chat.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Editor from './pages/Editor.jsx';
import Player from './pages/Player.jsx';
import 'reactflow/dist/style.css';
import './styles/nodes.css';
import './styles/layout.css';
import './styles/chat.css';

export default function App() {
  return (
    <Routes>
      {/* Chat is the main, most accessible entry point. */}
      <Route path="/" element={<Chat />} />
      <Route path="/projects" element={<Dashboard />} />
      <Route path="/editor/:id" element={<Editor />} />
      <Route path="/share/:id" element={<Player />} />
    </Routes>
  );
}
