name: 京东商品转链
description: 京东商品转链。提取B站评论中的商品链接，适用于用户提供B站商品评论HTML（含a标签 href + data-raw-url）并导出Excel四列表头：href是长链接、data-raw-url是短链接、商品名是商品名、平台。
---

# B站商品链接提取

## 适用场景

- 用户要从 B 站评论内容里提取商品链接。
- 输入通常是插件复制出来的 HTML 片段（含 `a[data-type="goods"]`）。
- 输出需要固定列：`href是长链接`、`data-raw-url是短链接`、`商品名是商品名`、`平台`。

## 工作流

1. 获取原始内容。
- 如果用户已提供 HTML 片段：直接进入第 2 步。
- 如果用户只给视频链接：让用户在浏览器打开该视频，用其“商品链接提取”插件复制评论区的商品富文本 HTML，再粘贴给你或保存为文件。

2. 执行提取脚本。
- 文件输入：
```bash
python3 skills/bili-goods-extractor/scripts/extract_goods_links.py \
  --input /path/to/raw_goods_html.txt \
  --output-dir /path/to/output \
  --name 商品链接提取结果
```
- 管道输入（macOS 剪贴板）：
```bash
pbpaste | python3 skills/bili-goods-extractor/scripts/extract_goods_links.py \
  --stdin \
  --output-dir /path/to/output \
  --name 商品链接提取结果
```

3. 校验平台列规则。
- `href` 包含 `union-click.jd.com` -> `京东平台`
- 其他 -> `淘宝平台`

4. 交付结果。
- 输出同名 `.csv` 与 `.xlsx`。
- 回复用户生成文件的绝对路径和提取条数。

## 脚本说明

- 脚本路径：`scripts/extract_goods_links.py`
- 无第三方依赖（只用 Python 标准库）。
- 会按 `(href, data-raw-url, 商品名)` 去重，保留首次出现顺序。
