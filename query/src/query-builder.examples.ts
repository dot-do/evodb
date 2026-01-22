/**
 * @evodb/query - Query Builder IntelliSense Examples
 *
 * This file demonstrates the improved TypeScript IntelliSense capabilities
 * of the EvoDB query builder. These examples show how the type system
 * provides autocompletion and type checking for:
 *
 * 1. Column names in projections, filters, and sorting
 * 2. Type-appropriate operators based on column type
 * 3. Value types matching column types
 * 4. Aggregation functions with proper column constraints
 *
 * To see IntelliSense in action, open this file in VS Code or another
 * TypeScript-aware editor and hover over the methods or trigger autocomplete.
 *
 * @packageDocumentation
 * @module @evodb/query/examples
 */

import {
  QueryBuilder,
  createQueryBuilder,
  defineSchema,
  mergeSchemas,
  type ColumnsOfType,
  type InferRowType,
} from './query-builder.js';

// =============================================================================
// Example 1: Defining a Schema for IntelliSense
// =============================================================================

/**
 * Define a schema using the defineSchema helper.
 * This enables full TypeScript IntelliSense for column names.
 *
 * IntelliSense features:
 * - Hover over properties to see the column type
 * - Schema satisfies SchemaDefinition constraint
 */
const usersSchema = defineSchema({
  id: 'string',
  name: 'string',
  email: 'string',
  age: 'number',
  balance: 'number',
  active: 'boolean',
  verified: 'boolean',
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
  metadata: 'json',
});

// Type alias for the schema (useful for reuse)
type UsersSchema = typeof usersSchema;

// Infer the row type from the schema
type UserRow = InferRowType<UsersSchema>;
// Result: {
//   id: string;
//   name: string;
//   email: string;
//   age: number;
//   balance: number;
//   active: boolean;
//   verified: boolean;
//   createdAt: number;  // timestamp is number
//   updatedAt: number;
//   metadata: unknown;  // json is unknown
// }

// =============================================================================
// Example 2: Basic Query with Column Autocompletion
// =============================================================================

/**
 * Demonstrates column name autocompletion in select() and where().
 *
 * IntelliSense features:
 * - Typing .select([ triggers column name suggestions
 * - Typing .where(' triggers column name suggestions
 * - Invalid column names cause TypeScript errors
 */
function basicQueryExample() {
  // Create a query builder with schema type
  const query = createQueryBuilder<UsersSchema>('users')
    // IntelliSense: suggests id, name, email, age, balance, active, verified, createdAt, updatedAt, metadata
    .select(['id', 'name', 'email'])
    // IntelliSense: column suggestions + type-appropriate operators
    .where('active', 'eq', true)
    // IntelliSense: numeric operators for 'age' column
    .where('age', 'gte', 18)
    .build();

  return query;
}

// =============================================================================
// Example 3: Type-Safe Operators Based on Column Type
// =============================================================================

/**
 * Demonstrates how operators are constrained based on column type.
 *
 * IntelliSense features:
 * - String columns: eq, ne, in, notIn, like, isNull, isNotNull
 * - Number columns: eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull
 * - Boolean columns: eq, ne, isNull, isNotNull
 * - Timestamp columns: Same as number
 */
function typeSafeOperatorsExample() {
  return createQueryBuilder<UsersSchema>('users')
    // String column operators
    // IntelliSense for 'name': eq, ne, in, notIn, like, isNull, isNotNull
    .where('name', 'like', '%Smith%')
    .where('email', 'in', ['alice@example.com', 'bob@example.com'])

    // Numeric column operators
    // IntelliSense for 'age': eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull
    .where('age', 'between', [18, 65])
    .where('balance', 'gte', 1000)

    // Boolean column operators
    // IntelliSense for 'active': eq, ne, isNull, isNotNull
    .where('active', 'eq', true)
    .where('verified', 'ne', false)

    // Timestamp column operators (same as numeric)
    // IntelliSense for 'createdAt': eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull
    .where('createdAt', 'gte', Date.now() - 86400000) // Last 24 hours
    .build();
}

// =============================================================================
// Example 4: Convenience Methods with Type Safety
// =============================================================================

/**
 * Demonstrates the convenience methods that provide simpler syntax
 * while maintaining full type safety.
 *
 * IntelliSense features:
 * - whereEquals: Column name suggestions
 * - whereIn: Column name suggestions
 * - whereBetween: Only numeric/timestamp columns
 * - whereLike: Only string columns
 * - whereNull/whereNotNull: All columns
 */
function convenienceMethodsExample() {
  return createQueryBuilder<UsersSchema>('users')
    // whereEquals - shorthand for where(col, 'eq', val)
    .whereEquals('active', true)

    // whereIn - shorthand for where(col, 'in', vals)
    .whereIn('email', ['admin@example.com', 'support@example.com'])

    // whereBetween - only available for numeric/timestamp columns
    // IntelliSense: suggests age, balance, createdAt, updatedAt (numeric types)
    .whereBetween('age', 21, 35)
    .whereBetween('createdAt', Date.now() - 604800000, Date.now()) // Last week

    // whereLike - only available for string columns
    // IntelliSense: suggests id, name, email (string types)
    .whereLike('name', 'John%')

    // whereNull/whereNotNull - available for all columns
    .whereNotNull('email')
    .build();
}

// =============================================================================
// Example 5: Aggregations with Column Type Constraints
// =============================================================================

/**
 * Demonstrates aggregation methods with appropriate column constraints.
 *
 * IntelliSense features:
 * - sum/avg: Only numeric columns suggested
 * - min/max: All columns (works with any comparable type)
 * - count: All columns or null for COUNT(*)
 * - countDistinct: All columns
 */
function aggregationExample() {
  return createQueryBuilder<UsersSchema>('users')
    // COUNT(*) - no column needed
    .count('total_users')

    // COUNT(column) - any column
    .countColumn('email', 'users_with_email')

    // COUNT DISTINCT - any column
    .countDistinct('name', 'unique_names')

    // SUM - only numeric columns
    // IntelliSense: suggests age, balance (number type)
    .sum('balance', 'total_balance')

    // AVG - only numeric columns
    // IntelliSense: suggests age, balance (number type)
    .avg('age', 'average_age')

    // MIN/MAX - any column
    .min('createdAt', 'first_signup')
    .max('createdAt', 'latest_signup')
    .min('age', 'youngest_age')
    .max('balance', 'highest_balance')

    // Group by for meaningful aggregations
    .groupBy(['active'])
    .build();
}

// =============================================================================
// Example 6: Complex Query with All Features
// =============================================================================

/**
 * Demonstrates a complex query using multiple features together.
 *
 * This shows the full power of the type-safe query builder.
 */
function complexQueryExample() {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return createQueryBuilder<UsersSchema>('users')
    // Select specific columns
    .select(['id', 'name', 'email', 'age', 'balance', 'createdAt'])

    // Multiple filters (AND semantics)
    .where('active', 'eq', true)
    .where('verified', 'eq', true)
    .whereBetween('age', 25, 45)
    .where('balance', 'gte', 500)
    .whereBetween('createdAt', thirtyDaysAgo, oneWeekAgo)
    .whereNotNull('email')
    .whereLike('name', '%son')

    // Sorting
    .orderBy('balance', 'desc')
    .orderBy('createdAt', 'asc')

    // Pagination
    .page(1, 50) // First page, 50 items

    // Performance hints
    .withHints({
      preferCache: true,
      maxParallelism: 4,
    })
    .timeout(10000) // 10 second timeout
    .build();
}

// =============================================================================
// Example 7: Aggregation Query with Grouping
// =============================================================================

/**
 * Demonstrates a grouped aggregation query (like SQL GROUP BY).
 */
function groupedAggregationExample() {
  return createQueryBuilder<UsersSchema>('users')
    // Aggregations
    .count('user_count')
    .sum('balance', 'total_balance')
    .avg('age', 'average_age')
    .min('createdAt', 'first_signup')
    .max('createdAt', 'latest_signup')

    // Group by active status and verified status
    .groupBy(['active', 'verified'])

    // Filter groups (like HAVING in SQL)
    // Note: The filter is applied to source rows, not aggregated values
    .where('createdAt', 'gte', Date.now() - 365 * 24 * 60 * 60 * 1000) // Last year

    .build();
}

// =============================================================================
// Example 8: Schema Merging for Complex Types
// =============================================================================

/**
 * Demonstrates merging schemas for tables with common fields.
 */
function schemaMergingExample() {
  // Base schema with common audit fields
  const auditSchema = defineSchema({
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
    createdBy: 'string',
    updatedBy: 'string',
  });

  // Entity-specific schema
  const orderSchema = defineSchema({
    orderId: 'string',
    customerId: 'string',
    total: 'number',
    status: 'string',
    itemCount: 'number',
  });

  // Merge schemas
  const fullOrderSchema = mergeSchemas(auditSchema, orderSchema);

  // Now we have IntelliSense for all columns
  return createQueryBuilder<typeof fullOrderSchema>('orders')
    .select(['orderId', 'customerId', 'total', 'status', 'createdAt'])
    .where('status', 'in', ['pending', 'processing'])
    .where('total', 'gte', 100)
    .whereBetween('createdAt', Date.now() - 86400000, Date.now())
    .orderByDesc('createdAt')
    .limit(100)
    .build();
}

// =============================================================================
// Example 9: Time Travel Queries
// =============================================================================

/**
 * Demonstrates time travel query capabilities.
 */
function timeTravelExample() {
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;

  // Query data as it was yesterday
  const historicalQuery = createQueryBuilder<UsersSchema>('users')
    .select(['id', 'name', 'balance'])
    .asOfTimestamp(yesterday)
    .where('active', 'eq', true)
    .build();

  // Query data at a specific snapshot
  const snapshotQuery = createQueryBuilder<UsersSchema>('users')
    .select(['id', 'name', 'balance'])
    .asOfSnapshot('snap-20240115-001')
    .where('active', 'eq', true)
    .build();

  return { historicalQuery, snapshotQuery };
}

// =============================================================================
// Example 10: Working with Query Inspection
// =============================================================================

/**
 * Demonstrates the inspect() method for debugging queries.
 */
function inspectionExample() {
  const builder = createQueryBuilder<UsersSchema>('users')
    .select(['id', 'name'])
    .where('active', 'eq', true)
    .where('age', 'gte', 18)
    .orderByDesc('createdAt')
    .limit(100);

  // Inspect the query configuration before building
  const inspection = builder.inspect();
  console.log('Query inspection:', JSON.stringify(inspection, null, 2));
  // Output:
  // {
  //   "table": "users",
  //   "projection": ["id", "name"],
  //   "predicates": [
  //     { "column": "active", "operator": "eq", "value": true },
  //     { "column": "age", "operator": "gte", "value": 18 }
  //   ],
  //   "aggregations": [],
  //   "orderBy": [{ "column": "createdAt", "direction": "desc" }],
  //   "limit": 100
  // }

  // Build the final query
  return builder.build();
}

// =============================================================================
// Example 11: Type Extraction Utilities
// =============================================================================

/**
 * Demonstrates utility types for working with schemas.
 */
function typeUtilitiesExample() {
  // Get all column names as a union type
  // type AllColumns = ColumnNames<UsersSchema>;
  // Result: 'id' | 'name' | 'email' | 'age' | 'balance' | 'active' | 'verified' | 'createdAt' | 'updatedAt' | 'metadata'

  // Get only numeric columns
  type NumericColumns = ColumnsOfType<UsersSchema, 'number'>;
  // Result: 'age' | 'balance'

  // Get only string columns
  // type StringColumns = ColumnsOfType<UsersSchema, 'string'>;
  // Result: 'id' | 'name' | 'email'

  // Get only boolean columns
  // type BooleanColumns = ColumnsOfType<UsersSchema, 'boolean'>;
  // Result: 'active' | 'verified'

  // Get only timestamp columns
  // type TimestampColumns = ColumnsOfType<UsersSchema, 'timestamp'>;
  // Result: 'createdAt' | 'updatedAt'

  // These types can be used for type-safe function parameters
  function filterByNumericColumn(
    builder: QueryBuilder<UsersSchema>,
    column: NumericColumns,
    minValue: number
  ) {
    return builder.where(column, 'gte', minValue);
  }

  // Usage
  const builder = createQueryBuilder<UsersSchema>('users');
  filterByNumericColumn(builder, 'age', 21); // OK
  filterByNumericColumn(builder, 'balance', 1000); // OK
  // filterByNumericColumn(builder, 'name', 100); // Error: 'name' is not a numeric column

  return builder.build();
}

// =============================================================================
// Example 12: Real-World E-Commerce Query
// =============================================================================

/**
 * A realistic e-commerce query demonstrating practical usage.
 */
function ecommerceExample() {
  // Define the orders schema
  const ordersSchema = defineSchema({
    orderId: 'string',
    customerId: 'string',
    customerEmail: 'string',
    orderDate: 'timestamp',
    shippedDate: 'timestamp',
    total: 'number',
    itemCount: 'number',
    status: 'string',
    region: 'string',
    isPriority: 'boolean',
    notes: 'string',
  });

  type OrdersSchema = typeof ordersSchema;

  // Find high-value orders from the last 30 days that need attention
  const urgentOrders = createQueryBuilder<OrdersSchema>('orders')
    .select([
      'orderId',
      'customerId',
      'customerEmail',
      'orderDate',
      'total',
      'status',
    ])
    .where('status', 'in', ['pending', 'processing', 'on_hold'])
    .where('total', 'gte', 500)
    .whereBetween('orderDate', Date.now() - 30 * 86400000, Date.now())
    .where('isPriority', 'eq', true)
    .orderByDesc('total')
    .orderByAsc('orderDate')
    .limit(100)
    .build();

  // Get sales summary by region
  const regionalSummary = createQueryBuilder<OrdersSchema>('orders')
    .count('order_count')
    .sum('total', 'total_revenue')
    .avg('total', 'average_order_value')
    .countDistinct('customerId', 'unique_customers')
    .groupBy(['region', 'status'])
    .where('status', 'ne', 'cancelled')
    .whereBetween('orderDate', Date.now() - 90 * 86400000, Date.now())
    .build();

  return { urgentOrders, regionalSummary };
}

// =============================================================================
// Export examples for testing
// =============================================================================

export const examples = {
  basicQueryExample,
  typeSafeOperatorsExample,
  convenienceMethodsExample,
  aggregationExample,
  complexQueryExample,
  groupedAggregationExample,
  schemaMergingExample,
  timeTravelExample,
  inspectionExample,
  typeUtilitiesExample,
  ecommerceExample,
};

// Export the users schema for use in tests
export { usersSchema, type UsersSchema, type UserRow };
