import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Editor from './pages/Editor.jsx';
import Player from './pages/Player.jsx';
import 'reactflow/dist/style.css';
import './styles/nodes.css';
import './styles/layout.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/editor/:id" element={<Editor />} />
      <Route path="/share/:id" element={<Player />} />
    </Routes>
  );
}
