// SEO riêng cho cẩm nang (2026-09-29) — MỘT nguồn fallback duy nhất, dùng bởi CẢ trang thật
// (generateMetadata, [slug]/page.tsx) VÀ ô xem trước trong editor (SerpPreview,
// GuideArticleEditorView.tsx) — hai nơi trước đây có thể lệch nhau (ô xem trước từng chỉ minh hoạ
// title/intro, không biết gì về metaTitle/metaDescription vì chúng chưa tồn tại). Giữ logic ở một
// hàm để ô xem trước LUÔN đúng với cách trang thật sẽ hiển thị, không phải "minh hoạ gần đúng".
export function resolveMetaTitle(metaTitle: string | null | undefined, title: string): string {
  return metaTitle?.trim() || title;
}

export function resolveMetaDescription(
  metaDescription: string | null | undefined,
  intro: string | null | undefined,
): string | undefined {
  return metaDescription?.trim() || intro?.trim() || undefined;
}
