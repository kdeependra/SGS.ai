import { useState, useEffect, useRef, useCallback } from 'react';
import { getMetadataGraph } from '@/api/client';

interface GraphNode {
  id: string;
  type: 'database' | 'table' | 'column' | 'file' | 'folder' | 'mailbox' | 'email';
  label: string;
  sha1: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // optional fields
  db_type?: string;
  source_type?: string;
  row_count?: number;
  data_type?: string;
  cardinality?: number;
  column_count?: number;
  file_size?: number;
  doc_type?: string;
  word_count?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

const NODE_COLORS: Record<string, string> = {
  database: '#6366f1',  // indigo
  table: '#10b981',     // emerald
  column: '#f59e0b',    // amber
  file: '#3b82f6',      // blue
  folder: '#14b8a6',    // teal
  mailbox: '#8b5cf6',   // violet
  email: '#06b6d4',     // cyan
};

const NODE_RADIUS: Record<string, number> = {
  database: 28,
  table: 20,
  column: 12,
  file: 22,
  folder: 26,
  mailbox: 26,
  email: 18,
};

const NODE_ICONS: Record<string, string> = {
  database: 'DB',
  table: 'T',
  column: 'C',
  file: 'F',
  folder: '📁',
  mailbox: 'M',
  email: '✉',
};

const SOURCE_CATEGORIES: Record<string, string> = {
  database: 'database',
  table: 'database',
  column: 'database',
  file: 'file',       // will use source_type (csv/document)
  folder: 'file',
  mailbox: 'email',
  email: 'email',
};

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDb, setFilterDb] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterTable, setFilterTable] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const renderTick = useRef(0);
  const [, forceRender] = useState(0);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMetadataGraph();
      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];

      // Assign initial positions in a radial layout by type
      const dbNodes = rawNodes.filter((n: any) => n.type === 'database');
      const tblNodes = rawNodes.filter((n: any) => n.type === 'table');
      const colNodes = rawNodes.filter((n: any) => n.type === 'column');
      const fileNodes = rawNodes.filter((n: any) => n.type === 'file');
      const folderNodes = rawNodes.filter((n: any) => n.type === 'folder');
      const mailboxNodes = rawNodes.filter((n: any) => n.type === 'mailbox');
      const emailNodes = rawNodes.filter((n: any) => n.type === 'email');

      const cx = 500, cy = 400;

      const positionedNodes: GraphNode[] = [];

      // Databases at center
      dbNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(dbNodes.length, 1);
        positionedNodes.push({
          ...n,
          x: cx + Math.cos(angle) * 80,
          y: cy + Math.sin(angle) * 80,
          vx: 0, vy: 0,
        });
      });

      // Tables in middle ring
      tblNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(tblNodes.length, 1);
        positionedNodes.push({
          ...n,
          x: cx + Math.cos(angle) * 220,
          y: cy + Math.sin(angle) * 220,
          vx: 0, vy: 0,
        });
      });

      // Columns in outer ring
      colNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(colNodes.length, 1);
        positionedNodes.push({
          ...n,
          x: cx + Math.cos(angle) * 400,
          y: cy + Math.sin(angle) * 400,
          vx: 0, vy: 0,
        });
      });

      // Folders / Mailboxes in second center cluster (offset right)
      const cx2 = cx + 600;
      folderNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(folderNodes.length, 1);
        positionedNodes.push({ ...n, x: cx2 + Math.cos(angle) * 60, y: cy + Math.sin(angle) * 60, vx: 0, vy: 0 });
      });

      mailboxNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(mailboxNodes.length, 1);
        positionedNodes.push({ ...n, x: cx2 + Math.cos(angle + Math.PI) * 60, y: cy + Math.sin(angle + Math.PI) * 60, vx: 0, vy: 0 });
      });

      // Files around folders/center2
      fileNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(fileNodes.length, 1);
        positionedNodes.push({ ...n, x: cx2 + Math.cos(angle) * 200, y: cy + Math.sin(angle) * 200, vx: 0, vy: 0 });
      });

      // Emails around mailboxes
      emailNodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(emailNodes.length, 1);
        positionedNodes.push({ ...n, x: cx2 + Math.cos(angle) * 180, y: cy + Math.sin(angle) * 180 + 200, vx: 0, vy: 0 });
      });

      nodesRef.current = positionedNodes;
      setNodes(positionedNodes);
      setEdges(rawEdges);
    } catch (err: any) {
      setError(err?.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Force-directed simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const nodeMap = new Map<string, GraphNode>();
    nodesRef.current.forEach(n => nodeMap.set(n.id, n));

    let iterations = 0;
    const maxIterations = 300;

    const simulate = () => {
      if (iterations >= maxIterations) return;
      iterations++;

      const ns = nodesRef.current;
      const alpha = 1 - iterations / maxIterations;

      // Repulsion between all nodes
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (800 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ns[i].vx -= fx;
          ns[i].vy -= fy;
          ns[j].vx += fx;
          ns[j].vy += fy;
        }
      }

      // Attraction along edges
      edges.forEach(e => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = e.label === 'has_column' ? 120 : 180;
        const force = (dist - targetDist) * 0.02 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      });

      // Center gravity
      const cx = 500, cy = 400;
      ns.forEach(n => {
        n.vx += (cx - n.x) * 0.001 * alpha;
        n.vy += (cy - n.y) * 0.001 * alpha;
      });

      // Apply velocity with damping
      ns.forEach(n => {
        if (dragRef.current?.nodeId === n.id) return;
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;
      });

      renderTick.current++;
      if (iterations % 3 === 0) {
        forceRender(renderTick.current);
      }

      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);

    return () => cancelAnimationFrame(animRef.current);
  }, [nodes.length, edges]);

  // Mouse handlers for node dragging
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY };
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      dragRef.current.startX = e.clientX - node.x * zoom;
      dragRef.current.startY = e.clientY - node.y * zoom;
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) {
        node.x = (e.clientX - dragRef.current.startX) / zoom;
        node.y = (e.clientY - dragRef.current.startY) / zoom;
        node.vx = 0;
        node.vy = 0;
        forceRender(++renderTick.current);
      }
    } else if (panStart.current) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    }
  }, [zoom]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    panStart.current = null;
  }, []);

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  // Compute unique databases, sources, tables for filter dropdowns
  const databases = nodesRef.current.filter(n => n.type === 'database');
  const sources = [...new Set(databases.map(n => n.db_type).filter(Boolean))] as string[];
  const tables = nodesRef.current.filter(n => n.type === 'table');

  // Compute available source categories from nodes
  // Build parent lookup: table/column → which db they belong to
  const childToDb = new Map<string, string>(); // node.id → db node.id
  const childToTable = new Map<string, string>(); // col node.id → table node.id
  edges.forEach(e => {
    if (e.label === 'has_table') childToDb.set(e.target, e.source);
    if (e.label === 'has_column') childToTable.set(e.target, e.source);
  });
  // Also map table → db for columns (via table)
  const tableToDb = new Map<string, string>();
  edges.forEach(e => {
    if (e.label === 'has_table') tableToDb.set(e.target, e.source);
  });

  // Resolve source category for any node, considering parent file source_type
  const nodeById = new Map<string, GraphNode>();
  nodesRef.current.forEach(n => nodeById.set(n.id, n));

  const getNodeCategory = (n: GraphNode): string => {
    if (n.type === 'file') return n.source_type || 'file';
    if (n.type === 'table') {
      const parentId = childToDb.get(n.id);
      if (parentId) {
        const parent = nodeById.get(parentId);
        if (parent?.type === 'file') return parent.source_type || 'file';
      }
      return 'database';
    }
    if (n.type === 'column') {
      const tblId = childToTable.get(n.id);
      if (tblId) {
        const parentId = tableToDb.get(tblId);
        if (parentId) {
          const parent = nodeById.get(parentId);
          if (parent?.type === 'file') return parent.source_type || 'file';
        }
      }
      return 'database';
    }
    return SOURCE_CATEGORIES[n.type] || n.type;
  };

  // Compute available source categories from nodes
  const availableCategories = [...new Set(nodesRef.current.map(n => getNodeCategory(n)))].sort();

  // Visible nodes/edges based on filters
  const visibleNodeIds = new Set<string>();
  const visibleNodes = nodesRef.current.filter(n => {
    // Type filter
    if (filterType !== 'all' && n.type !== filterType) return false;

    // Source category filter (database, csv, document, email)
    if (filterCategory !== 'all') {
      if (getNodeCategory(n) !== filterCategory) return false;
    }

    // Database filter (only applies to database-backed table/column nodes)
    if (filterDb !== 'all') {
      if (n.type === 'database' && n.id !== filterDb) return false;
      if (n.type === 'table') {
        const parentId = childToDb.get(n.id);
        const parent = parentId ? nodeById.get(parentId) : null;
        // Only filter if parent is a database; file-backed tables pass through
        if (parent?.type === 'database' && parentId !== filterDb) return false;
        if (parent?.type === 'file') { /* pass — not a DB-backed table */ }
        else if (!parent) return false;
      }
      if (n.type === 'column') {
        const tblId = childToTable.get(n.id);
        const parentId = tblId ? tableToDb.get(tblId) : null;
        const parent = parentId ? nodeById.get(parentId) : null;
        if (parent?.type === 'database' && parentId !== filterDb) return false;
        if (parent?.type === 'file') { /* pass */ }
        else if (!parent) return false;
      }
    }

    // Data source filter (db_type — only applies to database-backed nodes)
    if (filterSource !== 'all') {
      if (n.type === 'database' && n.db_type !== filterSource) return false;
      if (n.type === 'table') {
        const dbId = childToDb.get(n.id);
        const dbNode = dbId ? nodeById.get(dbId) : null;
        // Only filter database-backed tables; file-backed tables pass
        if (dbNode?.type === 'database' && dbNode.db_type !== filterSource) return false;
      }
      if (n.type === 'column') {
        const tblId = childToTable.get(n.id);
        const dbId = tblId ? tableToDb.get(tblId) : null;
        const dbNode = dbId ? nodeById.get(dbId) : null;
        if (dbNode?.type === 'database' && dbNode.db_type !== filterSource) return false;
      }
    }

    // Table filter
    if (filterTable !== 'all') {
      if (n.type === 'table' && n.id !== filterTable) return false;
      if (n.type === 'column' && childToTable.get(n.id) !== filterTable) return false;
      if (n.type === 'database') {
        // Show parent DB of selected table
        if (childToDb.get(filterTable) !== n.id) return false;
      }
      if (n.type === 'file') {
        // Show parent file of selected table (CSV/document)
        if (childToDb.get(filterTable) !== n.id) return false;
      }
    }

    visibleNodeIds.add(n.id);
    return true;
  });

  // Also show parent nodes that connect to visible children
  if (filterType !== 'all') {
    edges.forEach(e => {
      if (visibleNodeIds.has(e.target) && !visibleNodeIds.has(e.source)) {
        const parentNode = nodesRef.current.find(n => n.id === e.source);
        if (parentNode) {
          visibleNodes.push(parentNode);
          visibleNodeIds.add(parentNode.id);
        }
      }
    });
  }

  const visibleEdges = edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  const nodeMap = new Map<string, GraphNode>();
  nodesRef.current.forEach(n => nodeMap.set(n.id, n));

  // Count stats
  const dbCount = nodesRef.current.filter(n => n.type === 'database').length;
  const tblCount = nodesRef.current.filter(n => n.type === 'table').length;
  const colCount = nodesRef.current.filter(n => n.type === 'column').length;
  const fileCount = nodesRef.current.filter(n => n.type === 'file').length;
  const emailCount = nodesRef.current.filter(n => n.type === 'email').length;
  const mailboxCount = nodesRef.current.filter(n => n.type === 'mailbox').length;
  const folderCount = nodesRef.current.filter(n => n.type === 'folder').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Metadata Graph</h1>
          <p className="text-sm text-gray-500 mt-1">Interactive visualization of databases, tables, columns &amp; edges</p>
        </div>
        <button
          onClick={fetchGraph}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Stats & Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.database }} />
          <span className="text-gray-600 dark:text-gray-300">Databases: <strong>{dbCount}</strong></span>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.table }} />
          <span className="text-gray-600 dark:text-gray-300">Tables: <strong>{tblCount}</strong></span>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.column }} />
          <span className="text-gray-600 dark:text-gray-300">Columns: <strong>{colCount}</strong></span>
        </div>
        {fileCount > 0 && (
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.file }} />
            <span className="text-gray-600 dark:text-gray-300">Files: <strong>{fileCount}</strong></span>
          </div>
        )}
        {(mailboxCount > 0 || emailCount > 0) && (
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.email }} />
            <span className="text-gray-600 dark:text-gray-300">Emails: <strong>{emailCount}</strong>{mailboxCount > 0 ? ` (${mailboxCount} mailboxes)` : ''}</span>
          </div>
        )}
        {folderCount > 0 && (
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS.folder }} />
            <span className="text-gray-600 dark:text-gray-300">Folders: <strong>{folderCount}</strong></span>
          </div>
        )}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
          <span className="text-gray-600 dark:text-gray-300">Edges: <strong>{edges.length}</strong></span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Source Category */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Source Category</label>
          <select
            value={filterCategory}
            onChange={e => { setFilterCategory(e.target.value); setFilterDb('all'); setFilterTable('all'); setFilterSource('all'); }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Sources</option>
            {availableCategories.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Node Type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Node Type</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Types</option>
            <option value="database">Databases</option>
            <option value="table">Tables</option>
            <option value="column">Columns</option>
            <option value="file">Files</option>
            <option value="folder">Folders</option>
            <option value="mailbox">Mailboxes</option>
            <option value="email">Emails</option>
          </select>
        </div>

        {/* Database */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Database</label>
          <select
            value={filterDb}
            onChange={e => { setFilterDb(e.target.value); setFilterTable('all'); }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Databases</option>
            {databases.map(db => (
              <option key={db.id} value={db.id}>{db.label}{db.db_type ? ` (${db.db_type})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Data Source */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Data Source</label>
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Sources</option>
            {sources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Table</label>
          <select
            value={filterTable}
            onChange={e => setFilterTable(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Tables</option>
            {tables
              .filter(t => filterDb === 'all' || childToDb.get(t.id) === filterDb)
              .map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {(filterType !== 'all' || filterDb !== 'all' || filterSource !== 'all' || filterTable !== 'all' || filterCategory !== 'all') && (
          <button
            onClick={() => { setFilterType('all'); setFilterDb('all'); setFilterSource('all'); setFilterTable('all'); setFilterCategory('all'); }}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
          >
            Clear Filters
          </button>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 ml-auto">
          <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded">+</button>
          <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded">−</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">Reset</button>
        </div>
      </div>

      {/* Graph SVG */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden" style={{ height: '70vh' }}>
        {loading && nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">Loading graph data...</div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">No metadata found. Ingest data first.</div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={handleSvgMouseDown}
            onWheel={handleWheel}
            style={{ cursor: panStart.current ? 'grabbing' : 'grab' }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
              </marker>
            </defs>

            <rect width="100%" height="100%" fill="transparent" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {visibleEdges.map((e, i) => {
                const s = nodeMap.get(e.source);
                const t = nodeMap.get(e.target);
                if (!s || !t) return null;
                const isHighlighted = hoveredNode === e.source || hoveredNode === e.target ||
                  selectedNode?.id === e.source || selectedNode?.id === e.target;
                return (
                  <line
                    key={`e-${i}`}
                    x1={s.x} y1={s.y}
                    x2={t.x} y2={t.y}
                    stroke={isHighlighted ? '#6366f1' : '#cbd5e1'}
                    strokeWidth={isHighlighted ? 2 : 1}
                    strokeOpacity={isHighlighted ? 0.9 : 0.4}
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}

              {/* Nodes */}
              {visibleNodes.map(n => {
                const r = NODE_RADIUS[n.type] || 14;
                const fill = NODE_COLORS[n.type] || '#6b7280';
                const isHovered = hoveredNode === n.id;
                const isSelected = selectedNode?.id === n.id;

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    onMouseDown={e => handleNodeMouseDown(e, n.id)}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={e => { e.stopPropagation(); setSelectedNode(n); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      r={isHovered || isSelected ? r + 3 : r}
                      fill={fill}
                      fillOpacity={0.85}
                      stroke={isSelected ? '#1e1b4b' : isHovered ? '#4338ca' : 'white'}
                      strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.5}
                    />
                    <text
                      dy={r + 14}
                      textAnchor="middle"
                      fontSize={n.type === 'column' ? 9 : 11}
                      fill="#374151"
                      className="select-none pointer-events-none"
                      fontWeight={n.type === 'database' ? 700 : 500}
                    >
                      {n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label}
                    </text>
                    {/* Type icon text inside circle */}
                    <text
                      textAnchor="middle"
                      dy={4}
                      fontSize={r * 0.7}
                      fill="white"
                      className="select-none pointer-events-none"
                      fontWeight={700}
                    >
                      {NODE_ICONS[n.type] || n.type[0].toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] }} />
              {selectedNode.label}
            </h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{selectedNode.type}</span></div>
            <div><span className="text-gray-500">SHA1:</span> <span className="font-mono text-xs">{selectedNode.sha1}</span></div>
            {selectedNode.db_type && (
              <div><span className="text-gray-500">DB Type:</span> <span className="font-medium">{selectedNode.db_type}</span></div>
            )}
            {selectedNode.source_type && (
              <div><span className="text-gray-500">Source:</span> <span className="font-medium capitalize">{selectedNode.source_type}</span></div>
            )}
            {selectedNode.row_count !== undefined && (selectedNode.type === 'table' || selectedNode.type === 'file') && (
              <div><span className="text-gray-500">Rows:</span> <span className="font-medium">{selectedNode.row_count.toLocaleString()}</span></div>
            )}
            {selectedNode.data_type && (
              <div><span className="text-gray-500">Data Type:</span> <span className="font-medium">{selectedNode.data_type}</span></div>
            )}
            {selectedNode.cardinality !== undefined && selectedNode.type === 'column' && (
              <div><span className="text-gray-500">Cardinality:</span> <span className="font-medium">{selectedNode.cardinality.toLocaleString()}</span></div>
            )}
            {selectedNode.file_size !== undefined && selectedNode.file_size > 0 && (
              <div><span className="text-gray-500">File Size:</span> <span className="font-medium">{(selectedNode.file_size / 1024).toFixed(1)} KB</span></div>
            )}
            {selectedNode.column_count !== undefined && (
              <div><span className="text-gray-500">Columns:</span> <span className="font-medium">{selectedNode.column_count}</span></div>
            )}
            {selectedNode.doc_type && (
              <div><span className="text-gray-500">Doc Type:</span> <span className="font-medium">{selectedNode.doc_type}</span></div>
            )}
            {selectedNode.word_count !== undefined && selectedNode.word_count > 0 && (
              <div><span className="text-gray-500">Words:</span> <span className="font-medium">{selectedNode.word_count.toLocaleString()}</span></div>
            )}
          </div>
          {/* Connected nodes */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 mb-1">Connected to:</p>
            <div className="flex flex-wrap gap-1">
              {edges
                .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                .map((e, i) => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                  const other = nodeMap.get(otherId);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (other) setSelectedNode(other);
                      }}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900"
                    >
                      {other?.label || otherId} <span className="text-gray-400">({e.label})</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
