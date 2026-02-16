-- Migration 002: pgvector for embeddings (replacing FAISS)
-- This provides secure, auditable vector storage in Postgres
-- NOTE: Requires pgvector extension to be installed on PostgreSQL server
-- Install with: CREATE EXTENSION vector; (requires superuser or pg_extension role)

-- Enable pgvector extension (will fail if not installed - that's OK, skip this migration)
DO $$ 
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available. Skipping document_embeddings table creation.';
    RAISE NOTICE 'To install pgvector, see: https://github.com/pgvector/pgvector#installation';
END $$;

-- Only create the table if vector extension exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- DOCUMENT EMBEDDINGS table
        CREATE TABLE IF NOT EXISTS document_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            document_type TEXT NOT NULL,
            date_of_service DATE NULL,
            chunk_index INT NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            embedding vector(1536), -- OpenAI text-embedding-ada-002 dimension
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            
            CONSTRAINT unique_doc_chunk UNIQUE (doc_id, chunk_index)
        );

        -- Indexes for efficient similarity search
        CREATE INDEX IF NOT EXISTS idx_embeddings_patient ON document_embeddings(patient_id);
        CREATE INDEX IF NOT EXISTS idx_embeddings_doc ON document_embeddings(doc_id);

        -- HNSW index for fast approximate nearest neighbor search
        CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON document_embeddings 
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
            
        RAISE NOTICE 'document_embeddings table created successfully with pgvector support.';
    ELSE
        RAISE NOTICE 'pgvector extension not found. Skipping document_embeddings table.';
    END IF;
END $$;

-- Function to search similar documents for a patient (only if pgvector exists)
-- Usage: SELECT * FROM search_patient_documents('patient123', query_embedding, 5);
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE $func$
        CREATE OR REPLACE FUNCTION search_patient_documents(
            p_patient_id TEXT,
            query_embedding vector(1536),
            limit_count INT DEFAULT 5
        )
        RETURNS TABLE (
            doc_id TEXT,
            document_type TEXT,
            date_of_service DATE,
            content TEXT,
            metadata JSONB,
            similarity FLOAT
        ) AS $inner$
        BEGIN
            RETURN QUERY
            SELECT 
                de.doc_id,
                de.document_type,
                de.date_of_service,
                de.content,
                de.metadata,
                1 - (de.embedding <=> query_embedding) AS similarity
            FROM document_embeddings de
            WHERE de.patient_id = p_patient_id
            ORDER BY de.embedding <=> query_embedding
            LIMIT limit_count;
        END;
        $inner$ LANGUAGE plpgsql;
        $func$;
    END IF;
END $$;
