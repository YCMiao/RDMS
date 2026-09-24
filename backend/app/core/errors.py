from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def error_payload(
    *, request: Request, code: str, message: str, fields: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "fields": fields or [],
            "request_id": request.state.request_id,
        }
    }


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    fields = [
        {"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=error_payload(
            request=request,
            code="VALIDATION_ERROR",
            message="请求字段无效",
            fields=fields,
        ),
    )
