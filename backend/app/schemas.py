from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class DisclosureItem(BaseModel):
    category: str
    type: str
    description: str
    year: int | None = None


class CreateInspectionRequest(BaseModel):
    address: str
    inspection_type: str = "general"
    notes: str | None = None
    lat: float | None = None
    lon: float | None = None
    building_type: str | None = None
    year_built: int | None = None
    client_name: str | None = None
    weather_conditions: str | None = None
    temperature_celsius: int | None = None
    humidity_percent: int | None = None
    floor_count: str | None = None
    area_sqft: int | None = None
    foundation_type: str | None = None
    heating_type: str | None = None
    last_renovation_year: int | None = None
    has_basement: str | None = None
    has_crawlspace: str | None = None
    has_attic: str | None = None
    disclosure_items: list[DisclosureItem] | None = None


class UpdateChecklistItemRequest(BaseModel):
    status: str
    notes: str | None = None


class UpdateSecurityChecklistItemRequest(BaseModel):
    status: str
    notes: str | None = None


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


class UpdateProfileRequest(BaseModel):
    full_name: str
    certification: str | None = None


class CreateInspectorRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str
    certification: str | None = None
    max_inspections: int | None = None
    max_photos_per_inspection: int | None = None


class UpdateInspectorRequest(BaseModel):
    full_name: str | None = None
    certification: str | None = None
    is_active: bool | None = None
    max_inspections: int | None = None
    max_photos_per_inspection: int | None = None


class ResetInspectorPasswordRequest(BaseModel):
    password: str = Field(min_length=8)
