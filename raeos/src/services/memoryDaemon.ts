/**
 * Memory Daemon API - Frontend bindings for Tauri commands
 * 
 * This module provides typed functions to interact with the memory daemon
 * through Tauri's backend commands.
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

export interface IngestItem {
  ts?: number;           // Unix timestamp in milliseconds (optional)
  kind: string;          // Event type: "chat:user", "chat:ai", "note", etc.
  text: string;          // The actual text content
  meta?: Record<string, any>;  // Additional metadata
  source?: string;       // Source identifier (defaults to "tauri")
}

export interface IngestResponse {
  inserted: number;
  event_ids: number[];
}

export interface SearchQuery {
  query: string;
  top_k?: number;        // Number of results (default: 8)
  filter_kind?: string;  // Filter by event kind
  since_ms?: number;     // Only results after this timestamp
}

export interface SearchResult {
  id: number;
  ts: number;
  kind: string;
  text: string;
  meta: Record<string, any>;
  distance: number;      // Lower = more similar
}

export interface DailySummaryResponse {
  day: string;
  tokens?: number;
  status: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Ingest items into the memory daemon for embedding and storage
 * This is IMMEDIATE and UNBUFFERED - use for critical data that must be saved right away.
 * For chat messages and high-frequency events, use memoryIngestBuffered instead.
 * 
 * @example
 * ```typescript
 * await memoryIngest([
 *   { kind: 'note', text: 'Important meeting notes', meta: { tags: ['work'] } },
 *   { kind: 'chat:user', text: 'What is the weather today?' }
 * ]);
 * ```
 */
export async function memoryIngest(items: IngestItem[]): Promise<IngestResponse> {
  return await invoke<IngestResponse>('mem_ingest', { items });
}

/**
 * Queue a single item for buffered ingestion
 * Items are batched (up to 64) and flushed automatically every 5 seconds.
 * RECOMMENDED for chat messages and frequent events - non-blocking and efficient.
 * 
 * @example
 * ```typescript
 * await memoryIngestBuffered({ kind: 'chat:user', text: 'Hello!' });
 * ```
 */
export async function memoryIngestBuffered(item: IngestItem): Promise<void> {
  return await invoke<void>('mem_ingest_buffered', { item });
}

/**
 * Queue multiple items for buffered ingestion
 * Items are batched (up to 64) and flushed automatically every 5 seconds.
 * 
 * @example
 * ```typescript
 * await memoryIngestBufferedBatch([
 *   { kind: 'chat:user', text: 'Hello!' },
 *   { kind: 'chat:ai', text: 'Hi there!' }
 * ]);
 * ```
 */
export async function memoryIngestBufferedBatch(items: IngestItem[]): Promise<void> {
  return await invoke<void>('mem_ingest_buffered_batch', { items });
}

/**
 * Search the memory using semantic similarity
 * 
 * @example
 * ```typescript
 * const results = await memorySearch({
 *   query: 'meeting notes about project deadlines',
 *   top_k: 5,
 *   filter_kind: 'note'
 * });
 * ```
 */
export async function memorySearch(query: SearchQuery): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('mem_search', { q: query });
}

/**
 * Request a daily summary from the memory daemon
 * 
 * @param day - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @example
 * ```typescript
 * const summary = await memorySummarizeDaily('2025-10-28');
 * ```
 */
export async function memorySummarizeDaily(day?: string): Promise<DailySummaryResponse> {
  return await invoke<DailySummaryResponse>('mem_summarize_daily', { day });
}

// ============================================================================
// Convenience Helpers
// ============================================================================

/**
 * Save a simple note to memory (unbuffered - immediate save)
 */
export async function saveNote(text: string, tags?: string[]): Promise<IngestResponse> {
  return memoryIngest([{
    kind: 'note',
    text,
    meta: tags ? { tags } : {},
    ts: Date.now()
  }]);
}

/**
 * Save a simple note to memory (buffered - queued for batch processing)
 * RECOMMENDED for frequent note-taking
 */
export async function saveNoteBuffered(text: string, tags?: string[]): Promise<void> {
  return memoryIngestBuffered({
    kind: 'note',
    text,
    meta: tags ? { tags } : {},
    ts: Date.now()
  });
}

/**
 * Save a chat message to memory (unbuffered - immediate save)
 */
export async function saveChatMessage(
  role: 'user' | 'assistant',
  content: string,
  metadata?: Record<string, any>
): Promise<IngestResponse> {
  return memoryIngest([{
    kind: `chat:${role === 'assistant' ? 'ai' : 'user'}`,
    text: content,
    meta: metadata || {},
    ts: Date.now()
  }]);
}

/**
 * Save a chat message to memory (buffered - queued for batch processing)
 * RECOMMENDED for chat applications - more efficient
 */
export async function saveChatMessageBuffered(
  role: 'user' | 'assistant',
  content: string,
  metadata?: Record<string, any>
): Promise<void> {
  return memoryIngestBuffered({
    kind: `chat:${role === 'assistant' ? 'ai' : 'user'}`,
    text: content,
    meta: metadata || {},
    ts: Date.now()
  });
}

/**
 * Quick search with sensible defaults
 */
export async function quickSearch(query: string, limit = 8): Promise<SearchResult[]> {
  return memorySearch({ query, top_k: limit });
}

/**
 * Search only recent items (last N days)
 */
export async function searchRecent(
  query: string,
  daysAgo = 7,
  limit = 8
): Promise<SearchResult[]> {
  const since_ms = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
  return memorySearch({ query, top_k: limit, since_ms });
}

/**
 * Search by specific kind (notes, chat messages, etc.)
 */
export async function searchByKind(
  query: string,
  kind: string,
  limit = 8
): Promise<SearchResult[]> {
  return memorySearch({ query, top_k: limit, filter_kind: kind });
}
