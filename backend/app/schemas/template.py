from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class TemplateBase(BaseModel):
    name: str
    industry: str
    strength: str
    rules: dict[str, Any]


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: str | None = None
    industry: str | None = None
    strength: str | None = None
    rules: dict[str, Any] | None = None


class TemplateOut(TemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
