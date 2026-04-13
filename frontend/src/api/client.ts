import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sgs_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Auth ----
export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password }).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
export const listAuthUsers = () => api.get('/auth/users').then(r => r.data);

// ---- Admin ----
export const getHealth = () => api.get('/admin/health').then(r => r.data);
export const initIndices = () => api.post('/admin/indices/init').then(r => r.data);
export const listIndices = () => api.get('/admin/indices').then(r => r.data);
export const getIndexInfo = (name: string) => api.get(`/admin/indices/${name}`).then(r => r.data);
export const cleanup = (prefix: string) =>
  api.delete('/admin/cleanup', { data: { prefix, confirm: true } }).then(r => r.data);

// ---- Sources ----
export const createDatabase = (data: { db_name: string; db_type: string; host: string; port: number }) =>
  api.post('/sources/databases', data).then(r => r.data);
export const getDatabase = (sha1: string) => api.get(`/sources/databases/${sha1}`).then(r => r.data);
export const createTable = (data: { table_name: string; db_sha1: string; schema_name?: string; row_count?: number }) =>
  api.post('/sources/tables', data).then(r => r.data);
export const loadColumn = (data: {
  column_name: string; table_sha1: string; db_sha1: string;
  values: string[]; data_type?: string; nullable?: boolean;
}) => api.post('/sources/columns', data).then(r => r.data);
export const loadColumnsBatch = (columns: any[]) =>
  api.post('/sources/columns/batch', { columns }).then(r => r.data);
export const searchColumns = (pattern: string) =>
  api.get('/sources/columns/search', { params: { pattern } }).then(r => r.data);
export const getColumnStats = (sha1: string) =>
  api.get(`/sources/columns/${sha1}/stats`).then(r => r.data);

// ---- Search ----
export const searchPrompt = (prompt: string, thresholds?: Record<string, number>) =>
  api.post('/search/prompt', { prompt, thresholds }).then(r => r.data);
export const lookupTokens = (tokens: string[]) =>
  api.post('/search/tokens/lookup', { tokens }).then(r => r.data);
export const resolveTokens = (leaf_refs: string[]) =>
  api.post('/search/tokens/resolve', { leaf_refs }).then(r => r.data);
export const rawSearch = (index_name: string, query: string) =>
  api.post('/search/raw', { index_name, query }).then(r => r.data);
export const nlpSearch = (prompt: string) =>
  api.post('/search/nlp', { prompt }).then(r => r.data);
export const syncMetadataGraph = () =>
  api.post('/search/graph/sync').then(r => r.data);

// ---- Ingest ----
export const ingest = (location_tokens: string[], dataset_tokens: string[]) =>
  api.post('/ingest', { location_tokens, dataset_tokens }).then(r => r.data);
export const commit = (data: { location_key: string; dataset_key: string; label?: string; metadata?: any }) =>
  api.post('/ingest/commit', data).then(r => r.data);
export const listCommits = () => api.get('/ingest/commits').then(r => r.data);
export const getCommit = (id: string) => api.get(`/ingest/commits/${id}`).then(r => r.data);

// ---- HLLSets ----
export const storeHllset = (key: string, values: string[]) =>
  api.post('/hllsets/store', { key, values }).then(r => r.data);
export const retrieveHllset = (key: string) => api.get(`/hllsets/${key}`).then(r => r.data);
export const hllsetOperation = (operation: string, keys: string[], result_key: string) =>
  api.post('/hllsets/operation', { operation, keys, result_key }).then(r => r.data);

// ---- Edges ----
export const createEdge = (data: { left: string; right: string; label?: string; attr?: any }) =>
  api.post('/edges', data).then(r => r.data);
export const archiveEdges = (entity_sha1: string) =>
  api.post('/edges/archive', { entity_sha1 }).then(r => r.data);
export const searchEdges = (state: string = 'head') =>
  api.get('/edges', { params: { state } }).then(r => r.data);
export const findSimilarColumns = (sha1: string) =>
  api.get(`/edges/similar/${sha1}`).then(r => r.data);

// ---- Graph / Bitmap ----
export const getMetadataGraph = () =>
  api.get('/graph/metadata').then(r => r.data);
export const graphQuery = (query: string) =>
  api.post('/graph/query', { query }).then(r => r.data);
export const bitmapCommand = (command: string, args: string[]) =>
  api.post('/bitmap/command', { command, args }).then(r => r.data);

// ---- Metadata (MCP) ----
export const collectMysqlMetadata = (data: {
  host: string; port: number; user: string; password: string;
  database: string; table?: string; prompt?: string;
  db_type?: string; schema_name?: string;
}) => api.post('/metadata/mysql', data).then(r => r.data);

export const collectMssqlMetadata = (data: {
  host: string; port: number; user: string; password: string;
  database: string; table: string; schema_name?: string;
}) => api.post('/metadata/mssql', data).then(r => r.data);

export const collectCsvMetadata = (data: {
  file_path?: string; content?: string; file_name?: string;
}) => api.post('/metadata/csv', data).then(r => r.data);

export const uploadCsvMetadata = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/metadata/csv/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const uploadCsvMetadataMulti = async (files: File[]) => {
  const results = await Promise.all(
    files.map(f => uploadCsvMetadata(f))
  );
  return results;
};

export const collectDocumentMetadata = (data: {
  file_path?: string; content?: string; file_name?: string;
}) => api.post('/metadata/document', data).then(r => r.data);

export const uploadDocumentMetadata = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/metadata/document/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const uploadDocumentMetadataMulti = async (files: File[]) => {
  const results = await Promise.all(
    files.map(f => uploadDocumentMetadata(f))
  );
  return results;
};

export const collectCombinedMetadata = (data: {
  mysql?: { host: string; port: number; user: string; password: string; database: string; table: string };
  csv?: { file_path?: string; content?: string; file_name?: string };
  document?: { file_path?: string; content?: string; file_name?: string };
}) => api.post('/metadata/combined', data).then(r => r.data);

// ---- AI Analysis ----
export const analyzeMetadata = (data: {
  prompt: string;
  metadata: any[];
  model?: string;
}) => api.post('/metadata/analyze', data).then(r => r.data);

// ---- Metadata Storage (Redis) ----
export const storeMetadata = (metadata: any) =>
  api.post('/metadata/store', { metadata }).then(r => r.data);
export const listStoredMetadata = () =>
  api.get('/metadata/stored').then(r => r.data);
export const getStoredMetadata = (sha1: string) =>
  api.get(`/metadata/stored/${sha1}`).then(r => r.data);
export const deleteStoredMetadata = (sha1: string) =>
  api.delete(`/metadata/stored/${sha1}`).then(r => r.data);

export const ingestMetadata = (sources: any[], P = 10) =>
  api.post('/metadata/ingest', { sources, P }).then(r => r.data);

// ---- Redis Management ----
export const redisFlush = (confirm = true) =>
  api.post('/redis/flush', { confirm }).then(r => r.data);
export const redisStats = () =>
  api.get('/redis/stats').then(r => r.data);
export const redisBrowseKeys = (pattern = '*', limit = 100) =>
  api.post('/redis/keys/browse', { pattern, limit }).then(r => r.data);
export const redisGetKey = (key: string) =>
  api.get(`/redis/keys/${key}`).then(r => r.data);
export const redisDeleteKeys = (pattern: string, confirm = true) =>
  api.post('/redis/keys/delete', { pattern, confirm }).then(r => r.data);
export const redisListIndices = () =>
  api.get('/redis/indices').then(r => r.data);
export const redisInitAllIndices = () =>
  api.post('/redis/indices/init-all').then(r => r.data);
export const redisCreateIndex = (index_name: string) =>
  api.post('/redis/indices/create', { index_name }).then(r => r.data);
export const redisDropIndex = (name: string) =>
  api.delete(`/redis/indices/${name}`).then(r => r.data);
export const redisRegisterDatabase = (data: { db_name: string; db_type: string; host: string; port: number }) =>
  api.post('/redis/register/database', data).then(r => r.data);
export const redisRegisterTable = (data: { table_name: string; db_sha1: string; schema_name?: string; row_count?: number }) =>
  api.post('/redis/register/table', data).then(r => r.data);
export const redisTokenize = (prompt: string) =>
  api.post('/redis/tokens/tokenize', { prompt }).then(r => r.data);
export const redisLookupTokens = (tokens: string[]) =>
  api.post('/redis/tokens/lookup', { tokens }).then(r => r.data);
export const redisIngestTokens = (data: { tokens: string[]; source_sha1: string; source_type: string; parent_chain?: any[] }) =>
  api.post('/redis/tokens/ingest', data).then(r => r.data);
export const redisCreateEdge = (data: { left_sha1: string; right_sha1: string; label: string; metadata?: any }) =>
  api.post('/redis/edges/create', data).then(r => r.data);
export const redisCheckEdge = (data: { left_sha1: string; right_sha1: string; label: string }) =>
  api.post('/redis/edges/check', data).then(r => r.data);
export const redisDatabaseInfo = (db_sha1: string) =>
  api.get(`/redis/databases/${db_sha1}`).then(r => r.data);
export const redisSearchColumns = (pattern: string) =>
  api.post('/redis/columns/search', { pattern }).then(r => r.data);
export const redisColumnStats = (sha1: string) =>
  api.get(`/redis/columns/${sha1}/stats`).then(r => r.data);
export const redisSimilarColumns = (sha1: string) =>
  api.get(`/redis/columns/${sha1}/similar`).then(r => r.data);
export const redisCleanupCategories = (categories: string[], confirm = true) =>
  api.post('/redis/cleanup', { categories, confirm }).then(r => r.data);
export const redisListCategories = () =>
  api.get('/redis/cleanup/categories').then(r => r.data);

export default api;
