import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  redisFlush, redisStats, redisBrowseKeys, redisGetKey, redisDeleteKeys,
  redisListIndices, redisInitAllIndices, redisCreateIndex, redisDropIndex,
  redisRegisterDatabase, redisRegisterTable,
  redisTokenize, redisLookupTokens, redisIngestTokens,
  redisCreateEdge, redisCheckEdge, redisDatabaseInfo,
  redisSearchColumns, redisColumnStats, redisSimilarColumns,
  redisCleanupCategories,
  storeMetadata, listStoredMetadata, deleteStoredMetadata,
} from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Database as DbIcon, HardDrive, Trash2, Search, RefreshCw,
  Layers, Key, List, Server, GitBranch, FileText, Hash, Zap,
  AlertTriangle, ChevronDown, ChevronRight, Eye, X, Archive,
} from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function RedisPage() {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: HardDrive },
    { id: 'keys', label: 'Key Browser', icon: Key },
    { id: 'indices', label: 'Indices', icon: List },
    { id: 'stored', label: 'Stored Metadata', icon: Archive },
    { id: 'register', label: 'Register Entities', icon: DbIcon },
    { id: 'tokens', label: 'Token Operations', icon: Hash },
    { id: 'columns', label: 'Column Analytics', icon: Search },
    { id: 'edges', label: 'Edges', icon: GitBranch },
    { id: 'cleanup', label: 'Cleanup / Flush', icon: Trash2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <HardDrive className="h-7 w-7 text-red-600" /> Redis Management
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Full control over Redis storage — all redis_dev.ipynb functions
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b dark:border-gray-700 pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.id
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 dark:hover:text-gray-300'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'keys' && <KeyBrowserTab />}
      {activeTab === 'indices' && <IndicesTab />}
      {activeTab === 'stored' && <StoredMetadataTab />}
      {activeTab === 'register' && <RegisterTab />}
      {activeTab === 'tokens' && <TokensTab />}
      {activeTab === 'columns' && <ColumnsTab />}
      {activeTab === 'edges' && <EdgesTab />}
      {activeTab === 'cleanup' && <CleanupTab />}
    </div>
  );
}

// ━━━━━━━━━━ OVERVIEW TAB ━━━━━━━━━━
function OverviewTab() {
  const stats = useQuery({ queryKey: ['redis-stats'], queryFn: redisStats });

  const prefixColors: Record<string, string> = {
    'meta:db': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'meta:table': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'meta:column': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'meta:tokens': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    'meta:snapshot': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    'meta:file': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    'edge:head': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'edge:tail': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    'hll:col': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Key Statistics</h3>
        <Button variant="ghost" size="sm" onClick={() => stats.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {stats.isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : stats.data ? (
        <>
          <Card>
            <CardContent className="py-4">
              <p className="text-3xl font-bold text-indigo-600">{stats.data.total_keys}</p>
              <p className="text-sm text-gray-500">Total keys in database</p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(stats.data.prefixes || {}).map(([prefix, count]) => (
              <Card key={prefix}>
                <CardContent className="py-3 flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${prefixColors[prefix] || 'bg-gray-100 text-gray-700'}`}>
                    {prefix}
                  </span>
                  <span className="text-lg font-semibold">{String(count)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ━━━━━━━━━━ KEY BROWSER TAB ━━━━━━━━━━
function KeyBrowserTab() {
  const [pattern, setPattern] = useState('meta:*');
  const [limit, setLimit] = useState(50);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState<any>(null);

  const browseMut = useMutation({ mutationFn: () => redisBrowseKeys(pattern, limit) });

  const viewKey = async (key: string) => {
    if (selectedKey === key) { setSelectedKey(null); setKeyValue(null); return; }
    const val = await redisGetKey(key);
    setKeyValue(val);
    setSelectedKey(key);
  };

  const delMut = useMutation({
    mutationFn: (key: string) => redisDeleteKeys(key, true),
    onSuccess: () => browseMut.mutate(),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex gap-2">
            <Input label="Pattern" value={pattern} onChange={e => setPattern(e.target.value)} />
            <Input label="Limit" type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => browseMut.mutate()} disabled={browseMut.isPending}>
              <Search className="h-4 w-4 mr-1" /> Browse
            </Button>
            {/* Quick presets */}
            {['meta:db:*', 'meta:table:*', 'meta:column:*', 'meta:tokens:*', 'meta:snapshot:*', 'edge:head:*'].map(p => (
              <button key={p} onClick={() => { setPattern(p); }}
                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300">
                {p.replace('meta:', '').replace(':*', '')}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {browseMut.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{browseMut.data.length} key(s) found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[500px] overflow-auto">
            {browseMut.data.map((k: any) => (
              <div key={k.key}>
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge>{k.type}</Badge>
                    <span className="font-mono text-xs truncate">{k.key}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => viewKey(k.key)} className="p-1 text-gray-400 hover:text-indigo-500">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => delMut.mutate(k.key)} className="p-1 text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {selectedKey === k.key && keyValue && (
                  <div className="ml-6 p-3 rounded bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 mb-1">
                    <pre className="text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                      {JSON.stringify(keyValue.value, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ━━━━━━━━━━ INDICES TAB ━━━━━━━━━━
function IndicesTab() {
  const queryClient = useQueryClient();
  const indices = useQuery({ queryKey: ['redis-indices'], queryFn: redisListIndices });
  const initMut = useMutation({
    mutationFn: redisInitAllIndices,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redis-indices'] }),
  });
  const [newIdx, setNewIdx] = useState('idx:db');
  const createMut = useMutation({
    mutationFn: () => redisCreateIndex(newIdx),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redis-indices'] }),
  });
  const dropMut = useMutation({
    mutationFn: (name: string) => redisDropIndex(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redis-indices'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={() => initMut.mutate()} disabled={initMut.isPending}>
          <Zap className="h-4 w-4 mr-1" />{initMut.isPending ? 'Initializing…' : 'Initialize All Indices'}
        </Button>
        {initMut.data && <Badge variant="success">Done</Badge>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Create Single Index</CardTitle></CardHeader>
        <CardContent className="flex gap-2 items-end">
          <select value={newIdx} onChange={e => setNewIdx(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option value="idx:db">idx:db (Databases)</option>
            <option value="idx:table">idx:table (Tables)</option>
            <option value="idx:column">idx:column (Columns)</option>
            <option value="idx:tokens">idx:tokens (Tokens)</option>
          </select>
          <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>Create</Button>
          {createMut.data && <Badge variant="success">{createMut.data.status}</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Active Indices</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => indices.refetch()}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {indices.data?.length > 0 ? (
            <div className="space-y-2">
              {indices.data.map((idx: any) => (
                <div key={idx.name} className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{idx.name}</span>
                    <Badge>{idx.num_docs} docs</Badge>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => dropMut.mutate(idx.name)}>Drop</Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No indices found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━ STORED METADATA TAB ━━━━━━━━━━
function StoredMetadataTab() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [dbInfo, setDbInfo] = useState<any>(null);

  const stored = useQuery({ queryKey: ['stored-metadata'], queryFn: listStoredMetadata });

  const deleteMut = useMutation({
    mutationFn: (sha1: string) => deleteStoredMetadata(sha1),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stored-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['redis-stats'] });
    },
  });

  const viewDetail = async (sha1: string) => {
    if (expanded === sha1) { setExpanded(null); setDetail(null); setDbInfo(null); return; }
    setDetail(null);
    setDbInfo(null);
    try {
      const [snapshot, db] = await Promise.allSettled([
        import('@/api/client').then(m => m.getStoredMetadata(sha1)),
        redisDatabaseInfo(sha1),
      ]);
      if (snapshot.status === 'fulfilled') setDetail(snapshot.value);
      if (db.status === 'fulfilled') setDbInfo(db.value);
    } catch { /* ignore */ }
    setExpanded(sha1);
  };

  const typeIcon: Record<string, typeof DbIcon> = {
    mysql: DbIcon, mssql: Server, csv: FileText, document: FileText,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Stored Metadata Snapshots</h3>
        <Button variant="ghost" size="sm" onClick={() => stored.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {stored.isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : stored.data?.length > 0 ? (
        <div className="space-y-2">
          {stored.data.map((item: any) => {
            const Icon = typeIcon[item.source_type] ?? FileText;
            return (
              <Card key={item.sha1}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Icon className="h-5 w-5 text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {item.database || item.file_name || item.sha1.slice(0, 16)}
                        </p>
                        <div className="flex gap-2 mt-0.5 flex-wrap">
                          <Badge>{item.source_type}</Badge>
                          {item.table_count != null && <Badge>Tables: {item.table_count}</Badge>}
                          {item.row_count != null && <Badge>Rows: {item.row_count}</Badge>}
                          {item.column_count != null && <Badge>Cols: {item.column_count}</Badge>}
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sha1}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => viewDetail(item.sha1)} className="p-1 text-gray-400 hover:text-indigo-500" title="View details">
                        {expanded === item.sha1 ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <button onClick={() => deleteMut.mutate(item.sha1)} className="p-1 text-gray-400 hover:text-red-500" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {expanded === item.sha1 && (
                    <div className="mt-3 space-y-3">
                      {/* Database hierarchy from Redis */}
                      {dbInfo && dbInfo.tables_info && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Redis Hierarchy ({dbInfo.tables_info.length} tables)
                          </h4>
                          <div className="space-y-1">
                            {dbInfo.tables_info.map((t: any) => (
                              <details key={t.table_sha1 || t.table_name} className="border rounded dark:border-gray-700">
                                <summary className="px-3 py-2 cursor-pointer text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between">
                                  <span>{t.table_name}</span>
                                  <div className="flex gap-2">
                                    <Badge>Rows: {t.row_count || 0}</Badge>
                                    <Badge>{t.columns_info?.length || 0} cols</Badge>
                                  </div>
                                </summary>
                                {t.columns_info?.length > 0 && (
                                  <div className="px-3 pb-2">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                                          <th className="pb-1 pr-2">Column</th>
                                          <th className="pb-1 pr-2">Type</th>
                                          <th className="pb-1 pr-2">Nullable</th>
                                          <th className="pb-1 pr-2">Cardinality</th>
                                          <th className="pb-1">SHA1</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {t.columns_info.map((c: any) => (
                                          <tr key={c.column_sha1 || c.column_name} className="border-t border-gray-50 dark:border-gray-800">
                                            <td className="py-1 pr-2 font-mono">{c.column_name}</td>
                                            <td className="py-1 pr-2">{c.data_type}</td>
                                            <td className="py-1 pr-2">{c.nullable}</td>
                                            <td className="py-1 pr-2">{c.cardinality || '—'}</td>
                                            <td className="py-1 font-mono text-gray-400">{(c.column_sha1 || '').slice(0, 12)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </details>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Raw snapshot JSON */}
                      {detail && (
                        <details className="border rounded dark:border-gray-700">
                          <summary className="px-3 py-2 cursor-pointer text-sm text-gray-500">Raw Snapshot JSON</summary>
                          <pre className="px-3 pb-3 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                            {JSON.stringify(detail, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-500">
            No stored metadata yet. Go to Sources to collect and save metadata.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ━━━━━━━━━━ REGISTER ENTITIES TAB ━━━━━━━━━━
function RegisterTab() {
  const [dbForm, setDbForm] = useState({ db_name: '', db_type: 'mysql', host: 'localhost', port: 3306 });
  const [tableForm, setTableForm] = useState({ table_name: '', db_sha1: '', schema_name: 'public', row_count: 0 });

  const dbMut = useMutation({ mutationFn: () => redisRegisterDatabase(dbForm) });
  const tableMut = useMutation({ mutationFn: () => redisRegisterTable(tableForm) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><DbIcon className="h-5 w-5 text-blue-600" /> Register Database</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="DB Name" value={dbForm.db_name} onChange={e => setDbForm({ ...dbForm, db_name: e.target.value })} />
            <select value={dbForm.db_type} onChange={e => setDbForm({ ...dbForm, db_type: e.target.value })}
              className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white mt-5">
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="mssql">MSSQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Host" value={dbForm.host} onChange={e => setDbForm({ ...dbForm, host: e.target.value })} />
            <Input label="Port" type="number" value={dbForm.port} onChange={e => setDbForm({ ...dbForm, port: Number(e.target.value) })} />
          </div>
          <Button size="sm" onClick={() => dbMut.mutate()} disabled={dbMut.isPending || !dbForm.db_name}>
            Register Database
          </Button>
          {dbMut.data && (
            <div className="text-xs text-green-600 space-y-1">
              <p>Registered: {dbMut.data.db_name}</p>
              <p className="font-mono">SHA1: {dbMut.data.sha1}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-green-600" /> Register Table</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input label="Table Name" value={tableForm.table_name} onChange={e => setTableForm({ ...tableForm, table_name: e.target.value })} />
          <Input label="DB SHA1 (parent)" value={tableForm.db_sha1} onChange={e => setTableForm({ ...tableForm, db_sha1: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Schema" value={tableForm.schema_name} onChange={e => setTableForm({ ...tableForm, schema_name: e.target.value })} />
            <Input label="Row Count" type="number" value={tableForm.row_count} onChange={e => setTableForm({ ...tableForm, row_count: Number(e.target.value) })} />
          </div>
          <Button size="sm" onClick={() => tableMut.mutate()} disabled={tableMut.isPending || !tableForm.table_name || !tableForm.db_sha1}>
            Register Table
          </Button>
          {tableMut.data && (
            <div className="text-xs text-green-600 space-y-1">
              <p>Registered: {tableMut.data.table_name}</p>
              <p className="font-mono">SHA1: {tableMut.data.sha1}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━ TOKEN OPERATIONS TAB ━━━━━━━━━━
function TokensTab() {
  const [prompt, setPrompt] = useState('');
  const [ingestForm, setIngestForm] = useState({ tokens: '', source_sha1: '', source_type: 'column' });

  const tokenizeMut = useMutation({ mutationFn: () => redisTokenize(prompt) });
  const lookupMut = useMutation({
    mutationFn: (tokens: string[]) => redisLookupTokens(tokens),
  });
  const ingestMut = useMutation({
    mutationFn: () => {
      const tokens = ingestForm.tokens.split(',').map(t => t.trim()).filter(Boolean);
      return redisIngestTokens({ tokens, source_sha1: ingestForm.source_sha1, source_type: ingestForm.source_type });
    },
  });

  return (
    <div className="space-y-4">
      {/* Tokenize */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Hash className="h-4 w-4" /> Tokenize Prompt</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} placeholder="Enter a prompt to tokenize…"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => tokenizeMut.mutate()} disabled={tokenizeMut.isPending || !prompt}>Tokenize</Button>
            {tokenizeMut.data && (
              <Button size="sm" variant="secondary" onClick={() => lookupMut.mutate(tokenizeMut.data.filtered_tokens)}>
                Lookup in Redis
              </Button>
            )}
          </div>
          {tokenizeMut.data && (
            <div className="text-sm space-y-2">
              <div>
                <span className="text-gray-500">All tokens:</span>{' '}
                <span className="font-mono text-xs">{tokenizeMut.data.all_tokens.join(', ')}</span>
              </div>
              <div>
                <span className="text-gray-500">Filtered (no stop words):</span>{' '}
                <div className="flex flex-wrap gap-1 mt-1">
                  {tokenizeMut.data.filtered_tokens.map((t: string) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lookup results */}
      {lookupMut.data && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Token Lookup Results</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <h4 className="text-xs text-gray-500 mb-1">Refs by Type</h4>
              {Object.entries(lookupMut.data.refs_by_type || {}).map(([type, refs]) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <Badge>{type}</Badge>
                  <span className="text-gray-600">{(refs as string[]).length} ref(s)</span>
                </div>
              ))}
              {Object.keys(lookupMut.data.refs_by_type || {}).length === 0 && (
                <p className="text-xs text-gray-400">No references found in token index</p>
              )}
            </div>
            <details className="border rounded dark:border-gray-700">
              <summary className="px-3 py-2 cursor-pointer text-xs text-gray-500">Token details</summary>
              <pre className="px-3 pb-3 text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(lookupMut.data.tokens, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      {/* Ingest tokens */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4" /> Ingest Tokens</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input label="Tokens (comma-separated)" value={ingestForm.tokens}
            onChange={e => setIngestForm({ ...ingestForm, tokens: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Source SHA1" value={ingestForm.source_sha1}
              onChange={e => setIngestForm({ ...ingestForm, source_sha1: e.target.value })} />
            <select value={ingestForm.source_type} onChange={e => setIngestForm({ ...ingestForm, source_type: e.target.value })}
              className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white mt-5">
              <option value="column">Column</option>
              <option value="file">File</option>
              <option value="email">Email</option>
              <option value="prompt">Prompt</option>
            </select>
          </div>
          <Button size="sm" onClick={() => ingestMut.mutate()} disabled={ingestMut.isPending || !ingestForm.tokens || !ingestForm.source_sha1}>
            Ingest
          </Button>
          {ingestMut.data && (
            <p className="text-xs text-green-600">Indexed {ingestMut.data.tokens_indexed} tokens for {ingestMut.data.source_sha1.slice(0, 12)}…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━ COLUMN ANALYTICS TAB ━━━━━━━━━━
function ColumnsTab() {
  const [searchPattern, setSearchPattern] = useState('');
  const [selectedCol, setSelectedCol] = useState<string | null>(null);

  const searchMut = useMutation({ mutationFn: () => redisSearchColumns(searchPattern) });
  const statsMut = useMutation({ mutationFn: (sha1: string) => redisColumnStats(sha1) });
  const similarMut = useMutation({ mutationFn: (sha1: string) => redisSimilarColumns(sha1) });

  const viewColumn = async (sha1: string) => {
    setSelectedCol(sha1);
    statsMut.mutate(sha1);
    similarMut.mutate(sha1);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Search className="h-4 w-4" /> Search Columns by Name</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input label="Column name pattern" value={searchPattern} onChange={e => setSearchPattern(e.target.value)} />
            <Button size="sm" className="mt-5" onClick={() => searchMut.mutate()} disabled={searchMut.isPending || !searchPattern}>
              Search
            </Button>
          </div>

          {searchMut.data && searchMut.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                    <th className="pb-2 pr-3">Column</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Cardinality</th>
                    <th className="pb-2 pr-3">SHA1</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {searchMut.data.map((col: any) => (
                    <tr key={col.column_sha1} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1.5 pr-3 font-mono text-xs font-semibold">{col.column_name}</td>
                      <td className="py-1.5 pr-3 text-xs">{col.data_type}</td>
                      <td className="py-1.5 pr-3 text-xs">{col.cardinality || '—'}</td>
                      <td className="py-1.5 pr-3 text-xs font-mono text-gray-400">{col.column_sha1?.slice(0, 12)}</td>
                      <td className="py-1.5">
                        <button onClick={() => viewColumn(col.column_sha1)} className="text-xs text-indigo-500 hover:underline">
                          Stats
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {searchMut.data && searchMut.data.length === 0 && (
            <p className="text-xs text-gray-400">No columns found for "{searchPattern}"</p>
          )}
        </CardContent>
      </Card>

      {/* Column statistics */}
      {statsMut.data && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Column Statistics: {statsMut.data.column_name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {Object.entries(statsMut.data).map(([k, v]) => (
                <div key={k}>
                  <span className="text-gray-500 text-xs">{k}:</span>
                  <p className="font-mono text-xs">{typeof v === 'number' ? v.toLocaleString() : String(v)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Similar columns */}
      {similarMut.data && similarMut.data.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Similar Columns</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {similarMut.data.map((c: any) => (
                <div key={c.column_sha1} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
                  <span className="font-mono text-xs font-semibold">{c.column_name}</span>
                  <Badge>{c.data_type}</Badge>
                  <span className="text-xs text-gray-400 font-mono">{c.column_sha1?.slice(0, 12)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ━━━━━━━━━━ EDGES TAB ━━━━━━━━━━
function EdgesTab() {
  const [form, setForm] = useState({ left_sha1: '', right_sha1: '', label: 'contains_table' });
  const createMut = useMutation({ mutationFn: () => redisCreateEdge(form) });

  const [checkForm, setCheckForm] = useState({ left_sha1: '', right_sha1: '', label: 'contains_table' });
  const checkMut = useMutation({ mutationFn: () => redisCheckEdge(checkForm) });

  const browseMut = useMutation({ mutationFn: () => redisBrowseKeys('edge:head:*', 50) });

  return (
    <div className="space-y-4">
      {/* Check Edge */}
      <Card className="border-indigo-200 dark:border-indigo-800">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Search className="h-4 w-4" /> Check Existing Edge</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Left SHA1 (source)" value={checkForm.left_sha1} onChange={e => setCheckForm({ ...checkForm, left_sha1: e.target.value })} />
            <Input label="Right SHA1 (target)" value={checkForm.right_sha1} onChange={e => setCheckForm({ ...checkForm, right_sha1: e.target.value })} />
          </div>
          <select value={checkForm.label} onChange={e => setCheckForm({ ...checkForm, label: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white w-full">
            <option value="contains_table">contains_table (DB → Table)</option>
            <option value="contains_column">contains_column (Table → Column)</option>
            <option value="references">references (FK: Column → Column)</option>
            <option value="similar_to">similar_to (Column → Column)</option>
            <option value="in_folder">in_folder (File → Folder)</option>
            <option value="in_mailbox">in_mailbox (Email → Mailbox)</option>
          </select>
          <Button size="sm" onClick={() => checkMut.mutate()} disabled={checkMut.isPending || !checkForm.left_sha1 || !checkForm.right_sha1}>
            {checkMut.isPending ? 'Checking…' : 'Check Edge'}
          </Button>
          {checkMut.error && <p className="text-xs text-red-500">{String(checkMut.error)}</p>}
          {checkMut.data && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={checkMut.data.exists ? 'success' : 'danger'}>
                  {checkMut.data.exists ? `Found (${checkMut.data.count})` : 'Not Found'}
                </Badge>
              </div>
              {checkMut.data.edges?.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-auto">
                  {checkMut.data.edges.map((e: any, i: number) => (
                    <div key={i} className="p-2 rounded bg-gray-50 dark:bg-gray-900 text-xs font-mono space-y-1">
                      <div><span className="text-gray-500">edge_sha1:</span> {e.e_sha1}</div>
                      <div><span className="text-gray-500">key:</span> {e.key}</div>
                      <div><span className="text-gray-500">label:</span> {e.label}</div>
                      <div><span className="text-gray-500">left:</span> {e.left}</div>
                      <div><span className="text-gray-500">right:</span> {e.right}</div>
                      <div><span className="text-gray-500">attr:</span> {e.attr}</div>
                      {e.timestamp && <div><span className="text-gray-500">timestamp:</span> {e.timestamp}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><GitBranch className="h-4 w-4" /> Create Entity Edge</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Left SHA1 (source)" value={form.left_sha1} onChange={e => setForm({ ...form, left_sha1: e.target.value })} />
            <Input label="Right SHA1 (target)" value={form.right_sha1} onChange={e => setForm({ ...form, right_sha1: e.target.value })} />
          </div>
          <select value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white w-full">
            <option value="contains_table">contains_table (DB → Table)</option>
            <option value="contains_column">contains_column (Table → Column)</option>
            <option value="references">references (FK: Column → Column)</option>
            <option value="similar_to">similar_to (Column → Column)</option>
            <option value="in_folder">in_folder (File → Folder)</option>
            <option value="in_mailbox">in_mailbox (Email → Mailbox)</option>
          </select>
          <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.left_sha1 || !form.right_sha1}>
            Create Edge
          </Button>
          {createMut.data && (
            <p className="text-xs text-green-600">Edge created: {createMut.data.edge_sha1}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Browse Edges</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => browseMut.mutate()}>Load</Button>
          </div>
        </CardHeader>
        <CardContent>
          {browseMut.data && browseMut.data.length > 0 ? (
            <div className="space-y-1 max-h-80 overflow-auto">
              {browseMut.data.map((k: any) => (
                <div key={k.key} className="flex items-center gap-2 p-2 text-xs font-mono hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                  <Badge>{k.type}</Badge>
                  <span className="truncate">{k.key}</span>
                </div>
              ))}
            </div>
          ) : browseMut.data?.length === 0 ? (
            <p className="text-xs text-gray-400">No edges found</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━ CLEANUP / FLUSH TAB ━━━━━━━━━━
function CleanupTab() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [flushConfirm, setFlushConfirm] = useState(false);

  const categories = [
    { id: 'databases', label: 'Databases', pattern: 'meta:db:*', color: 'text-blue-600' },
    { id: 'tables', label: 'Tables', pattern: 'meta:table:*', color: 'text-green-600' },
    { id: 'columns', label: 'Columns', pattern: 'meta:column:*', color: 'text-purple-600' },
    { id: 'tokens', label: 'Tokens', pattern: 'meta:tokens:*', color: 'text-orange-600' },
    { id: 'snapshots', label: 'Snapshots', pattern: 'meta:snapshot:*', color: 'text-amber-600' },
    { id: 'files', label: 'Files', pattern: 'meta:file:*', color: 'text-teal-600' },
    { id: 'edges_head', label: 'Edges (head)', pattern: 'edge:head:*', color: 'text-red-600' },
    { id: 'edges_tail', label: 'Edges (tail)', pattern: 'edge:tail:*', color: 'text-pink-600' },
    { id: 'hll', label: 'HLLSets', pattern: 'hll:col:*', color: 'text-indigo-600' },
  ];

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const cleanupMut = useMutation({
    mutationFn: () => redisCleanupCategories(selected, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redis-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stored-metadata'] });
    },
  });

  const flushMut = useMutation({
    mutationFn: () => redisFlush(true),
    onSuccess: () => {
      setFlushConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['redis-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stored-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['redis-indices'] });
    },
  });

  return (
    <div className="space-y-4">
      {/* Selective cleanup */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-orange-600" /> Selective Cleanup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Select categories to delete:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categories.map(cat => (
              <label key={cat.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                selected.includes(cat.id)
                  ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
                <input type="checkbox" checked={selected.includes(cat.id)} onChange={() => toggle(cat.id)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500" />
                <div>
                  <span className={`text-sm font-semibold ${cat.color}`}>{cat.label}</span>
                  <p className="text-xs text-gray-400 font-mono">{cat.pattern}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="danger" onClick={() => cleanupMut.mutate()} disabled={cleanupMut.isPending || selected.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete Selected ({selected.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(categories.map(c => c.id))}>Select All</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
          </div>
          {cleanupMut.data && (
            <div className="text-xs text-green-600 space-y-1">
              <p>Total deleted: {cleanupMut.data.total} keys</p>
              {Object.entries(cleanupMut.data.deleted || {}).map(([k, v]) => (
                <p key={k} className="font-mono">{k}: {String(v)}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flush DB */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Flush Entire Database
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">
            This will delete <strong>ALL</strong> keys in Redis. This action cannot be undone.
          </p>
          {!flushConfirm ? (
            <Button variant="danger" onClick={() => setFlushConfirm(true)}>
              I want to flush the database
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <Button variant="danger" onClick={() => flushMut.mutate()} disabled={flushMut.isPending}>
                {flushMut.isPending ? 'Flushing…' : 'Confirm: FLUSH ALL DATA'}
              </Button>
              <Button variant="ghost" onClick={() => setFlushConfirm(false)}>Cancel</Button>
            </div>
          )}
          {flushMut.data && <p className="text-xs text-green-600">Database flushed successfully</p>}
        </CardContent>
      </Card>
    </div>
  );
}
