from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.compound_chemistry import router as compound_chemistry_router
from app.api.discovery import router as discovery_router
from app.api.files import router as files_router
from app.api.health import router as health_router
from app.api.lab import router as lab_router
from app.api.records import router as records_router
from app.api.trash import router as trash_router
from app.core.errors import error_payload, validation_exception_handler
from app.core.middleware import request_id_middleware
from app.services.records import RecordError

app = FastAPI(
    title="RDMS API",
    version="0.1.0",
    description="本机科研数据管理系统 API。",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.middleware("http")(request_id_middleware)
app.add_exception_handler(RequestValidationError, validation_exception_handler)


@app.exception_handler(RecordError)
async def record_error(request: Request, exc: RecordError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content=error_payload(request=request, code=exc.code, message=exc.message),
    )


app.include_router(health_router, prefix="/api")
app.include_router(records_router, prefix="/api")
app.include_router(compound_chemistry_router, prefix="/api")
app.include_router(lab_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(discovery_router, prefix="/api")
app.include_router(trash_router, prefix="/api")
