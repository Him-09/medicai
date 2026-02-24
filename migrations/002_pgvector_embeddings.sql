DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available. Skipping document_embeddings table creation.';
    RAISE NOTICE 'To install pgvector, see: https://github.com/pgvector/pgvector#installation';
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN

        CREATE TABLE IF NOT EXISTS document_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            document_type TEXT NOT NULL,
            date_of_service DATE NULL,
            chunk_index INT NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            embedding vector(1536),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT unique_doc_chunk UNIQUE (doc_id, chunk_index)
        );

        CREATE INDEX IF NOT EXISTS idx_embeddings_patient ON document_embeddings(patient_id);
        CREATE INDEX IF NOT EXISTS idx_embeddings_doc ON document_embeddings(doc_id);

        CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON document_embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);

        RAISE NOTICE 'document_embeddings table created successfully with pgvector support.';
    ELSE
        RAISE NOTICE 'pgvector extension not found. Skipping document_embeddings table.';
    END IF;
END $$;

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
