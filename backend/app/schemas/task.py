from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, ConfigDict

from app.services.defaults import default_rules, default_scope, default_schedule


class TaskBase(BaseModel):
    name: str
    keywords: list[str] = Field(default_factory=list)
    exclude_words: list[str] = Field(default_factory=list)
    scope: dict[str, Any] = Field(default_factory=default_scope)
    schedule: dict[str, Any] = Field(default_factory=default_schedule)
    rules: dict[str, Any] = Field(default_factory=default_rules)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: str | None = None
    keywords: list[str] | None = None
    exclude_words: list[str] | None = None
    scope: dict[str, Any] | None = None
    schedule: dict[str, Any] | None = None
    rules: dict[str, Any] | None = None
    status: str | None = None


class TaskOut(TaskBase):
    id: str
    status: str
    consecutive_failures: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
