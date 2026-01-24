/**
 * Fetch Tool for EvoDB MCP Server
 *
 * MCP tool for retrieving documents by ID from EvoDB.
 */

import type { EvoDBBinding, FetchInput, ToolResponse } from '../types.js'

/**
 * Tool definition for the fetch tool
 */
export const fetchTool = {
  name: 'fetch',
  description:
    'Retrieve a document from EvoDB by its identifier. Returns the full document content.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description:
          'Resource identifier (format: table/id or just id). Examples: "users/user-123", "doc-abc"',
      },
    },
    required: ['resource'],
  },
} as const

/**
 * Parse resource identifier
 *
 * Handles formats like:
 * - "users/user-123" -> { table: "users", id: "user-123" }
 * - "user-123" -> { table: null, id: "user-123" }
 */
function parseResource(resource: string): { table: string | null; id: string } {
  const slashIndex = resource.indexOf('/')
  if (slashIndex === -1) {
    return { table: null, id: resource }
  }
  return {
    table: resource.slice(0, slashIndex),
    id: resource.slice(slashIndex + 1),
  }
}

/**
 * Creates a fetch handler function that uses the EvoDB binding
 *
 * @param evodb - The EvoDB binding instance
 * @returns Handler function for the fetch tool
 */
export function createFetchHandler(
  evodb: EvoDBBinding
): (input: FetchInput) => Promise<ToolResponse> {
  return async (input: FetchInput): Promise<ToolResponse> => {
    try {
      const { table, id } = parseResource(input.resource)
      const fullId = table ? `${table}/${id}` : id

      const document = await evodb.get(fullId)

      if (document === null) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'NOT_FOUND',
                message: `Document not found: ${input.resource}`,
              }),
            },
          ],
          isError: true,
        }
      }

      // Return the document as formatted JSON
      const content: Array<{ type: string; text: string }> = [
        {
          type: 'text',
          text: JSON.stringify(document, null, 2),
        },
      ]

      // Add metadata about the resource
      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            metadata: {
              resource: input.resource,
              ...(table && { table }),
              id,
            },
          },
          null,
          2
        ),
      })

      return { content }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred during fetch'

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
