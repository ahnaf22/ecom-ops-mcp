const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|PRAGMA|ATTACH)\b|;/i;
const SQL_COMMENT = /--|\/\*|\*\//;
const TRAILING_LIMIT = /\bLIMIT\s+(\d+)(\s+OFFSET\s+\d+)?\s*$/i;
const TRAILING_COMMA_LIMIT = /\bLIMIT\s+(\d+)\s*,\s*(\d+)\s*$/i;

export const MAX_QUERY_ROWS = 50;

/** Validates a single read-only query and caps its outer result set at 50 rows. */
export function validateReadOnlySql(sql: string): string {
  const query = sql.trim();

  if (!/^SELECT\b/i.test(query)) {
    throw new Error("Only SELECT queries are allowed");
  }

  if (FORBIDDEN_SQL.test(query) || SQL_COMMENT.test(query)) {
    throw new Error("Query contains a forbidden SQL keyword, comment, or semicolon");
  }

  const commaLimit = query.match(TRAILING_COMMA_LIMIT);
  if (commaLimit) {
    const offset = Number(commaLimit[1]);
    const count = Math.min(Number(commaLimit[2]), MAX_QUERY_ROWS);
    return query.replace(TRAILING_COMMA_LIMIT, `LIMIT ${offset}, ${count}`);
  }

  const limit = query.match(TRAILING_LIMIT);
  if (limit) {
    const count = Math.min(Number(limit[1]), MAX_QUERY_ROWS);
    return query.replace(
      TRAILING_LIMIT,
      `LIMIT ${count}${limit[2] ?? ""}`,
    );
  }

  if (/\bLIMIT\b/i.test(query)) {
    throw new Error("LIMIT must use a numeric literal");
  }

  return `${query} LIMIT ${MAX_QUERY_ROWS}`;
}

export const guardReadOnlySql = validateReadOnlySql;
