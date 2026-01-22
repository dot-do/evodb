[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / AggregationFunction

# Type Alias: AggregationFunction

> **AggregationFunction** = `"count"` \| `"sum"` \| `"avg"` \| `"min"` \| `"max"` \| `"countDistinct"` \| `"sumDistinct"` \| `"avgDistinct"` \| `"first"` \| `"last"` \| `"stddev"` \| `"variance"`

Defined in: [query/src/types.ts:396](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L396)

Supported aggregation functions.

Standard SQL aggregation functions for computing summary statistics
over groups of rows. All numeric functions handle NULL values according
to SQL semantics (NULLs are ignored).

| Function       | Description                                    | NULL Handling    |
|----------------|------------------------------------------------|------------------|
| count          | Count rows (or non-null values if column set)  | Counts non-nulls |
| sum            | Sum of values                                  | Ignores nulls    |
| avg            | Arithmetic mean                                | Ignores nulls    |
| min            | Minimum value                                  | Ignores nulls    |
| max            | Maximum value                                  | Ignores nulls    |
| countDistinct  | Count unique values                            | Ignores nulls    |
| sumDistinct    | Sum of unique values                           | Ignores nulls    |
| avgDistinct    | Average of unique values                       | Ignores nulls    |
| first          | First value in group (order-dependent)         | May return null  |
| last           | Last value in group (order-dependent)          | May return null  |
| stddev         | Sample standard deviation                      | Ignores nulls    |
| variance       | Sample variance                                | Ignores nulls    |
