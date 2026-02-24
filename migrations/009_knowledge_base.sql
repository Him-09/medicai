CREATE TABLE IF NOT EXISTS kb_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_collections_default ON kb_collections(is_default);

CREATE TABLE IF NOT EXISTS kb_articles (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES kb_collections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    author TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    source_url TEXT,
    symptoms_prompts JSONB DEFAULT '[]',
    red_flags JSONB DEFAULT '[]',
    assessment_template TEXT,
    plan_template JSONB,
    suggested_orders JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_collection ON kb_articles(collection_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_default ON kb_articles(is_default);
CREATE INDEX IF NOT EXISTS idx_kb_articles_title ON kb_articles(title);

CREATE OR REPLACE FUNCTION update_kb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kb_collections_updated_at ON kb_collections;
CREATE TRIGGER kb_collections_updated_at
    BEFORE UPDATE ON kb_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_kb_updated_at();

DROP TRIGGER IF EXISTS kb_articles_updated_at ON kb_articles;
CREATE TRIGGER kb_articles_updated_at
    BEFORE UPDATE ON kb_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_kb_updated_at();
