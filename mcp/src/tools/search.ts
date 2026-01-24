/**
 * Search Tool for EvoDB MCP Server
 *
 * MCP tool for full-text and semantic search over EvoDB data.
 */

import type { EvoDBBinding, SearchInput, ToolResponse, EvoDBSearchResult } from '../types.js'

/**
 * Tool definition for the search tool
 */
export const searchTool = {
  name: 'search',
  description:
    'Search EvoDB using full-text or semantic search. Returns relevant documents matching the query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
      },
      table: {
        type: 'string',
        description: 'Specific table to search in (optional, searches all tables by default)',
      },
      type: {
        type: 'string',
        enum: ['fulltext', 'semantic'],
        description: 'Search type: fulltext for keyword matching, semantic for vector similarity',
      },
    },
    required: ['query'],
  },
} as const

/**
 * Creates a search handler function that uses the EvoDB binding
 *
 * @param evodb - The EvoDB binding instance
 * @returns Handler function for the search tool
 */
export function createSearchHandler(
  evodb: EvoDBBinding
): (input: SearchInput) => Promise<ToolResponse> {
  return async (input: SearchInput): Promise<ToolResponse> => {
    try {
      const results = await evodb.search(input.query, {
        limit: input.limit,
        table: input.table,
        type: input.type,
      })

      // Format results for MCP response
      const formattedResults: EvoDBSearchResult[] = results.map((r) => ({
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        score: r.score,
        metadata: r.metadata,
      }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedResults, null, 2),
          },
        ],
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred during search'

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
        isError: true,
      }
    }
  }
}
