from pydantic import BaseModel


class Page(BaseModel):
    items: list
    page: int
    page_size: int
    total: int
