import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import { api } from '../api.js';
import { audioEngine } from '../audio/engine.js';
import TrebloGeneratorNode from '../components/nodes/TrebloGeneratorNode.jsx';
import CombinerNode from '../components/nodes/CombinerNode.jsx';
import MasterNode from '../components/nodes/MasterNode.jsx';

let seq = 0;
const nid = () => `node_${Date.now()}_${seq++}`;

export default function Editor() {
  const { id } = useParams();
  const [title, setTitle] = useState('Untitled');
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [menu, setMenu] = useState(null); // {x, y, flowX, flowY}
  const [shareUrl, setShareUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const wrapper = useRef(null);

  // Per-node data helpers passed into custom nodes.
  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
    );
  }, []);

  const getSequence = useCallback(
    () => nodes.filter((n) => n.type === 'treblo_generator').map((n) => n.id),
    [nodes]
  );

  const nodeTypes = useMemo(
    () => ({
      treblo_generator: TrebloGeneratorNode,
      combiner: CombinerNode,
      master: MasterNode,
    }),
    []
  );

  // Inject callbacks into each node's data.
  const decoratedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, onChange: updateNodeData, getSequence },
      })),
    [nodes, updateNodeData, getSequence]
  );

  useEffect(() => {
    api.getProject(id)
      .then((p) => {
        if (!p) return;
        setTitle(p.title || 'Untitled');
        setNodes((p.nodes || []).map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data || {} })));
        setEdges(p.edges || []);
      })
      .catch(() => {});
  }, [id]);

  const onNodesChange = useCallback((c) => setNodes((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c) => setEdges((es) => applyEdgeChanges(c, es)), []);
  const onConnect = useCallback((params) => setEdges((es) => addEdge({ ...params, type: 'default' }, es)), []);

  function openMenu(e) {
    e.preventDefault();
    const bounds = wrapper.current.getBoundingClientRect();
    setMenu({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
  }

  function addNode(type) {
    const base = { id: nid(), type, position: { x: menu.x, y: menu.y }, data: {} };
    if (type === 'master') base.data = { bpm: 120 };
    if (type === 'combiner') base.data = { volume: 1 };
    setNodes((ns) => [...ns, base]);
    setMenu(null);
  }

  async function save() {
    setSaving(true);
    const cleanNodes = nodes.map(({ id: nId, type, position, data }) => ({
      id: nId,
      type,
      position,
      data: {
        prompt: data.prompt,
        style_tags: data.style_tags,
        duration: data.duration,
        status: data.status,
        audio_url: data.audio_url,
        volume: data.volume,
        bpm: data.bpm,
      },
    }));
    await api.saveProject(id, { title, nodes: cleanNodes, edges });
    setSaving(false);
  }

  async function share() {
    await save();
    setShareUrl(`${window.location.origin}/share/${id}`);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="topbar__actions">
          <button className="btn btn--ghost" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" onClick={share}>Share</button>
        </div>
      </header>

      {shareUrl && (
        <div className="share-bar fade-in">
          <span className="muted">Public link:</span>
          <a href={shareUrl}>{shareUrl}</a>
        </div>
      )}

      <div className="canvas" ref={wrapper} onContextMenu={openMenu} onClick={() => setMenu(null)}>
        <ReactFlow
          nodes={decoratedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e6e6e6" gap={26} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {menu && (
          <div className="context-menu fade-in" style={{ left: menu.x, top: menu.y }}>
            <div className="context-menu__title">Add block</div>
            <button onClick={() => addNode('treblo_generator')}>Treblo Generator</button>
            <button onClick={() => addNode('combiner')}>Combiner</button>
            <button onClick={() => addNode('master')}>Master</button>
          </div>
        )}
      </div>
    </div>
  );
}
