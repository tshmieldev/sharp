import { Schema } from 'effect';

const Row = Schema.Struct({
  id: Schema.Union(Schema.String, Schema.Number),
  hide: Schema.Union(Schema.Boolean, Schema.Literal('true', 'false')),
  reason: Schema.optional(Schema.String),
  unsure: Schema.optional(
    Schema.Union(Schema.Boolean, Schema.Number, Schema.Literal('true', 'false', 'yes', 'no')),
  ),
});
const decodeRow = Schema.decodeUnknownOption(Row);

/** Tolerate wrappers and fences, but never turn a malformed row into a cached "show". */
export function parseVerdicts(text: string) {
  const candidates = [
    text.trim(),
    text.slice(text.indexOf('['), text.lastIndexOf(']') + 1),
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ];
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const wrapper =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const rows: unknown = Array.isArray(parsed)
      ? parsed
      : (wrapper?.results ?? wrapper?.verdicts ?? (wrapper ? [wrapper] : []));
    if (!Array.isArray(rows)) continue;
    const result = rows.flatMap((row: unknown) => {
      const decoded = decodeRow(row);
      if (decoded._tag === 'None') return [];
      const value = decoded.value;
      return [
        {
          id: String(value.id),
          hide: value.hide === true || value.hide === 'true',
          reason: value.reason?.slice(0, 200) ?? '',
          unsure:
            value.unsure === true ||
            value.unsure === 1 ||
            value.unsure === 'true' ||
            value.unsure === 'yes',
        },
      ];
    });
    if (result.length) return result;
  }
  return [];
}
