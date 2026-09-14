import inspect
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from optimizer import optimize_procurement


class ProcurementInputs(BaseModel):
    demand_x: int = Field(ge=0)
    demand_y: int = Field(ge=0)
    supplier_a_capacity: int = Field(ge=0)
    supplier_b_capacity: int = Field(ge=0)
    x_cost_a: float = Field(ge=0)
    x_cost_b: float = Field(ge=0)
    y_cost_a: float = Field(ge=0)
    y_cost_b: float = Field(ge=0)
    shipping_a: float = Field(ge=0)
    shipping_b: float = Field(ge=0)
    delivery_a: float = Field(ge=0)
    delivery_b: float = Field(ge=0)
    max_average_delivery: float = Field(ge=0)


class ErrorResponse(BaseModel):
    error: str


app = FastAPI(title="Procurement Optimization API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


def model_defaults() -> dict[str, Any]:
    return {
        name: parameter.default
        for name, parameter in inspect.signature(optimize_procurement).parameters.items()
        if parameter.default is not inspect.Parameter.empty
    }


@app.get("/api/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/optimization/defaults", response_model=ProcurementInputs)
def get_optimization_defaults() -> ProcurementInputs:
    return ProcurementInputs(**model_defaults())


@app.post(
    "/api/optimization/run",
    response_model=dict[str, Any],
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def run_optimization(inputs: ProcurementInputs) -> dict[str, Any]:
    try:
        result = optimize_procurement(**inputs.model_dump())
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Optimization runtime unavailable: {exc}",
        ) from exc

    if result.get("status") != "Optimal":
        raise HTTPException(
            status_code=400,
            detail=result.get("message", "No feasible optimal solution was found."),
        )

    return result


if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8080")),
    )