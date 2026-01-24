/**
 * EvoDB MCP Tools Module
 *
 * Exports the three MCP tool primitives: search, fetch, and do.
 */

export { searchTool, createSearchHandler } from './search.js'
export { fetchTool, createFetchHandler } from './fetch.js'
export { doTool, createDoHandler, evodbTypeDefinitions } from './do.js'
export type { DoHandlerOptions } from './do.js'
