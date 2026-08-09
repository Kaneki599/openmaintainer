import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Node,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import type { SourceLocation } from "./types.js";

export interface IndexedYamlNode {
  pointer: string;
  key?: string;
  value: unknown;
  location: SourceLocation;
}

export interface WorkflowDocument {
  path: string;
  source: string;
  data: Record<string, unknown> | null;
  errors: Array<{ message: string; location: SourceLocation }>;
  entries: IndexedYamlNode[];
  findByKey(key: string): IndexedYamlNode[];
  findByPointer(pointer: string): IndexedYamlNode | undefined;
}

export function parseWorkflow(path: string, source: string): WorkflowDocument {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter, keepSourceTokens: true, prettyErrors: false });
  const entries: IndexedYamlNode[] = [];

  if (document.contents) indexNode(document.contents, [], path, document, lineCounter, entries);

  const errors = document.errors.map((error) => {
    const offset = error.pos?.[0] ?? 0;
    const position = lineCounter.linePos(offset);
    return {
      message: error.message,
      location: { path, startLine: position.line, startColumn: position.col },
    };
  });

  const raw = errors.length === 0 ? document.toJS({ maxAliasCount: 100 }) : null;
  const data = isRecord(raw) ? raw : null;
  return {
    path,
    source,
    data,
    errors,
    entries,
    findByKey: (key) => entries.filter((entry) => entry.key === key),
    findByPointer: (pointer) => entries.find((entry) => entry.pointer === pointer),
  };
}

function indexNode(
  node: Node,
  segments: Array<string | number>,
  path: string,
  document: ReturnType<typeof parseDocument>,
  lineCounter: LineCounter,
  entries: IndexedYamlNode[],
): void {
  if (isMap(node)) {
    for (const pair of node.items) indexPair(pair as Pair<Node, Node>, segments, path, document, lineCounter, entries);
    return;
  }
  if (isSeq(node)) {
    (node as YAMLSeq<Node>).items.forEach((item, index) => {
      if (item) indexValue(item, [...segments, index], undefined, path, document, lineCounter, entries);
    });
  }
}

function indexPair(
  pair: Pair<Node, Node>,
  segments: Array<string | number>,
  path: string,
  document: ReturnType<typeof parseDocument>,
  lineCounter: LineCounter,
  entries: IndexedYamlNode[],
): void {
  const key = scalarString(pair.key);
  if (key === undefined || !pair.value) return;
  indexValue(pair.value, [...segments, key], key, path, document, lineCounter, entries);
}

function indexValue(
  node: Node,
  segments: Array<string | number>,
  key: string | undefined,
  path: string,
  document: ReturnType<typeof parseDocument>,
  lineCounter: LineCounter,
  entries: IndexedYamlNode[],
): void {
  const pointer = `/${segments.map(escapePointer).join("/")}`;
  entries.push({ pointer, key, value: node.toJS(document), location: locationFor(path, node, lineCounter) });
  indexNode(node, segments, path, document, lineCounter, entries);
}

function locationFor(path: string, node: Node, lineCounter: LineCounter): SourceLocation {
  const start = lineCounter.linePos(node.range?.[0] ?? 0);
  const end = lineCounter.linePos(node.range?.[1] ?? node.range?.[0] ?? 0);
  return { path, startLine: start.line, startColumn: start.col, endLine: end.line, endColumn: end.col };
}

function scalarString(node: Node): string | undefined {
  return isScalar(node) ? String((node as Scalar).value) : undefined;
}

function escapePointer(segment: string | number): string {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
