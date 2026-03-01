from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Product, ProductMention
from app.schemas.pagination import Page

router = APIRouter()


def _parse_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@router.get("", response_model=Page)
def list_products(
    db: Session = Depends(get_db),
    task_ids: str | None = None,
    keyword: str | None = None,
    days: int = Query(7, ge=1, le=365),
    metric_mode: str = Query("global_sellers"),
    min_sellers: int | None = None,
    min_videos: int | None = None,
    sort: str | None = None,
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    since = datetime.utcnow() - timedelta(days=int(days))
    task_list = _parse_csv(task_ids)
    keyword_list = _parse_csv(keyword)

    videos_expr = func.count(func.distinct(ProductMention.bvid))
    if metric_mode == "video_sellers":
        seller_expr = func.count(
            func.distinct(ProductMention.bvid + literal(":") + ProductMention.user_id)
        )
    else:
        seller_expr = func.count(func.distinct(ProductMention.user_id))

    mentions_expr = func.count(ProductMention.id)
    last_seen_expr = func.max(ProductMention.mentioned_at)

    query = (
        select(
            Product.id.label("product_id"),
            Product.platform,
            Product.item_id,
            Product.sku_id,
            Product.category_tags,
            last_seen_expr.label("last_seen_at"),
            videos_expr.label("videos_count"),
            seller_expr.label("seller_count"),
            mentions_expr.label("mentions_count"),
        )
        .join(ProductMention, ProductMention.product_id == Product.id)
        .where(ProductMention.mentioned_at >= since)
        .group_by(Product.id)
    )

    if task_list:
        query = query.where(ProductMention.task_id.in_(task_list))
    if keyword_list:
        if len(keyword_list) == 1:
            query = query.where(ProductMention.keyword == keyword_list[0])
        else:
            query = query.where(ProductMention.keyword.in_(keyword_list))

    if min_sellers is not None:
        query = query.having(seller_expr >= int(min_sellers))
    if min_videos is not None:
        query = query.having(videos_expr >= int(min_videos))

    sort_key = sort or ("sellers" if metric_mode == "global_sellers" else "sellers")
    order_col = {
        "sellers": seller_expr,
        "videos": videos_expr,
        "last_seen_at": last_seen_expr,
    }.get(sort_key, seller_expr)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
    if order.lower() == "asc":
        query = query.order_by(order_col.asc())
    else:
        query = query.order_by(order_col.desc())

    rows = (
        db.execute(query.offset((page - 1) * page_size).limit(page_size))
        .mappings()
        .all()
    )

    items = []
    for row in rows:
        seller_count = int(row["seller_count"] or 0)
        mentions_count = int(row["mentions_count"] or 0)
        intensity = round(mentions_count / seller_count, 4) if seller_count > 0 else 0
        items.append(
            {
                "product_id": row["product_id"],
                "platform": row["platform"],
                "item_id": row["item_id"],
                "sku_id": row["sku_id"],
                "category_tags": row["category_tags"] or [],
                "last_seen_at": row["last_seen_at"],
                "videos_count": int(row["videos_count"] or 0),
                "seller_count": seller_count,
                "intensity": intensity,
            }
        )

    return {"items": items, "page": page, "page_size": page_size, "total": int(total)}
