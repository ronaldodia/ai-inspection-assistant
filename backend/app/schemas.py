from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class CreateInspectionRequest(BaseModel):
    address: str
    inspection_type: str
    notes: str | None = None
    lat: float | None = None
    lon: float | None = None


class AnomalyItem(BaseModel):
    type: str
    severity: str
    location: str
    description: str
    recommendation: str


class UpdateAnomaliesRequest(BaseModel):
    anomalies: list[AnomalyItem]
    overall_condition: str


class UpdateSynthesisRequest(BaseModel):
    synthesis: str
