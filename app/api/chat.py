import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatIn, ChatOut, ChatHistoryOut, ChatMessage, ResetOut
from app.services.agent_service import get_agent_service, AgentService

router = APIRouter(prefix="/api/consultations", tags=["chat"])

@router.post("/{consultation_id}/chat", response_model=ChatOut)
def chat(
    consultation_id: str,
    payload: ChatIn,
    svc: AgentService = Depends(get_agent_service),
):
    try:
        reply = svc.run_chat(
            patient_id=payload.patient_id,
            consultation_id=consultation_id,
            text=payload.text,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return ChatOut(
        consultation_id=consultation_id,
        patient_id=payload.patient_id,
        reply=reply,
    )


@router.get("/{consultation_id}/messages", response_model=ChatHistoryOut)
def messages(
    consultation_id: str,
    svc: AgentService = Depends(get_agent_service),
):
    msgs = svc.get_messages(consultation_id=consultation_id)

    return ChatHistoryOut(
        consultation_id=consultation_id,
        messages=[ChatMessage(**m) for m in msgs],
    )


@router.post("/{consultation_id}:reset", response_model=ResetOut)
def reset(
    consultation_id: str,
    svc: AgentService = Depends(get_agent_service),
):
    svc.reset_thread(consultation_id=consultation_id)
    return ResetOut(consultation_id=consultation_id, status="reset")


@router.post("/{consultation_id}/chat:stream")
async def chat_stream(
    consultation_id: str,
    payload: ChatIn,
    svc: AgentService = Depends(get_agent_service),
):
    """
    Stream chat responses as Server-Sent Events for word-by-word typing animation.
    """
    async def event_generator():
        # 1) Notify UI that streaming started
        yield "event: start\ndata: {}\n\n"

        # 2) Stream model deltas
        try:
            for chunk in svc.stream_chat(
                patient_id=payload.patient_id,
                consultation_id=consultation_id,
                text=payload.text,
            ):
                data = json.dumps({"text": chunk}, ensure_ascii=False)
                yield f"event: token\ndata: {data}\n\n"
                # Allow event loop to breathe
                await asyncio.sleep(0)
        except Exception as e:
            err = json.dumps({"error": str(e)}, ensure_ascii=False)
            yield f"event: error\ndata: {err}\n\n"
            return

        # 3) Done event
        yield "event: done\ndata: {\"ok\":true}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
