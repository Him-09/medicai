# security/middleware.py
"""
Security middleware for MedicAI.
Provides security headers, request logging, and protection against common attacks.
"""
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time
import logging
from typing import Callable

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses.
    These headers protect against common web vulnerabilities.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip WebSocket connections - BaseHTTPMiddleware can't handle them
        if request.scope.get("type") == "websocket":
            return await call_next(request)
        
        response = await call_next(request)
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Enable XSS protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Content Security Policy (adjust based on your needs)
        # Relaxed CSP for /docs and /redoc to allow Swagger UI to load from CDN
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
        
        # Permissions Policy (formerly Feature-Policy)
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )
        
        # Strict Transport Security (HTTPS only)
        # Only add if running behind HTTPS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Prevent caching of sensitive data
        if "/api/" in request.url.path:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Log all requests with timing information.
    Useful for debugging and monitoring.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip WebSocket connections - BaseHTTPMiddleware can't handle them
        if request.scope.get("type") == "websocket":
            return await call_next(request)
        
        # Start timing
        start_time = time.time()
        
        # Get client IP (handles proxies)
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        
        # Process request
        response = await call_next(request)
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Log the request (no PHI in path)
        logger.info(
            f"{request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Duration: {duration:.3f}s - "
            f"IP: {client_ip}"
        )
        
        # Add timing header
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple rate limiting middleware.
    For production, use Redis-based rate limiting.
    """
    
    def __init__(self, app: ASGIApp, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_counts: dict = {}  # IP -> (count, reset_time)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Get client IP
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        
        # Check rate limit
        current_time = time.time()
        
        if client_ip in self.request_counts:
            count, reset_time = self.request_counts[client_ip]
            
            if current_time > reset_time:
                # Reset counter
                self.request_counts[client_ip] = (1, current_time + 60)
            elif count >= self.requests_per_minute:
                # Rate limited
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
    """
    Add all security middleware to the FastAPI app.
    Call this in main.py after creating the app.
    """
    # Add middleware in reverse order (last added = first executed)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    # Uncomment for rate limiting:
    # app.add_middleware(RateLimitMiddleware, requests_per_minute=120)
    
    logger.info("Security middleware configured")
