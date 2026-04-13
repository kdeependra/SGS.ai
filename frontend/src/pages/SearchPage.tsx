import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { searchPrompt, lookupTokens, resolveTokens, nlpSearch, syncMetadataGraph } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Search as SearchIcon, ChevronDown, ChevronRight, Copy, Key, GitBranch, Network, Sparkles, RefreshCw, Database, Table2, Columns3 } from 'lucide-react';

interface MatchResult {
  sha1: string; level: string; name: string; score: number;
  parent_sha1?: string; children: MatchResult[];
}

function MatchNode({ node, depth = 0 }: { node: MatchResult; depth?: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const levelColors: Record<string, string> = {
    db: 'bg-blue-100 text-blue-800',
    table: 'bg-green-100 text-green-800',
    column: 'bg-purple-100 text-purple-800',
  };
  return (
    <div className="ml-4">
      <div className="flex items-center gap-2 py-1 cursor-pointer" onClick={() => setOpen(!open)}>
        {hasChildren ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${levelColors[node.level] || ''}`}>{node.level}</span>
        <span className="text-sm font-medium text-gray-900 dark:text-white">{node.name || node.sha1}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-20 bg-gray-200 rounded-full h-2 dark:bg-gray-700">
            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${Math.round(node.score * 100)}%` }} />
          </div>
          <span className="text-xs text-gray-500">{(node.score * 100).toFixed(0)}%</span>
        </div>
      </div>
      {open && hasChildren && node.children.map(child => (
        <MatchNode key={child.sha1} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [searchMode, setSearchMode] = useState<'token' | 'nlp'>('nlp');
  const [prompt, setPrompt] = useState('');
  const [nlpResultTab, setNlpResultTab] = useState<'table' | 'graph'>('table');

  // Token-based search
  const mutation = useMutation({
    mutationFn: (p: string) => searchPrompt(p),
  });

  // NLP/AI search
  const nlpMutation = useMutation({
    mutationFn: (p: string) => nlpSearch(p),
  });

  // Graph sync
  const syncMutation = useMutation({
    mutationFn: () => syncMetadataGraph(),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (searchMode === 'nlp') {
      nlpMutation.mutate(trimmed);
    } else {
      mutation.mutate(trimmed);
    }
  };

  const data = mutation.data;
  const nlpData = nlpMutation.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Search & Discovery</h2>
          <p className="text-sm text-gray-500 mt-1">Search metadata using natural language — powered by AI</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Graph'}
        </Button>
      </div>

      {syncMutation.isSuccess && (
        <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-sm text-green-700 dark:text-green-300">
          Graph synced: {syncMutation.data.nodes_created} nodes, {syncMutation.data.edges_created} edges created
        </div>
      )}

      {/* Search Mode Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setSearchMode('nlp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            searchMode === 'nlp'
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          AI Graph Search
        </button>
        <button
          onClick={() => setSearchMode('token')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            searchMode === 'token'
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <SearchIcon className="h-4 w-4" />
          Token Search
        </button>
      </div>

      {/* Prompt Bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          {searchMode === 'nlp' ? (
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-400" />
          ) : (
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          )}
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={searchMode === 'nlp'
              ? 'e.g. Show me all tables with customer data, Find columns related to price...'
              : 'e.g. email, price, name, order'}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <Button type="submit" size="lg" disabled={mutation.isPending || nlpMutation.isPending}>
          {(mutation.isPending || nlpMutation.isPending) ? 'Searching...' : searchMode === 'nlp' ? 'AI Search' : 'Search'}
        </Button>
      </form>

      {/* Status */}
      {(mutation.isPending || nlpMutation.isPending) && (
        <div className="flex items-center gap-2 text-indigo-600">
          <div className="h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{searchMode === 'nlp' ? 'AI is generating Cypher query and searching metadata graph...' : 'Searching Redis for matching tokens…'}</span>
        </div>
      )}

      {/* Error */}
      {(mutation.isError || nlpMutation.isError) && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">
            Search failed: {(mutation.error || nlpMutation.error) instanceof Error
              ? (mutation.error || nlpMutation.error)?.message
              : String(mutation.error || nlpMutation.error)}
          </p>
        </div>
      )}

      {/* ===== NLP SEARCH RESULTS ===== */}
      {searchMode === 'nlp' && nlpData && (
        <>
          {/* Generated Cypher Query */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                Generated Cypher Query
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-700">
                  {nlpData.cypher}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(nlpData.cypher)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1"
                  title="Copy query"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Result Tabs: Table | Graph */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {nlpResultTab === 'table' ? (
                    <Database className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Network className="h-5 w-5 text-indigo-600" />
                  )}
                  {nlpResultTab === 'table' ? 'Query Results' : 'Metadata Graph'}
                  {nlpResultTab === 'table' && nlpData.result?.rows && (
                    <Badge variant="default">{nlpData.result.rows.length} row{nlpData.result.rows.length !== 1 ? 's' : ''}</Badge>
                  )}
                  {nlpResultTab === 'graph' && nlpData.graph?.nodes && (
                    <Badge variant="default">{nlpData.graph.nodes.length} nodes</Badge>
                  )}
                </CardTitle>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                  <button
                    onClick={() => setNlpResultTab('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      nlpResultTab === 'table'
                        ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    Table
                  </button>
                  <button
                    onClick={() => setNlpResultTab('graph')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      nlpResultTab === 'graph'
                        ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Network className="h-3.5 w-3.5" />
                    Graph
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Table View */}
              {nlpResultTab === 'table' && (
                <>
                  {nlpData.result?.error ? (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
                      {nlpData.result.error}
                    </div>
                  ) : nlpData.result?.columns?.length > 0 ? (
                    <div className="overflow-x-auto" style={{ maxHeight: 500 }}>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            {nlpData.result.columns.map((col: string, i: number) => (
                              <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {nlpData.result.rows.map((row: any[], ri: number) => (
                            <tr key={ri} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              {row.map((cell: any, ci: number) => (
                                <td key={ci} className="px-3 py-2 text-gray-700 dark:text-gray-300 font-mono text-xs">
                                  {typeof cell === 'object' ? JSON.stringify(cell) : String(cell ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No results returned</p>
                  )}
                  {nlpData.result?.stats && (
                    <p className="text-xs text-gray-400 mt-2">{nlpData.result.stats}</p>
                  )}
                </>
              )}

              {/* Graph View */}
              {nlpResultTab === 'graph' && nlpData.graph && (nlpData.graph.nodes?.length > 0 || nlpData.graph.edges?.length > 0) && (
                <NlpResultGraph nodes={nlpData.graph.nodes} edges={nlpData.graph.edges} />
              )}
              {nlpResultTab === 'graph' && (!nlpData.graph || (nlpData.graph.nodes?.length === 0 && nlpData.graph.edges?.length === 0)) && (
                <p className="text-sm text-gray-500">No graph data to display</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ===== TOKEN SEARCH RESULTS ===== */}
      {searchMode === 'token' && (
        <>
          {/* Tokens */}
          {data?.tokens?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Tokens:</span>
              {data.tokens.map((t: string) => <Badge key={t}>{t}</Badge>)}
            </div>
          )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Match Tree */}
        <Card>
          <CardHeader><CardTitle>Match Results</CardTitle></CardHeader>
          <CardContent>
            {data?.matches?.length > 0 ? (
              data.matches.map((m: MatchResult, i: number) => <MatchNode key={`${m.sha1}-${i}`} node={m} />)
            ) : (
              <p className="text-sm text-gray-500">{mutation.isIdle ? 'Enter a prompt to begin' : 'No matches found'}</p>
            )}
          </CardContent>
        </Card>

        {/* SQL Preview */}
        <Card>
          <CardHeader><CardTitle>SQL Candidates</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data?.sql_candidates?.length > 0 ? data.sql_candidates.map((sql: any, i: number) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={sql.confidence > 0.7 ? 'success' : sql.confidence > 0.4 ? 'warning' : 'danger'}>
                    {(sql.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                  <button onClick={() => navigator.clipboard.writeText(sql.sql)} className="text-gray-400 hover:text-gray-600">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">{sql.sql}</pre>
                <p className="text-xs text-gray-500 mt-1">{sql.db} → {sql.table} → {sql.columns?.join(', ')}</p>
              </div>
            )) : (
              <p className="text-sm text-gray-500">No SQL candidates</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Other Sources */}
      {data?.other_sources && (Object.values(data.other_sources) as string[][]).some(v => v.length > 0) && (
        <Card>
          <CardHeader><CardTitle>Other Sources</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(data.other_sources).map(([type, refs]: [string, any]) => (
              refs.length > 0 && (
                <div key={type} className="mb-2">
                  <span className="text-sm font-medium capitalize">{type}:</span>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {refs.map((r: string) => <Badge key={r} variant="default">{r}</Badge>)}
                  </div>
                </div>
              )
            ))}
          </CardContent>
        </Card>
      )}

      {/* Search Result Graph */}
      {data?.matches?.length > 0 && (
        <SearchResultGraph matches={data.matches} tokens={data.tokens || []} />
      )}

      {/* Token Lookup & Resolve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TokenLookupPanel />
        <ResolveSourcesPanel />
      </div>
        </>
      )}
    </div>
  );
}

// ---------- NLP Result Graph ----------
interface NlpGNode { id: string; type: string; label: string; x: number; y: number; vx: number; vy: number }
interface NlpGEdge { source: string; target: string; label: string }

const NLP_COLORS: Record<string, string> = {
  database: '#6366f1', table: '#10b981', column: '#f59e0b', result: '#8b5cf6',
  file: '#3b82f6', email: '#06b6d4', mailbox: '#8b5cf6', folder: '#14b8a6',
};
const NLP_RADIUS: Record<string, number> = {
  database: 28, table: 22, column: 16, result: 20,
  file: 22, email: 18, mailbox: 26, folder: 26,
};
const NLP_ICONS: Record<string, string> = {
  database: 'DB', table: 'T', column: 'C', result: 'R',
  file: 'F', email: '\u2709', mailbox: 'M', folder: '\ud83d\udcc1',
};

function NlpResultGraph({ nodes: rawNodes, edges: rawEdges }: { nodes: any[]; edges: any[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<NlpGNode | null>(null);
  const [, forceRender] = useState(0);
  const nodesRef = useRef<NlpGNode[]>([]);
  const edgesRef = useRef<NlpGEdge[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string; offX: number; offY: number } | null>(null);
  const tickRef = useRef(0);

  useEffect(() => {
    const cx = 400, cy = 250;

    // Position nodes by type in concentric rings
    const byType: Record<string, any[]> = {};
    rawNodes.forEach(n => {
      (byType[n.type] ??= []).push(n);
    });

    const rings: Record<string, number> = { database: 60, table: 170, column: 280, result: 200, file: 220, email: 250 };
    const positioned: NlpGNode[] = [];

    Object.entries(byType).forEach(([type, ns]) => {
      const r = rings[type] || 200;
      ns.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / Math.max(ns.length, 1) + (type === 'column' ? 0.3 : 0);
        positioned.push({
          id: n.id, type: n.type, label: n.label,
          x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
          y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0,
        });
      });
    });

    nodesRef.current = positioned;
    edgesRef.current = rawEdges.map(e => ({ source: e.source, target: e.target, label: e.label }));
    forceRender(++tickRef.current);

    // Force simulation
    const nodeById = new Map(positioned.map(n => [n.id, n]));
    let iter = 0;
    const maxIter = 250;

    const tick = () => {
      if (iter >= maxIter) return;
      iter++;
      const alpha = 1 - iter / maxIter;
      const ns = nodesRef.current;

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (800 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ns[i].vx -= fx; ns[i].vy -= fy;
          ns[j].vx += fx; ns[j].vy += fy;
        }
      }

      edgesRef.current.forEach(e => {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 140;
        const force = (dist - target) * 0.02 * alpha;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      });

      ns.forEach(n => {
        n.vx += (cx - n.x) * 0.002 * alpha;
        n.vy += (cy - n.y) * 0.002 * alpha;
      });

      ns.forEach(n => {
        if (dragRef.current?.nodeId === n.id) return;
        n.vx *= 0.6; n.vy *= 0.6;
        n.x += n.vx; n.y += n.vy;
      });

      if (iter % 3 === 0) forceRender(++tickRef.current);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [rawNodes, rawEdges]);

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) dragRef.current = { nodeId, offX: e.clientX - node.x, offY: e.clientY - node.y };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
    if (node) {
      node.x = e.clientX - dragRef.current.offX;
      node.y = e.clientY - dragRef.current.offY;
      node.vx = 0; node.vy = 0;
      forceRender(++tickRef.current);
    }
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const nodeById = new Map(nodesRef.current.map(n => [n.id, n]));
  const uniqueTypes = [...new Set(nodesRef.current.map(n => n.type))];

  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs flex-wrap">
        {uniqueTypes.map(type => (
          <span key={type} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: NLP_COLORS[type] || '#6b7280' }} />
            <span className="capitalize text-gray-600 dark:text-gray-400">{type}</span>
          </span>
        ))}
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" style={{ height: 500 }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox="0 0 800 500"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragRef.current ? 'grabbing' : 'default' }}
          >
            <defs>
              <marker id="nlp-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
              </marker>
            </defs>

            {edgesRef.current.map((e, i) => {
              const s = nodeById.get(e.source);
              const t = nodeById.get(e.target);
              if (!s || !t) return null;
              const isHighlighted = selectedNode?.id === e.source || selectedNode?.id === e.target;
              return (
                <g key={`e-${i}`}>
                  <line
                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={isHighlighted ? '#6366f1' : '#cbd5e1'}
                    strokeWidth={isHighlighted ? 2.5 : 1.2}
                    strokeOpacity={isHighlighted ? 0.9 : 0.5}
                    markerEnd="url(#nlp-arrow)"
                  />
                  <text
                    x={(s.x + t.x) / 2}
                    y={(s.y + t.y) / 2 - 6}
                    textAnchor="middle"
                    fontSize={8}
                    fill={isHighlighted ? '#6366f1' : '#94a3b8'}
                    fontWeight={isHighlighted ? 600 : 400}
                    className="select-none pointer-events-none"
                  >
                    {e.label}
                  </text>
                </g>
              );
            })}

            {nodesRef.current.map(n => {
              const r = NLP_RADIUS[n.type] || 18;
              const fill = NLP_COLORS[n.type] || '#6b7280';
              const isSel = selectedNode?.id === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onMouseDown={e => handleMouseDown(e, n.id)}
                  onClick={e => { e.stopPropagation(); setSelectedNode(isSel ? null : n); }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle r={isSel ? r + 3 : r} fill={fill} fillOpacity={0.85}
                    stroke={isSel ? '#1e1b4b' : 'white'} strokeWidth={isSel ? 3 : 1.5} />
                  <text dy={4} textAnchor="middle" fontSize={r * 0.6} fill="white" fontWeight={700}
                    className="select-none pointer-events-none">
                    {NLP_ICONS[n.type] || n.type[0].toUpperCase()}
                  </text>
                  <text dy={r + 13} textAnchor="middle" fontSize={10} fill="#374151" fontWeight={500}
                    className="select-none pointer-events-none">
                    {n.label.length > 20 ? n.label.slice(0, 18) + '\u2026' : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {selectedNode && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NLP_COLORS[selectedNode.type] }} />
              <strong className="capitalize">{selectedNode.type}</strong>
              <span className="text-gray-900 dark:text-white font-semibold">{selectedNode.label}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Connected: {edgesRef.current
                .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                .map(e => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                  const other = nodeById.get(otherId);
                  return `${other?.label || otherId} (${e.label})`;
                }).join(', ') || 'none'}
            </div>
          </div>
        )}
    </div>
  );
}

// ---------- Search Result Graph ----------
interface GNode { id: string; type: string; label: string; score: number; x: number; y: number; vx: number; vy: number }
interface GEdge { source: string; target: string; label: string }

const G_COLORS: Record<string, string> = { db: '#6366f1', table: '#10b981', column: '#f59e0b', token: '#ef4444' };
const G_RADIUS: Record<string, number> = { db: 28, table: 22, column: 16, token: 14 };

function SearchResultGraph({ matches, tokens }: { matches: MatchResult[]; tokens: string[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null);
  const [, forceRender] = useState(0);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string; offX: number; offY: number } | null>(null);
  const tickRef = useRef(0);

  // Build graph data from matches tree
  useEffect(() => {
    const nodeMap = new Map<string, GNode>();
    const edges: GEdge[] = [];
    const cx = 400, cy = 250;

    // Add token nodes
    tokens.forEach((t, i) => {
      const angle = (2 * Math.PI * i) / Math.max(tokens.length, 1);
      nodeMap.set(`token:${t}`, { id: `token:${t}`, type: 'token', label: t, score: 1, x: cx + Math.cos(angle) * 50, y: cy + Math.sin(angle) * 50, vx: 0, vy: 0 });
    });

    function walk(node: MatchResult, parentId?: string) {
      const nid = `${node.level}:${node.sha1}`;
      if (!nodeMap.has(nid)) {
        const ring = node.level === 'db' ? 140 : node.level === 'table' ? 240 : 330;
        const jitter = (Math.random() - 0.5) * 60;
        const angle = Math.random() * Math.PI * 2;
        nodeMap.set(nid, { id: nid, type: node.level, label: node.name || node.sha1.slice(0, 10), score: node.score, x: cx + Math.cos(angle) * ring + jitter, y: cy + Math.sin(angle) * ring + jitter, vx: 0, vy: 0 });
      }
      if (parentId) {
        edges.push({ source: parentId, target: nid, label: node.level === 'table' ? 'has_table' : node.level === 'column' ? 'has_column' : 'child' });
      }
      // Connect columns to matching tokens
      if (node.level === 'column') {
        tokens.forEach(t => {
          if (node.name?.toLowerCase().includes(t.toLowerCase())) {
            edges.push({ source: `token:${t}`, target: nid, label: 'matches' });
          }
        });
      }
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => walk(child, nid));
      }
    }

    matches.forEach(m => walk(m));
    nodesRef.current = Array.from(nodeMap.values());
    edgesRef.current = edges;
    forceRender(++tickRef.current);

    // Run force simulation
    const nodeById = new Map(nodesRef.current.map(n => [n.id, n]));
    let iter = 0;
    const maxIter = 200;

    const tick = () => {
      if (iter >= maxIter) return;
      iter++;
      const alpha = 1 - iter / maxIter;
      const ns = nodesRef.current;

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (600 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ns[i].vx -= fx; ns[i].vy -= fy;
          ns[j].vx += fx; ns[j].vy += fy;
        }
      }

      // Attraction
      edgesRef.current.forEach(e => {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = e.label === 'matches' ? 100 : 130;
        const force = (dist - target) * 0.02 * alpha;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      });

      // Center gravity
      ns.forEach(n => {
        n.vx += (cx - n.x) * 0.002 * alpha;
        n.vy += (cy - n.y) * 0.002 * alpha;
      });

      // Apply
      ns.forEach(n => {
        if (dragRef.current?.nodeId === n.id) return;
        n.vx *= 0.6; n.vy *= 0.6;
        n.x += n.vx; n.y += n.vy;
      });

      if (iter % 3 === 0) forceRender(++tickRef.current);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [matches, tokens]);

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      dragRef.current = { nodeId, offX: e.clientX - node.x, offY: e.clientY - node.y };
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
    if (node) {
      node.x = e.clientX - dragRef.current.offX;
      node.y = e.clientY - dragRef.current.offY;
      node.vx = 0; node.vy = 0;
      forceRender(++tickRef.current);
    }
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const nodeById = new Map(nodesRef.current.map(n => [n.id, n]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5 text-indigo-600" /> Search Result Graph
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-3 text-xs">
          {Object.entries(G_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
              <span className="capitalize text-gray-600 dark:text-gray-400">{type === 'db' ? 'Database' : type === 'token' ? 'Token' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
            </span>
          ))}
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" style={{ height: 420 }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox="0 0 800 500"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragRef.current ? 'grabbing' : 'default' }}
          >
            <defs>
              <marker id="sg-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
              </marker>
            </defs>

            {/* Edges */}
            {edgesRef.current.map((e, i) => {
              const s = nodeById.get(e.source);
              const t = nodeById.get(e.target);
              if (!s || !t) return null;
              const isMatch = e.label === 'matches';
              const isHighlighted = selectedNode?.id === e.source || selectedNode?.id === e.target;
              return (
                <g key={`e-${i}`}>
                  <line
                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={isHighlighted ? '#6366f1' : isMatch ? '#ef4444' : '#cbd5e1'}
                    strokeWidth={isHighlighted ? 2.5 : isMatch ? 1.5 : 1}
                    strokeOpacity={isHighlighted ? 0.9 : 0.5}
                    strokeDasharray={isMatch ? '4 2' : undefined}
                    markerEnd="url(#sg-arrow)"
                  />
                  {isMatch && (
                    <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 5} textAnchor="middle" fontSize={8} fill="#ef4444" fontWeight={600}>matches</text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodesRef.current.map(n => {
              const r = G_RADIUS[n.type] || 14;
              const fill = G_COLORS[n.type] || '#6b7280';
              const isSel = selectedNode?.id === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onMouseDown={e => handleMouseDown(e, n.id)}
                  onClick={e => { e.stopPropagation(); setSelectedNode(isSel ? null : n); }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle r={isSel ? r + 3 : r} fill={fill} fillOpacity={0.85}
                    stroke={isSel ? '#1e1b4b' : 'white'} strokeWidth={isSel ? 3 : 1.5} />
                  <text dy={4} textAnchor="middle" fontSize={r * 0.6} fill="white" fontWeight={700} className="select-none pointer-events-none">
                    {n.type === 'db' ? 'DB' : n.type === 'table' ? 'T' : n.type === 'column' ? 'C' : '?'}
                  </text>
                  <text dy={r + 13} textAnchor="middle" fontSize={10} fill="#374151" fontWeight={500} className="select-none pointer-events-none">
                    {n.label.length > 16 ? n.label.slice(0, 14) + '…' : n.label}
                  </text>
                  {/* Score badge */}
                  <text dy={r + 24} textAnchor="middle" fontSize={8} fill="#9ca3af" className="select-none pointer-events-none">
                    {(n.score * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected node detail */}
        {selectedNode && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: G_COLORS[selectedNode.type] }} />
              <strong className="capitalize">{selectedNode.type === 'db' ? 'Database' : selectedNode.type}</strong>
              <span className="text-gray-900 dark:text-white font-semibold">{selectedNode.label}</span>
              <Badge>{(selectedNode.score * 100).toFixed(0)}% match</Badge>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Connected: {edgesRef.current.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).map(e => {
                const otherId = e.source === selectedNode.id ? e.target : e.source;
                const other = nodeById.get(otherId);
                return other?.label || otherId;
              }).join(', ')}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Token Lookup ----------
function TokenLookupPanel() {
  const [input, setInput] = useState('');
  const mutation = useMutation({
    mutationFn: (tokens: string[]) => lookupTokens(tokens),
  });

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const tokens = input.split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length) mutation.mutate(tokens);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5 text-orange-600" /> Token Lookup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleLookup} className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="email, price, order_id"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Looking up…' : 'Lookup'}
          </Button>
        </form>
        <p className="text-xs text-gray-500">Comma-separated tokens to find their leaf references</p>
        {mutation.data?.results && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {Object.entries(mutation.data.results).map(([token, refs]: [string, any]) => (
              <div key={token} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                <span className="text-sm font-semibold">{token}</span>
                {Object.entries(refs).map(([type, sha1s]: [string, any]) => (
                  sha1s.length > 0 && (
                    <div key={type} className="ml-3 mt-1">
                      <span className="text-xs text-gray-500 capitalize">{type}:</span>
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {sha1s.map((s: string) => (
                          <Badge key={s} variant="default"><span className="font-mono text-[10px]">{s.slice(0, 12)}…</span></Badge>
                        ))}
                      </div>
                    </div>
                  )
                ))}
                {Object.values(refs).every((v: any) => v.length === 0) && (
                  <p className="text-xs text-gray-400 ml-3 mt-1">No references found</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Resolve Compound Sources ----------
function ResolveSourcesPanel() {
  const [input, setInput] = useState('');
  const mutation = useMutation({
    mutationFn: (refs: string[]) => resolveTokens(refs),
  });

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    const refs = input.split(',').map(t => t.trim()).filter(Boolean);
    if (refs.length) mutation.mutate(refs);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-teal-600" /> Resolve Sources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleResolve} className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste SHA1 refs (comma-separated)"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Resolving…' : 'Resolve'}
          </Button>
        </form>
        <p className="text-xs text-gray-500">Resolve leaf SHA1 refs to their parent column → table → database chain</p>
        {mutation.data?.compounds?.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {mutation.data.compounds.map((c: any, i: number) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge>{c.type}</Badge>
                  <span className="font-semibold">{c.column_name}</span>
                </div>
                <div className="flex gap-4 text-gray-500 font-mono">
                  <span>leaf: {c.leaf_sha1?.slice(0, 12)}…</span>
                  <span>table: {c.table_sha1?.slice(0, 12)}…</span>
                  <span>db: {c.db_sha1?.slice(0, 12)}…</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {mutation.data?.compounds?.length === 0 && (
          <p className="text-xs text-gray-400">No compound sources found for these refs</p>
        )}
      </CardContent>
    </Card>
  );
}
