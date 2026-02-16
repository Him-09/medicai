"""
Core Medical AI Agent using LangGraph with PostgreSQL memory.

This module provides a ReAct-style agent with persistent conversation memory
using PostgreSQL checkpointing. The agent has access to patient data tools
and maintains conversation history per consultation session.
"""

from __future__ import annotations

from typing import Tuple, Callable, Any, Optional, Iterator

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

# Import the pre-defined tools from langchain_tools module
from medicai.agent.langchain_tools import tools


# ---------------------------------------------------------------------------
# System prompt / safety instructions
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Tu es un assistant clinique pour les médecins. Sois DIRECT et CONCIS. Réponds TOUJOURS en français.

ACCÈS: Analyses de laboratoire, imagerie, prescriptions, documents du patient via les outils.

STYLE DE RÉPONSE:
- Réponds DIRECTEMENT à la question du médecin en 1-3 phrases quand c'est possible
- Utilise des puces uniquement pour lister plusieurs éléments
- N'inclus PAS de doc_id dans ta réponse — le système gère la traçabilité automatiquement
- Cite la date quand pertinent (ex: "NFS du 10-10-2025")
- Évite les préambules, résumés, avertissements et sections "à considérer"
- Si le médecin pose une question oui/non, commence par oui/non puis explique brièvement

CE QU'IL FAUT FAIRE:
- Énoncer les résultats des dossiers avec les dates
- Noter les tendances (amélioration/dégradation/stable)
- Signaler les anomalies avec les valeurs

CE QU'IL NE FAUT PAS FAIRE:
- Ne pas inclure doc_id, source_id ou identifiants techniques dans la réponse
- Ne pas diagnostiquer ni recommander de traitements spécifiques
- Ne pas ajouter de "questions à considérer" ou "prochaines étapes" non sollicitées
- Ne pas répéter la question
- Ne pas ajouter d'avertissements sur la consultation de cliniciens
- Ne pas inventer de données absentes des dossiers

EXEMPLE DE BONNE RÉPONSE:
Q: "Est-ce que je dois vérifier la NFS ?"
A: "La dernière NFS du 10-10-2025 montre une Hb à 6.9 g/dL (basse), Ht 19.6%, GR 2.46. Pas de réticulocytes, bilan martial, B12 ou folates au dossier."

EXEMPLE DE MAUVAISE RÉPONSE:
❌ "Hb à 6.9 (doc_id: 675f9da442a014b2)..."
❌ "Résumé des constats biologiques actuels..."
❌ "Questions à envisager avec le patient..."
"""

# User-facing prompt additions (not system-level)
USER_PROMPT_SUFFIX = """Utilise le patient_id ci-dessus pour tous les appels d'outils. Sois bref - réponds en 1-3 phrases. Ne mets PAS de doc_id dans ta réponse. Réponds en français."""


def create_medical_agent(
    *,
    db_uri: str,
    model_name: str = "gpt-4o-mini",
    temperature: float = 0.0,
    checkpointer: Optional[PostgresSaver] = None,
) -> Tuple[Any, Callable]:
    """
    Create a LangGraph ReAct agent with PostgreSQL-backed conversation memory.
    
    Args:
        db_uri: PostgreSQL connection string (e.g., "postgresql://user:pass@localhost:5432/medicai")
        model_name: OpenAI model name (default: "gpt-4o-mini")
        temperature: LLM temperature (default: 0.0 for deterministic outputs)
        checkpointer: Optional pre-configured PostgresSaver instance. If None, creates a new one.
    
    Returns:
        Tuple of (graph, run_function):
        - graph: Compiled LangGraph agent with checkpointing
        - run: Helper function to invoke the agent with memory
    
    Example:
        >>> graph, run = create_medical_agent(db_uri="postgresql://...")
        >>> response = run(
        ...     query="What are the latest abnormal labs?",
        ...     patient_id="patient1",
        ...     consultation_id="consult_123"
        ... )
    """

    llm = ChatOpenAI(model=model_name, temperature=temperature, streaming=True)

    # Setup persistent chat memory with PostgreSQL
    if checkpointer is None:
        # Create a synchronous connection for setup
        conn = psycopg.connect(db_uri, autocommit=True)
        
        # Initialize the checkpointer with the connection
        checkpointer = PostgresSaver(conn)
        
        # Setup tables (safe to call repeatedly)
        checkpointer.setup()
    
    # Build a LangGraph ReAct agent with checkpointing support
    graph = create_react_agent(
        model=llm,
        tools=tools,
        checkpointer=checkpointer,
    )

    def run(*, query: str, patient_id: str, consultation_id: str) -> str:
        """
        Run the agent with a query for a specific patient and consultation.
        
        Args:
            query: The question or request from the user
            patient_id: Patient identifier (enforced in prompt for safety)
            consultation_id: Unique consultation/session ID for memory persistence
        
        Returns:
            Agent's response as a string
        """
        # Build user message with patient context (system prompt is passed separately)
        user_content = (
            f"Current patient_id: {patient_id}\n\n"
            f"Question: {query}\n\n"
            f"{USER_PROMPT_SUFFIX}"
        )

        # Configuration for memory persistence
        config = {
            "configurable": {
                "thread_id": consultation_id,  # Memory key per consultation
            }
        }

        # Invoke the agent with proper system message separation
        result = graph.invoke(
            {"messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ]},
            config=config,
        )

        # Extract the last message (agent's response)
        msgs = result.get("messages", [])
        if not msgs:
            return ""
        last = msgs[-1]
        return getattr(last, "content", str(last))

    return graph, run
