import re
import uuid
from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.core.errors import error_payload

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1", "frontend", "backend", "testserver"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def local_authority(value: str) -> tuple[str, int] | None:
    try:
        parsed = urlsplit(f"http://{value}")
        if (
            not value
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.hostname not in ALLOWED_HOSTS
        ):
            return None
        return parsed.hostname, parsed.port or 80
    except ValueError:
        return None


def allowed_origin(origin: str, host: tuple[str, int]) -> bool:
    try:
        parsed = urlsplit(origin)
        return (
            parsed.scheme == "http"
            and parsed.netloc != ""
            and parsed.username is None
            and parsed.password is None
            and not parsed.path
            and not parsed.query
            and not parsed.fragment
            and (parsed.hostname, parsed.port or 80) == host
        )
    except ValueError:
        return False


async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    supplied = request.headers.get("X-Request-ID", "")
    request_id = supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else f"req-{uuid.uuid4()}"
    request.state.request_id = request_id
    host = local_authority(request.headers.get("host", ""))
    origin = request.headers.get("origin")
    invalid_origin = (
        host is not None
        and request.method in WRITE_METHODS
        and origin is not None
        and not allowed_origin(origin, host)
    )
    if host is None or invalid_origin:
        forbidden_response = JSONResponse(
            status_code=403,
            content=error_payload(
                request=request, code="FORBIDDEN_ORIGIN", message="仅接受来自本机应用的请求"
            ),
        )
        forbidden_response.headers["X-Request-ID"] = request_id
        return forbidden_response
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
