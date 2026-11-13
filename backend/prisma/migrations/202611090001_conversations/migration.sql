CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  document_id TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE conversation_turns (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  status TEXT NOT NULL,
  citations JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, sequence)
);
