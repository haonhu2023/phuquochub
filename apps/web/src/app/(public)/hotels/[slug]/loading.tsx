// PLACE-041: loading UI cho /hotels/[slug] — không tồn tại trước đây (không có Suspense
// fallback trong lúc server component chờ getHotel()).
export default function HotelDetailLoading() {
  return (
    <article aria-busy="true" aria-label="Đang tải thông tin khách sạn">
      <p>Đang tải…</p>
    </article>
  );
}
