export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Metadata = { [key: string]: JsonValue };
export interface ExtractedPage {
  text: string;
  pageNumber: number;
  metadata?: Metadata;
}
export type ExtractedDocument = { documentId: string; metadata?: Metadata } & (
  { text: string; pages?: never } | { pages: ExtractedPage[]; text?: never }
);
export interface TextChunk {
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  metadata: Metadata;
  /** Unicode code-point offsets in the normalized page/text, end exclusive. */
  startOffset: number;
  endOffset: number;
}
export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}
