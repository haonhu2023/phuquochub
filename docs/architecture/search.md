# PhuQuocHub — Kiến trúc Hệ thống Tìm kiếm (Search Architecture)

> **Mục đích:** thiết kế **kiến trúc kỹ thuật** cho toàn bộ năng lực tìm kiếm của PhuQuocHub. Tài liệu **chỉ thiết kế** (không code; đoạn truy vấn/công thức chỉ để minh họa hợp đồng & thuật toán). Đây là lớp **kiến trúc** — bổ sung cho đặc tả **sản phẩm** ở [../product/modules/search.md](../product/modules/search.md) và hợp đồng API ở [../api/api.md §22](../api/api.md).

---

## 1. Mục tiêu & phạm vi

Cung cấp một **mặt tìm kiếm hợp nhất** trên mọi thực thể của Phú Quốc, kết hợp:

- **Tìm văn bản** (keyword, không dấu tiếng Việt) + **ngữ nghĩa** (semantic) + **không gian** (geo/nearby).
- **Lọc có cấu trúc** (category, tag, business, giá, rating, đang mở).
- **Trợ giúp nhập liệu** (autocomplete, suggestion) và **khám phá** (trending, saved).
- **Hội thoại** (AI Search) đặt trên nền dữ liệu đã tìm được, có dẫn nguồn.

**14 loại tìm kiếm** (mục 4) + **6 mối quan tâm xuyên suốt** (Ranking, Scoring, Index, Caching, Logging, Analytics — mục 5–10).

**Ngoài phạm vi:** đặt phòng/giao dịch; cá nhân hóa nặng bằng ML (giai đoạn sau); tìm kiếm liên nền tảng ngoài dữ liệu PhuQuocHub.

## 2. Nguyên tắc thiết kế

1. **Một mô hình dữ liệu, nhiều engine.** Postgres là nguồn sự thật (source of truth); các engine tìm kiếm (FTS, geo, vector, Meilisearch) là **chỉ mục dẫn xuất**, dựng lại được.
2. **Tiến hóa theo quy mô.** Giai đoạn 1: **Postgres FTS + PostGIS + pgvector** (một hệ, ít vận hành). Khi lớn: tách **Meilisearch/Elasticsearch** cho keyword/facet, vector store riêng cho semantic — *đổi engine không đổi hợp đồng API*.
3. **Không dấu là mặc định.** Chuẩn hóa `unaccent + lowercase + trim + gộp khoảng trắng` cho cả **truy vấn** và **chỉ mục**; đồng nhất với chuẩn hóa của Analytics ([analytics.md §3.3](../data/modules/analytics.md)).
4. **Chỉ trả nội dung công khai.** Chỉ index/hiển thị thực thể `published`; không lộ `draft/pending/archived`.
5. **Aggregate-first cho tín hiệu.** Không log truy vấn kèm danh tính; chỉ đếm tổng hợp (search/zero-result/click) — riêng tư mặc định.
6. **Công bằng.** Không bán thứ hạng; ranking thuần theo liên quan/khoảng cách/chất lượng/độ tươi ([vision.md §5](../overview/vision.md)).
7. **Nhanh nhờ cache.** Redis cache prefix (suggest), kết quả `(q, filters)`, và ô bản đồ theo `geohash+zoom`; TTL ngắn + invalidation theo sự kiện.
8. **Deny-by-default & đa kênh.** `Search.Query` công khai; `Search.Reindex` chỉ Admin; Public API chỉ đọc, quota theo key, không PII.

## 3. Kiến trúc tổng thể

```
                        Client (Web · Mobile · Public API)
                                     │  q, filters, lat/lng, cursor
                                     ▼
                        ┌─────────────────────────┐
                        │   SEARCH GATEWAY (API)   │  xác thực·rate limit·chuẩn hóa q
                        └────────────┬────────────┘
                                     ▼
                        ┌─────────────────────────┐
        ┌───────────────┤   QUERY ROUTER / PLANNER ├───────────────┐  chọn engine theo intent
        │               └────────────┬────────────┘               │
        ▼                            ▼                             ▼
 ┌────────────┐            ┌──────────────────┐          ┌──────────────────┐
 │ KEYWORD    │            │ GEO / NEARBY     │          │ SEMANTIC / VECTOR │
 │ FTS (GIN)  │            │ PostGIS (GIST)   │          │ pgvector / store  │
 │ /Meilisearch│           │ nearby·bbox      │          │ embeddings (ANN)  │
 └─────┬──────┘            └────────┬─────────┘          └────────┬─────────┘
       │  facets: category·tag·business·price·rating·open_now      │
       └───────────────┬───────────┴─────────────────┬────────────┘
                       ▼                              ▼
                ┌──────────────┐              ┌──────────────┐
                │  RANKING /    │◄─ tín hiệu ─│  SIGNAL STORE │ (rating·verified·popularity)
                │  SCORING      │   chất lượng└──────────────┘
                └──────┬───────┘
                       ▼
               ┌───────────────┐   miss   ┌──────────────────────────┐
               │ REDIS CACHE   │◄────────►│  ENGINES (truy vấn thật)  │
               │ suggest·kết quả·bbox      └──────────────────────────┘
               └──────┬────────┘
                      ▼
              Response Envelope (data + meta.cursor)  ─┐
                      │                                 ├─► LOGGING (beacon) ─► ANALYTICS
             AI SEARCH (RAG) đọc kết quả + nguồn ◄──────┘   (aggregate·zero-result·trending)
```

**Thành phần logic:**

| Thành phần | Vai trò |
|---|---|
| **Search Gateway** | Điểm vào đa kênh: xác thực, rate limit/quota, chuẩn hóa `q`, phân trang cursor. |
| **Query Router/Planner** | Suy **ý định** (intent) → chọn engine & kết hợp (keyword ∪ semantic ∪ geo) + facet. |
| **Engines** | Keyword (FTS/Meilisearch), Geo (PostGIS), Semantic (pgvector/vector store). |
| **Signal store** | Tín hiệu chất lượng denormalize: `rating_avg/count`, `verification_status`, độ phổ biến (từ [analytics.md](../data/modules/analytics.md)). |
| **Ranking/Scoring** | Trộn điểm nhiều engine + tín hiệu → thứ hạng cuối. |
| **Redis cache** | suggest prefix · kết quả `(q,filters)` · bbox `geohash+zoom`. |
| **Logging → Analytics** | Beacon phi chặn → buffer → `search_queries_agg`, `trending_keywords`. |
| **AI Search (RAG)** | Lấy top kết quả có nguồn làm ngữ cảnh trả lời hội thoại ([ai-assistant.md](../product/modules/ai-assistant.md)). |

## 4. Các loại tìm kiếm

> Mỗi loại mô tả theo: **Mục tiêu · Cơ chế/Engine · Input & Filter · Ranking đặc thù · Cache · Ghi chú.**

### 4.1 Keyword Search
- **Mục tiêu:** tìm theo từ khóa văn bản trên tên/mô tả/tag của mọi thực thể index được (Place + chuyên biệt, Event, Community).
- **Cơ chế/Engine:** Postgres **FTS** (`tsvector` GIN, cấu hình `unaccent` + tiếng Việt) giai đoạn 1 → **Meilisearch/Elasticsearch** khi lớn (typo-tolerance, facet nhanh).
- **Input & Filter:** `q` (≥1–2 ký tự, chuẩn hóa không dấu); lọc `type`, `category`, `ward`, `price_range`, `rating`, `open_now`.
- **Ranking đặc thù:** khớp cụm/tiền tố > khớp rời; trọng số trường `name > tag > description`; cộng tín hiệu chất lượng (mục 5).
- **Cache:** kết quả theo khóa `(q_normalized, filters, sort, cursor)` TTL ngắn.
- **Ghi chú:** hỗ trợ **không dấu** hai chiều; "bai sao" = "Bãi Sao"; typo-tolerance nhẹ (trigram similarity ở FTS, native ở Meilisearch).

### 4.2 Semantic Search
- **Mục tiêu:** tìm theo **ý nghĩa** khi từ khóa không khớp mặt chữ ("chỗ yên tĩnh ngắm hoàng hôn" → bãi vắng phía Tây).
- **Cơ chế/Engine:** **embedding** nội dung thực thể → **vector search ANN** (`pgvector` giai đoạn đầu; vector store chuyên dụng khi lớn). Chạy **hybrid** với keyword.
- **Input & Filter:** `q` tự nhiên (câu/cụm); cùng bộ facet có cấu trúc để lọc sau khi truy hồi vector.
- **Ranking đặc thù:** **hybrid** = kết hợp điểm BM25/FTS + cosine similarity (mục 6, RRF/weighted); ngưỡng độ tương đồng tối thiểu để chặn nhiễu.
- **Cache:** cache embedding của truy vấn phổ biến; cache kết quả hybrid TTL ngắn.
- **Ghi chú:** embedding sinh khi nội dung `published`/đổi (gắn `source_hash` như AI summary → chỉ nhúng lại khi nội dung đổi). **Giai đoạn sau** nếu chi phí/độ phức tạp chưa cần.

### 4.3 Geo Search
- **Mục tiêu:** tìm/khám phá theo **vùng không gian** — trong khu vực/phường, trong khung nhìn bản đồ (bbox), theo lớp chủ đề.
- **Cơ chế/Engine:** **PostGIS** (`GEOGRAPHY(Point,4326)`, index **GIST**); truy vấn `bbox` (`ST_MakeEnvelope`/`&&`), gom cụm theo zoom.
- **Input & Filter:** `minLng,minLat,maxLng,maxLat,zoom` (bbox) hoặc `ward`/polygon khu vực; kèm facet loại/giá/rating.
- **Ranking đặc thù:** ưu tiên **mật độ & mức nổi bật** trong khung nhìn; ở zoom thấp trả **clustered points** thay vì mọi điểm.
- **Cache:** khóa theo **`geohash + zoom + filters`**, TTL ngắn (bản đồ đổi liên tục).
- **Ghi chú:** đồng bộ **bản đồ ↔ danh sách** (hover card ↔ pin); tọa độ giới hạn trong bao Phú Quốc.

### 4.4 Nearby Search
- **Mục tiêu:** "gần tôi" / gần một địa điểm — bán kính quanh một điểm.
- **Cơ chế/Engine:** PostGIS `ST_DWithin` (GEOGRAPHY, mét) + sắp theo `ST_Distance`; trả `distance_m`.
- **Input & Filter:** `lat,lng,radius` (mặc định ví dụ 2–5km), `category` (vd "lưu trú gần Bãi Sao", "ăn gì gần đây đang mở").
- **Ranking đặc thù:** **khoảng cách là trọng số chính**, kết hợp chất lượng (rating/verified) để không đẩy điểm gần nhưng kém lên đầu (mục 5).
- **Cache:** khóa `(geohash(lat,lng, độ chính xác vừa), radius, category, open_now)` TTL ngắn.
- **Ghi chú:** cần quyền định vị client; fallback theo `ward` khi không có GPS; kết hợp `open_now` (suy từ `opening_hours` + timezone).

### 4.5 Category Search
- **Mục tiêu:** duyệt/lọc theo **danh mục** (bãi biển, ẩm thực, lưu trú, tour, di tích, sự kiện…).
- **Cơ chế/Engine:** lọc quan hệ `places.category_id → categories` (index `(category_id, status)`); là **facet** trong keyword/geo, đồng thời là **landing** riêng.
- **Input & Filter:** `category` (slug), kết hợp `ward`, `price`, `rating`, `open_now`, geo.
- **Ranking đặc thù:** trong một danh mục → sắp theo phổ biến/đánh giá/độ tươi; hỗ trợ danh mục lồng (cha–con) nếu có.
- **Cache:** trang **danh mục/khu vực** là landing → cache mạnh + **SSG/ISR** (indexable).
- **Ghi chú:** trang danh mục/khu vực **có SEO** (khác trang kết quả động `noindex`); canonical rõ.

### 4.6 Tag Search
- **Mục tiêu:** tìm theo **thẻ chủ đề** mịn hơn danh mục (đặc sản, "lặn biển", "chay", "sống ảo", "gia đình").
- **Cơ chế/Engine:** quan hệ N–N `entity_tags` (từ điển tag chuẩn hóa) + index; là facet đa-chọn (giao/hợp tập).
- **Input & Filter:** `tags[]` (AND/OR), kết hợp mọi facet khác.
- **Ranking đặc thù:** số tag khớp + độ hiếm tag (tag hiếm mang tín hiệu mạnh hơn — trọng số kiểu IDF).
- **Cache:** kết quả theo tổ hợp `tags[]+filters` TTL ngắn; tag phổ biến cache lâu hơn.
- **Ghi chú:** tag từ **từ điển chuẩn** (code + label vi/en) để lọc & i18n nhất quán; tránh tag tự do trùng lặp. **Trạng thái: planned** — thực thể `entity_tags` **chưa được phê duyệt** (mô hình dữ liệu hiện chỉ có `categories`); chờ quyết định taxonomy — xem [database.md §13](../data/database.md).

### 4.7 Business Search
- **Mục tiêu:** tìm **cơ sở đã claim/verified** và thuộc tính doanh nghiệp (khách sạn theo sao/tiện ích, nhà hàng theo menu/ẩm thực, tour theo loại).
- **Cơ chế/Engine:** keyword + facet chuyên biệt theo loại (amenities, star, cuisine, tour_type) trên phần mở rộng Place; ưu tiên bản ghi `Official`.
- **Input & Filter:** `verified=true`, `stars`, `amenities[]`, `cuisine`, `tour_type`, `price_min/max`, khu vực.
- **Ranking đặc thù:** **badge verified/Official** được cộng điểm tin cậy; cơ sở hồ sơ đầy đủ (completeness) & phản hồi review tốt xếp cao hơn — **không** bán thứ hạng.
- **Cache:** như keyword; danh sách theo bộ lọc doanh nghiệp cache `public` ETag.
- **Ghi chú:** phục vụ cả **Partner API** (đối tác tra cứu cơ sở của mình); tôn trọng scope.

### 4.8 AI Search
- **Mục tiêu:** trả lời **hội thoại/ngôn ngữ tự nhiên** ("gợi ý 1 ngày ở Bắc đảo cho gia đình") dựa trên dữ liệu PhuQuocHub, **có dẫn nguồn Place**.
- **Cơ chế/Engine:** **RAG** — dùng Semantic + Keyword truy hồi ngữ cảnh (top-K thực thể `published` + nguồn) → LLM tổng hợp câu trả lời + thẻ Place.
- **Input & Filter:** câu hỏi tự nhiên (+ vị trí tùy chọn); nội bộ vẫn áp facet/geo để thu hẹp ngữ cảnh.
- **Ranking đặc thù:** chọn ngữ cảnh theo hybrid score + chất lượng/độ tươi; **chỉ trích dẫn nội dung có thật** (chống bịa).
- **Cache:** cache truy hồi ngữ cảnh cho câu hỏi phổ biến; câu trả lời cá nhân hóa **không** cache chung.
- **Ghi chú:** đọc **chỉ dữ liệu published**; thiếu dữ liệu → gợi ý đóng góp (nối tín hiệu 0-kết-quả, [WF-19](../workflow/contribution.md)); tuân human-in-the-loop khi ghi nội dung ([ai-assistant.md](../product/modules/ai-assistant.md), [api.md §21](../api/api.md)).

### 4.9 Autocomplete
- **Mục tiêu:** **hoàn thành** tên thực thể/từ khóa khi đang gõ (độ trễ rất thấp).
- **Cơ chế/Engine:** chỉ mục **prefix** (trigram/`text_pattern_ops`, hoặc prefix index của Meilisearch); nguồn: tên Place/cơ sở/tag/danh mục + từ khóa phổ biến.
- **Input & Filter:** `q` (prefix, ≥1 ký tự); có thể thiên vị theo vị trí (gợi ý gần trước).
- **Ranking đặc thù:** phổ biến (search/click count) + khớp tiền tố + gần vị trí; ưu tiên thực thể `Official`.
- **Cache:** **cache prefix mạnh** trong Redis (TTL ngắn); phục vụ phần lớn gõ phím từ cache.
- **Ghi chú:** endpoint `search/suggest`; nhẹ, tần suất cao; không tạo tải nặng lên DB.

### 4.10 Suggestion
- **Mục tiêu:** gợi ý **truy vấn/kết quả liên quan** — did-you-mean, "tìm kiếm liên quan", gợi ý khi 0 kết quả.
- **Cơ chế/Engine:** sửa lỗi chính tả (trigram similarity), đồng nghĩa (từ điển), truy vấn liên quan (đồng xuất hiện trong `search_queries_agg`), gợi ý lấp lỗ hổng nội dung.
- **Input & Filter:** `q` + ngữ cảnh (bộ lọc hiện tại, vị trí).
- **Ranking đặc thù:** khoảng cách chỉnh sửa nhỏ + phổ biến; khi 0 kết quả → ưu tiên gợi ý **mở rộng/đổi từ khóa** hoặc **đóng góp**.
- **Cache:** cache theo `q_normalized` TTL ngắn.
- **Ghi chú:** khác Autocomplete (hoàn thành tiền tố) — Suggestion là **định hướng lại truy vấn**; là cầu nối tới Analytics (zero-result → biên tập/AI).

### 4.11 Trending Search
- **Mục tiêu:** hiển thị **từ khóa đang lên** (trang chủ, gợi ý rỗng, khám phá).
- **Cơ chế/Engine:** đọc bảng **materialized `trending_keywords`** do job Analytics dựng ([analytics.md §4.2](../data/modules/analytics.md)); "trending" = **vận tốc tăng**, không phải tổng lượt.
- **Input & Filter:** `period` (`24h`/`7d`); tùy chọn theo khu vực/danh mục.
- **Ranking đặc thù:** `growth_score = (current − previous)/sqrt(previous + k)` (k≈5), lọc `current_count ≥ ngưỡng`; kèm `zero_result_rate` để lộ **cơ hội biên tập**.
- **Cache:** đọc bảng nhỏ đã sắp xếp → cache dài, làm mới theo nhịp job (15′–1h).
- **Ghi chú:** chỉ đọc bảng tính sẵn (không quét log thô); an toàn riêng tư (chỉ từ khóa tổng hợp).

### 4.12 Saved Search
- **Mục tiêu:** cho người dùng **lưu truy vấn + bộ lọc** để chạy lại, và (tùy chọn) **nhận thông báo** khi có kết quả mới.
- **Cơ chế/Engine:** thực thể `saved_searches` (per user); chạy lại = tái tạo truy vấn từ tham số đã lưu; alert = job nền so kết quả mới.
- **Input & Filter:** lưu `q`, `filters` (JSONB), `sort`, (tùy chọn) `alert` + kênh thông báo.
- **Ranking đặc thù:** như loại tìm gốc; alert dựa trên **thực thể mới `published`** khớp tiêu chí (dùng `created_at`/cursor để phát hiện delta).
- **Cache:** kết quả chạy lại theo cache chuẩn; danh sách saved là dữ liệu cá nhân → `private, no-store`.
- **Ghi chú:** khu vực cá nhân (`noindex`); thông báo qua [WF-20](../workflow/workflow.md); tránh alert spam (dedupe, gộp batch).

### 4.13 Community Search
- **Mục tiêu:** tìm **bài viết/thảo luận/hỏi đáp** cộng đồng theo từ khóa, chủ đề, khu vực, địa điểm gắn kèm.
- **Cơ chế/Engine:** FTS trên `title + content` của bài viết (+ tùy chọn bình luận); facet theo chủ đề/khu vực/`place_id`; sắp xếp **Hot/Mới/Top** ([community.md](../product/modules/community.md)).
- **Input & Filter:** `q`, `tags/topic`, `ward`, `place_id`, `sort=(hot,new,top)`.
- **Ranking đặc thù:** liên quan văn bản **+ tín hiệu cộng đồng** (điểm vote, độ mới); ưu tiên bài hữu ích/được vote cao; loại bài bị ẩn.
- **Cache:** kết quả theo `(q, filters, sort)` TTL ngắn; feed cá nhân hóa `private`.
- **Ghi chú:** chỉ index bài **`published`**; câu hỏi lặp → tín hiệu tạo FAQ (AI); gắn với vote/karma của cộng đồng.

### 4.14 Review Search
- **Mục tiêu:** tìm **trong nội dung đánh giá** ("view đẹp", "sạch sẽ", "đông") — toàn cục hoặc trong một địa điểm.
- **Cơ chế/Engine:** FTS trên nội dung review; facet `rating`, `has_media`, theo `place_id`; kết quả kèm ngữ cảnh cơ sở.
- **Input & Filter:** `q`, `place_id?`, `rating`, `has_media`, `sort=(helpful,new)`.
- **Ranking đặc thù:** liên quan **+ độ hữu ích** (`helpful_count`) **+ độ mới**; chỉ review `published`; loại review giả (AI moderation — [review.md](../product/modules/review.md)).
- **Cache:** danh sách theo `(place, q, filters)` TTL ngắn.
- **Ghi chú:** chỉ index review **`published`** (không `pending/hidden`); **không lộ PII**; bổ trợ AI tóm tắt "khách nói gì" ([ai-architecture.md](../ai/ai-architecture.md)).

## 5. Ranking

Xếp hạng cuối là **tổ hợp có trọng số** của điểm liên quan + tín hiệu chất lượng + ngữ cảnh:

```
final_rank ∝  w_rel · relevance     (khớp văn bản / hybrid semantic — mục 6)
            + w_geo · geo_proximity  (1 / (1 + distance_km); chỉ khi có vị trí)
            + w_qual · quality        (rating_avg · ln(1+rating_count), +bonus verification_status official/verified)
            + w_pop · popularity      (từ popular_places, có suy giảm thời gian)
            + w_fresh · freshness     (ưu tiên nội dung cập nhật gần đây)
            + w_ai    · AI_Score      (liên quan ngữ nghĩa + chất lượng do AI đánh giá)
            + w_trust · Trust_Score   (verification level + provenance + uy tín tác giả)
            − penalties               (thiếu tọa độ/ảnh, hồ sơ sơ sài, đã archived)
```

**Sáu yếu tố xếp hạng** (trọng số là **cấu hình**, mỗi yếu tố chuẩn hóa về [0,1] rồi nhân trọng số):

| Yếu tố | Ý nghĩa | Nguồn tín hiệu |
|---|---|---|
| **Popularity** | Độ phổ biến (nóng gần đây) | `popular_places` — có suy giảm thời gian ([analytics.md §6](../data/modules/analytics.md)) |
| **Rating** | Chất lượng theo đánh giá | `rating_avg · ln(1 + rating_count)` |
| **Distance** | Gần vị trí người dùng | PostGIS distance (chỉ khi có `lat/lng`) |
| **Freshness** | Độ tươi nội dung | `updated_at` / revision gần nhất |
| **AI Score** | Liên quan ngữ nghĩa + chất lượng do AI đánh giá | embedding similarity + tín hiệu AI ([ai-architecture.md](../ai/ai-architecture.md)) |
| **Trust Score** | Mức đáng tin | Verification level + provenance + uy tín tác giả ([verification.md](../data/modules/verification.md), [source.md](../data/modules/source.md)) |

> **AI Score** và **Trust Score** cộng vào công thức nền phía trên cùng `relevance`; đều là **cấu hình/tinh chỉnh**, không hardcode.

- **Trọng số theo ngữ cảnh (intent-aware):** truy vấn **nearby** → `w_geo/Distance` trội; truy vấn **thương hiệu/tên riêng** → `w_rel` trội; duyệt **danh mục** → `Popularity/Rating` trội.
- **Tie-breakers:** khoảng cách → rating → độ tươi → id ổn định (đảm bảo cursor phân trang **ổn định**).
- **Công bằng:** không có yếu tố "trả phí"; `verification_status` chỉ cộng **tin cậy**, không mua được thứ hạng.
- **Đa dạng (diversity):** hạn chế trùng loại/chủ liên tiếp ở đầu danh sách (tránh 10 kết quả cùng một chuỗi).

## 6. Scoring

Cách tính **điểm liên quan** ở từng engine và cách **hợp nhất**:

| Nguồn điểm | Cách tính | Ghi chú |
|---|---|---|
| **Keyword (FTS)** | `ts_rank`/BM25 trên `tsvector`; trọng số trường `name(A) > tag(B) > description(C)` | Meilisearch dùng xếp hạng nội tại (typo, proximity, exactness). |
| **Prefix (autocomplete)** | điểm khớp tiền tố + phổ biến | tối ưu độ trễ. |
| **Semantic (vector)** | `cosine_similarity(query_emb, doc_emb)` (ANN) | ngưỡng tối thiểu chặn nhiễu. |
| **Geo** | `geo_proximity = 1/(1+distance_km)` | chuẩn hóa 0–1. |
| **Quality** | `rating_avg · ln(1+rating_count)`; bonus verified | tránh 1 review 5★ vượt 200 review 4.5★. |
| **Popularity** | `score` từ `popular_places` (có `e^(−λ·age)`) | nóng gần đây ưu tiên. |

**Hợp nhất hybrid (keyword + semantic):**
- **Reciprocal Rank Fusion (RRF)** — bền với thang điểm khác nhau: `score = Σ 1/(k + rank_i)` (k≈60), **hoặc** tổng có trọng số sau khi **chuẩn hóa min–max** mỗi nguồn.
- Chuẩn hóa mọi thành phần về **[0,1]** trước khi nhân trọng số ở Ranking (mục 5).
- Trọng số `w_*` là **cấu hình** (không hardcode), tinh chỉnh bằng A/B & offline eval (nDCG, MRR).

## 7. Index

| Chỉ mục | Công nghệ / Cấu trúc | Phục vụ |
|---|---|---|
| **Full-text** | Postgres `tsvector` + **GIN** (unaccent, tiếng Việt) → Meilisearch/ES khi lớn | Keyword, Business, Tag (một phần), **Community**, **Review** |
| **Prefix/Trigram** | `pg_trgm` (GIN/GiST), `text_pattern_ops` | Autocomplete, did-you-mean |
| **Spatial** | PostGIS `GEOGRAPHY` + **GIST** | Geo, Nearby, bbox |
| **Vector** | `pgvector` (HNSW/IVFFlat) → vector store | Semantic, AI Search (RAG) |
| **Facet/Filter** | BTREE `(category_id,status)`, tag N–N, thuộc tính business | Category, Tag, Business |
| **Ranking signals** | cột denormalize `rating_avg/count`, `verification_status`, `view_count` + `popular_places` | Ranking/Scoring |

**Đồng bộ chỉ mục (indexing pipeline):**
- **Nguồn:** Place (+ chuyên biệt), Event, Community — chỉ bản ghi `published`.
- **Trigger:** khi duyệt/sửa/gộp/archive (workflow) → phát sự kiện → **cập nhật chỉ mục near-real-time** (job nền BullMQ, **idempotent**).
- **Reindex toàn phần:** job `Search.Reindex` (Admin) dựng lại từ Postgres — vì engine là **dẫn xuất**, luôn tái tạo được.
- **Embedding:** sinh/nhúng lại theo `source_hash` (chỉ khi nội dung đổi) để tiết kiệm chi phí.
- **Nhất quán:** bản ghi rời trạng thái `published` → **rút khỏi chỉ mục**; ETag/`updated_at` đổi → invalidation cache liên quan.

## 8. Caching

| Lớp | Khóa cache | TTL | Ghi chú |
|---|---|---|---|
| **Autocomplete** | `suggest:{prefix}:{ctx}` | ngắn (giây–phút) | cache mạnh; phục vụ đa số gõ phím. |
| **Kết quả search** | `search:{q_norm}:{filters}:{sort}:{cursor}` | ngắn | dữ liệu công khai → `Cache-Control: public` + **ETag**. |
| **Geo/bbox** | `geo:{geohash}:{zoom}:{filters}` | rất ngắn | ô bản đồ; đổi liên tục. |
| **Nearby** | `near:{geohash}:{radius}:{category}` | ngắn | geohash độ chính xác vừa để tăng hit. |
| **Trending** | `trending:{period}:{scope}` | dài (theo nhịp job) | đọc bảng materialized nhỏ. |
| **Category/khu vực landing** | trang SSG/ISR | dài | indexable; revalidate định kỳ. |
| **AI ngữ cảnh** | `rag:{q_norm}` (ngữ cảnh, không phải câu trả lời) | ngắn | câu trả lời cá nhân hóa **không** cache chung. |
| **Saved/cá nhân** | — | `private, no-store` | không cache chung. |

- **Nền tảng:** Redis (cache-aside) + **CDN** cho `/public/v1`. Trả header `ETag`/`If-None-Match` (304), `X-RateLimit-Remaining`.
- **Invalidation:** theo sự kiện duyệt/cập nhật/gộp → xóa khóa liên quan (theo `entity_id`, `category`, `geohash`); ETag đổi theo `updated_at`/revision.

## 9. Logging

**Mục tiêu:** thu tín hiệu để cải thiện tìm kiếm & phát hiện lỗ hổng nội dung — **không** giám sát cá nhân.

- **Sự kiện thu:** `search` (q chuẩn hóa, số kết quả, có/không click), `click` (vị trí kết quả), `zero_result`. Gửi **beacon phi chặn** (sendBeacon), không chặn UX.
- **Riêng tư:** **không** lưu IP/user-id theo từng truy vấn; khách duy nhất ước lượng bằng **HyperLogLog** (sketch, không truy ngược cá nhân) — [analytics.md §5](../data/modules/analytics.md).
- **Buffer tạm:** Redis (`INCR`/`ZINCRBY`/`PFADD`), TTL ngắn; flush job gộp rồi **xóa log thô** (không giữ lâu dài).
- **Chuẩn hóa khóa:** `q_normalized` đồng nhất với chỉ mục & Analytics → thống kê gộp đúng ("Bãi Sao"="bai sao").
- **Audit riêng:** hành động đặc quyền (`Search.Reindex`, đổi cấu hình ranking) ghi **audit log** (ai/khi nào/gì) — tách khỏi tín hiệu tìm kiếm.
- **Vận hành:** log kỹ thuật (độ trễ p50/p95, tỉ lệ cache hit, lỗi engine) cho quan sát hệ thống — không chứa PII.

## 10. Analytics

Tầng phân tích **aggregate-first** (đọc bảng tính sẵn, không quét log thô) — chi tiết ở [analytics.md](../data/modules/analytics.md):

| Thực thể | Vai trò cho Search |
|---|---|
| `search_queries_agg` | Từ khóa chuẩn hóa + `search_count`, **`zero_result_count`**, `click_count`, `result_count_avg`. |
| `trending_keywords` | Từ khóa đang lên (`growth_score`, `zero_result_rate`) → **Trending Search** (4.11). |
| `popular_places` | Độ phổ biến (có suy giảm thời gian) → tín hiệu **Ranking/Scoring**. |
| `place_views_agg` | Lượt xem theo địa điểm → popularity & dashboard. |

**Vòng phản hồi cải thiện tìm kiếm:**
```
Query → Logging (beacon) → buffer Redis → flush → *_agg (rollup hour→day→month)
      → ranking job dựng popular_places / trending_keywords
      → (a) Trending Search hiển thị   (b) tín hiệu Ranking   (c) zero-result → gợi ý tạo Place/FAQ (AI/biên tập)
```
- **Chỉ số chất lượng tìm kiếm:** CTR, **zero-result rate** (mục tiêu **giảm**), độ trễ p95, tỉ lệ cache hit, nDCG/MRR (offline eval), tỉ lệ dùng geo/nearby, số nội dung sinh từ tín hiệu 0-kết-quả.
- **Riêng tư mặc định:** mọi số là tổng hợp; không hồ sơ hành vi cá nhân.

## 11. Đa kênh & phân quyền

| Kênh | Đặc thù Search | Phân quyền |
|---|---|---|
| **Web** | Đầy đủ; offset hoặc cursor; ETag | `Search.Query` (public) |
| **Mobile** | **Cursor pagination**, payload gọn (`fields`), gợi ý offline | `Search.Query` |
| **Public API** (`/public/v1`) | Chỉ đọc, **quota theo key**, không PII, CDN, bắt buộc ghi công OSM/ODbL | API key |
| **Partner API** (`/partner/v1`) | Tra cứu cơ sở của đối tác (Business Search) theo scope | OAuth2 scope |
| **Vận hành** | `Search.Reindex`, đổi cấu hình ranking/trọng số | `Search.Reindex` (Admin), audited |

- Endpoint: `GET /search`, `GET /search/suggest`, `POST /search/reindex` — [api.md §22](../api/api.md).
- **Deny-by-default**; PEP→PDP kiểm permission + scope ([security.md](./security.md), [rbac.md](../security/rbac.md)).
- **SEO:** trang kết quả động `noindex`; **trang danh mục/khu vực** SSG/ISR **indexable** + canonical (mục 4.5).

## 12. Lộ trình tiến hóa

| Giai đoạn | Keyword | Semantic | Geo | Ghi chú |
|---|---|---|---|---|
| **1 — MVP** | Postgres FTS (GIN, unaccent) | *(chưa)* hoặc `pgvector` cơ bản | PostGIS | Một hệ, ít vận hành; đủ cho quy mô đầu. |
| **2 — Tăng trưởng** | **Meilisearch** (typo/facet nhanh) | `pgvector` HNSW (hybrid RRF) | PostGIS | Tách engine keyword; bật semantic. |
| **3 — Quy mô lớn** | Elasticsearch/OpenSearch | Vector store chuyên dụng | PostGIS/tile server | Cluster, sharding, personalization nhẹ. |

**Bất biến:** hợp đồng API `/search` **không đổi** khi thay engine — client không bị ảnh hưởng.

## 13. Quyết định cần chốt

1. **Bật Semantic/AI Search ở giai đoạn nào** — `pgvector` từ MVP hay đợi giai đoạn 2 (đánh đổi chi phí/độ phức tạp vs giá trị)?
2. **Thời điểm tách Meilisearch** — ngưỡng số bản ghi/độ trễ nào thì chuyển khỏi Postgres FTS?
3. **Trọng số ranking khởi tạo** (`w_rel, w_geo, w_qual, w_pop, w_fresh`) và cơ chế tinh chỉnh (A/B, offline eval).
4. **Chiến lược embedding** — model, kích thước vector, chi phí nhúng lại theo `source_hash`.
5. **Chính sách alert của Saved Search** — nhịp quét, ngưỡng gộp/dedupe, kênh mặc định.
6. **Bộ từ điển đồng nghĩa/tag chuẩn** cho tiếng Việt Phú Quốc (địa danh, đặc sản) — nguồn & quy trình cập nhật.

---

*Tài liệu liên quan: [../product/modules/search.md](../product/modules/search.md) (đặc tả sản phẩm), [api.md](../api/api.md) §22, [analytics.md](../data/modules/analytics.md), [places.md](../data/modules/places.md), [ai-assistant.md](../product/modules/ai-assistant.md), [architecture.md](./architecture.md), [tech-stack.md](./tech-stack.md), [security.md](./security.md), [rbac.md](../security/rbac.md), [vision.md](../overview/vision.md).*
