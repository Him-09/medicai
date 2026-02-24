from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time
import logging
from typing import Callable

logger = logging.getLogger(__name__)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.scope.get("type") == "websocket":
            return await call_next(request)
        
        response = await call_next(request)
        
        response.headers["X-Frame-Options"] = "DENY"
        
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: blob: https://cdn.jsdelivr.net; "
                "font-src 'self' data: https://cdn.jsdelivr.net; "
                "connect-src 'self' https:; "
                "frame-ancestors 'none';"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self' data:; "
                "connect-src 'self' https:; "
                "frame-ancestors 'none';"
            )
        
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )
        
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        if "/api/" in request.url.path:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.scope.get("type") == "websocket":
            return await call_next(request)
        
        start_time = time.time()
        
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        
        response = await call_next(request)
        
        duration = time.time() - start_time
        
        logger.info(
            f"{request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Duration: {duration:.3f}s - "
            f"IP: {client_ip}"
        )
        
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        
        return response

class RateLimitMiddleware(BaseHTTPMiddleware):
    
    def __init__(self, app: ASGIApp, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_counts: dict = {}
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        
        current_time = time.time()
        
        if client_ip in self.request_counts:
            count, reset_time = self.request_counts[client_ip]
            
            if current_time > reset_time:
                self.request_counts[client_ip] = (1, current_time + 60)
            elif count >= self.requests_per_minute:
                return Response(
                    content='{"detail": "Rate limit exceeded. Please try again later."}',
                    status_code=429,
                    headers={
                        "Content-Type": "application/json",
                        "Retry-After": str(int(reset_time - current_time)),
                    }
                )
            else:
                self.request_counts[client_ip] = (count + 1, reset_time)
        else:
            self.request_counts[client_ip] = (1, current_time + 60)
        
        response = await call_next(request)
        return response

def add_security_middleware(app: FastAPI):
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    
    logger.info("Security middleware configured")
