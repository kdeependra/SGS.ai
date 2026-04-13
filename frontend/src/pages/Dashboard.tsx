import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getHealth, listIndices, redisStats, listStoredMetadata } from '@/api/client';
import api from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Activity, Database, GitBranch, Hash, Layers, HardDrive,
  Search, Settings, ArrowRight, Server, Key, Zap,
} from 'lucide-react';

export default function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: 30000 });
  const indices = useQuery({ queryKey: ['indices'], queryFn: listIndices });
  const stats = useQuery({ queryKey: ['redis-stats'], queryFn: redisStats, refetchInterval: 15000 });
  const stored = useQuery({ queryKey: ['stored-metadata'], queryFn: listStoredMetadata, refetchInterval: 15000 });
  const mcp = useQuery({
    queryKey: ['mcp-health'],
    queryFn: () => api.get('/metadata/mcp/health').then(r => r.data),
    refetchInterval: 30000,
  });

  const totalDocs = indices.data?.indices?.reduce((sum: number, idx: any) => sum + (idx.num_docs || 0), 0) ?? 0;
  const indexCount = indices.data?.indices?.length ?? 0;
  const prefixes = stats.data?.prefixes ?? {};
  const totalKeys = stats.data?.total_keys ?? 0;

  const quickActions = [
    { to: '/sources', label: 'Collect Metadata', desc: 'Connect to MySQL, CSV, or Documents via MCP', icon: Layers, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    { to: '/redis', label: 'Manage Redis', desc: 'Browse keys, indices, tokens, and edges', icon: HardDrive, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
    { to: '/search', label: 'Search', desc: 'Prompt-based search across all ingested sources', icon: Search, color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    { to: '/edges', label: 'Explore Edges', desc: 'View entity relationships and hierarchy', icon: GitBranch, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    { to: '/admin', label: 'Admin', desc: 'System health, indices, and configuration', icon: Settings, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">System overview and quick actions</p>
      </div>

      {/* Status Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900">
              <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Redis</p>
              <p className="text-lg font-semibold">
                {health.isLoading ? '...' : health.data?.redis_connected ? (
                  <Badge variant="success">Connected</Badge>
                ) : (
                  <Badge variant="danger">Disconnected</Badge>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-lg bg-indigo-100 p-3 dark:bg-indigo-900">
              <Server className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">MCP Server</p>
              <p className="text-lg font-semibold">
                {mcp.isLoading ? '...' : mcp.isError ? (
                  <Badge variant="danger">Offline</Badge>
                ) : (
                  <Badge variant="success">{mcp.data?.service} v{mcp.data?.version}</Badge>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900">
              <Key className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Redis Keys</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{totalKeys}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-lg bg-yellow-100 p-3 dark:bg-yellow-900">
              <Database className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Indices</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{indexCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Redis Data Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" /> Redis Data</CardTitle>
            <Link to="/redis" className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 flex items-center gap-1">
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {totalKeys > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Databases', count: prefixes['meta:db'] ?? 0, color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300' },
                { label: 'Tables', count: prefixes['meta:table'] ?? 0, color: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300' },
                { label: 'Columns', count: prefixes['meta:column'] ?? 0, color: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300' },
                { label: 'Tokens', count: prefixes['meta:tokens'] ?? 0, color: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300' },
                { label: 'Edges', count: (prefixes['edge:head'] ?? 0) + (prefixes['edge:tail'] ?? 0), color: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300' },
                { label: 'Snapshots', count: prefixes['meta:snapshot'] ?? 0, color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300' },
              ].map(item => (
                <div key={item.label} className={`rounded-lg border p-3 text-center ${item.color}`}>
                  <p className="text-2xl font-bold">{item.count}</p>
                  <p className="text-xs font-medium mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-500 mb-3">No data in Redis yet</p>
              <Link to="/sources" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                <Layers className="h-4 w-4" /> Collect Metadata
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map(action => (
              <Link key={action.to} to={action.to}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                <div className={`rounded-lg p-2 ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                    {action.label}
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{action.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bottom row: Stored Metadata + Indices + Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stored Metadata */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Stored Metadata</CardTitle>
              <Link to="/sources" className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {(stored.data?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {stored.data!.map((item: any) => (
                  <div key={item.sha1} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-900">
                    <div className="flex items-center gap-2 min-w-0">
                      <Database className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{item.database || item.file_name || item.sha1?.slice(0, 12)}</span>
                    </div>
                    <Badge>{item.source_type}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No stored metadata. <Link to="/sources" className="text-indigo-600 hover:underline">Collect some</Link>.</p>
            )}
          </CardContent>
        </Card>

        {/* Indices */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Search Indices</CardTitle>
              <Link to="/redis" className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 flex items-center gap-1">
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {indices.data?.indices?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2 text-xs">Name</th>
                    <th className="pb-2 text-right text-xs">Docs</th>
                  </tr>
                </thead>
                <tbody>
                  {indices.data.indices.map((idx: any) => (
                    <tr key={idx.name} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1.5 font-mono text-xs">{idx.name}</td>
                      <td className="py-1.5 text-right text-xs">{idx.num_docs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-500">No indices. <Link to="/redis" className="text-indigo-600 hover:underline">Initialize</Link>.</p>
            )}
          </CardContent>
        </Card>

        {/* Modules */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Redis Modules</CardTitle></CardHeader>
          <CardContent>
            {health.data?.modules?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {health.data.modules.map((m: string) => <Badge key={m}>{m}</Badge>)}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Loading…</p>
            )}
            {health.data?.write_read_ok != null && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">Write/Read:</span>
                {health.data.write_read_ok ? <Badge variant="success">OK</Badge> : <Badge variant="danger">Fail</Badge>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
