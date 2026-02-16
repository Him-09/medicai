from __future__ import annotations

import os
import json
from functools import lru_cache
from typing import Any, Dict, List, Tuple, Callable, Iterator
from queue import Queue
from threading import Thread

from langgraph.checkpoint.postgres import PostgresSaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessageChunk
from langchain_core.callbacks import BaseCallbackHandler
from medicai.storage.consultation_summary_store import upsert_summary
from medicai.agent.core_agent import create_medical_agent
from app.utils.ai_toggle import ensure_ai_enabled


class StreamingCallbackHandler(BaseCallbackHandler):
    """Callback handler to capture streaming tokens."""
    
    def __init__(self, queue: Queue):
        self.queue = queue
    
    def on_llm_new_token(self, token: str, **kwargs) -> None:
        """Called when a new token is generated."""
        self.queue.put(token)


def _db_uri() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/medicai",
    )


class AgentService:
    """
    Owns the LangGraph agent + PostgresSaver checkpointer.

    - run_chat(): invoke agent with persistent memory keyed by consultation_id
    - get_messages(): replay stored messages from the thread state
    - reset_thread(): delete stored checkpoints for a thread
    """

    def __init__(self, *, db_uri: str):
        self.db_uri = db_uri

        # Create checkpointer connection (kept alive for the service lifetime)
        # Don't use context manager since we need persistent connection
        import psycopg
        conn = psycopg.connect(db_uri, autocommit=True)
        self.checkpointer = PostgresSaver(conn)
        self.checkpointer.setup()

        # Create agent graph + run helper, passing our checkpointer
        self.graph, self._run = create_medical_agent(
            db_uri=db_uri,
            checkpointer=self.checkpointer
        )

    def run_chat(self, *, patient_id: str, consultation_id: str, text: str) -> str:
        ensure_ai_enabled()  # Check if AI is enabled before processing
        
        patient_id = patient_id.strip()
        consultation_id = consultation_id.strip()
        text = text.strip()

        if not patient_id:
            raise ValueError("patient_id is required")
        if not consultation_id:
            raise ValueError("consultation_id is required")
        if not text:
            raise ValueError("text is required")

        # Your core_agent.run() already sets thread_id = consultation_id
        return self._run(query=text, patient_id=patient_id, consultation_id=consultation_id)

    def stream_chat(self, *, patient_id: str, consultation_id: str, text: str) -> Iterator[str]:
        """
        Stream chat responses incrementally for word-by-word typing animation.
        
        Yields text chunks as they arrive from the LLM.
        """
        ensure_ai_enabled()  # Check if AI is enabled before processing
        
        patient_id = patient_id.strip()
        consultation_id = consultation_id.strip()
        text = text.strip()

        if not patient_id:
            raise ValueError("patient_id is required")
        if not consultation_id:
            raise ValueError("consultation_id is required")
        if not text:
            raise ValueError("text is required")

        # Must match core_agent.run() prompt format for safety + tool correctness
        from medicai.agent.core_agent import SYSTEM_PROMPT, USER_PROMPT_SUFFIX
        user_content = (
            f"Current patient_id: {patient_id}\n\n"
            f"Question: {text}\n\n"
            f"{USER_PROMPT_SUFFIX}"
        )

        config = {"configurable": {"thread_id": consultation_id}}
        
        # Create a queue to collect tokens from streaming callback
        token_queue: Queue = Queue()
        callback_handler = StreamingCallbackHandler(token_queue)
        
        # Add callback to config
        config["callbacks"] = [callback_handler]
        
        # Run the agent in a background thread with proper system message
        def run_agent():
            try:
                self.graph.invoke(
                    {"messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_content}
                    ]},
                    config=config,
                )
            finally:
                # Signal completion
                token_queue.put(None)
        
        thread = Thread(target=run_agent, daemon=True)
        thread.start()
        
        # Yield tokens as they arrive
        while True:
            token = token_queue.get()
            if token is None:
                break
            yield token

    def get_messages(self, *, consultation_id: str) -> List[Dict[str, str]]:
        consultation_id = consultation_id.strip()
        if not consultation_id:
            raise ValueError("consultation_id is required")

        config = {"configurable": {"thread_id": consultation_id}}
        state = self.graph.get_state(config)

        if not state or not getattr(state, "values", None) or "messages" not in state.values:
            return []

        out: List[Dict[str, str]] = []
        # Collect doc_ids from tool messages to attach to the next assistant message
        pending_doc_ids: List[str] = []
        for m in state.values["messages"]:
            # Messages are LangChain message objects (HumanMessage, AIMessage, etc.)
            msg_type = type(m).__name__
            content = str(m.content)
            
            # Skip system messages entirely - these are internal
            if msg_type == "SystemMessage":
                continue
            
            # Collect doc_ids from tool messages for traceability
            if msg_type == "ToolMessage":
                import re
                found = re.findall(r'["\']doc_id["\']:\s*["\']([a-f0-9]{8,})["\']', content)
                pending_doc_ids.extend(found)
                # Also match doc_id patterns like "first_doc_id", "last_doc_id", "latest_doc_id"
                found2 = re.findall(r'["\'](?:first_|last_|latest_)?doc_id["\']:\s*["\']([a-f0-9]{8,})["\']', content)
                pending_doc_ids.extend(found2)
                continue
            
            if msg_type == "HumanMessage":
                # Extract only the actual user question from the formatted prompt
                # The prompt format is: "Current patient_id: xxx\n\nQuestion: {actual_question}\n\n{suffix}"
                if "Question:" in content:
                    # Extract just the question part
                    parts = content.split("Question:")
                    if len(parts) > 1:
                        question_part = parts[1]
                        # Remove the suffix that comes after the question (USER_PROMPT_SUFFIX)
                        # Handle both English (legacy) and French (current) suffixes
                        for marker in [
                            "Use patient_id",
                            "When you call tools",
                            "Be brief",
                            "Utilise le patient_id",
                            "Sois bref",
                        ]:
                            if marker in question_part:
                                question_part = question_part.split(marker)[0]
                        content = question_part.strip()
                
                # Skip if this looks like a system/context message (contains patient_id context only)
                if content.startswith("Current patient_id:") and "Question:" not in content:
                    continue
                
                # Skip empty messages after extraction
                if not content:
                    continue
                    
                out.append({"role": "user", "content": content})
                
            elif msg_type == "AIMessage":
                # Skip AI messages that are just tool calls (no text content)
                if not content or content == "":
                    continue
                # Skip messages that look like tool call JSON
                if content.startswith("[{") or content.startswith('{"'):
                    continue
                # Deduplicate collected doc_ids and attach as sources
                unique_doc_ids = list(dict.fromkeys(pending_doc_ids))  # preserve order, deduplicate
                msg_dict: Dict[str, str] = {"role": "assistant", "content": content}
                if unique_doc_ids:
                    msg_dict["sources"] = ",".join(unique_doc_ids)
                out.append(msg_dict)
                pending_doc_ids = []  # reset for next turn
        
        return out

    def reset_thread(self, *, consultation_id: str) -> None:
        consultation_id = consultation_id.strip()
        if not consultation_id:
            raise ValueError("consultation_id is required")

        # Official checkpointer API deletes all checkpoints for a thread.
        # This is preferable to hacking DB tables directly.
        self.checkpointer.delete_thread(consultation_id)

    def generate_and_save_summary(
        self,
        *,
        consultation_id: str,
        patient_id: str,
    ) -> str:
        config = {"configurable": {"thread_id": consultation_id}}
        state = self.graph.get_state(config)

        if not state or "messages" not in state.values:
            raise ValueError("No conversation found for this consultation")

        convo = []
        for m in state.values["messages"]:
            msg_type = type(m).__name__
            if msg_type == "HumanMessage":
                role = "user"
            elif msg_type == "AIMessage":
                role = "assistant"
            else:
                continue
            convo.append(f"{role.upper()}: {str(m.content)}")

        prompt = (
            "You are generating a clinical consultation summary.\n\n"
            "Rules:\n"
            "- ONLY summarize what was discussed\n"
            "- NO diagnosis, NO treatment recommendations\n"
            "- Mention dates when relevant\n"
            "- Be factual and concise\n\n"
            "Conversation:\n\n"
            + "\n\n".join(convo)
        )

        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.0)
        summary = llm.invoke(prompt).content

        upsert_summary(
            consultation_id=consultation_id,
            patient_id=patient_id,
            summary=summary,
            source="ai",
            version=1,
        )

        return summary


@lru_cache
def get_agent_service() -> AgentService:
    """
    FastAPI-friendly singleton factory.
    Ensures a single agent+checkpointer per Uvicorn worker process.
    """
    return AgentService(db_uri=_db_uri())
