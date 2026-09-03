// PLACE-041: loading UI cho /restaurants/[slug] — xem hotels/[slug]/loading.tsx cho ghi chú.
export default function RestaurantDetailLoading() {
  return (
    <article aria-busy="true" aria-label="Đang tải thông tin nhà hàng">
      <p>Đang tải…</p>
    </article>
  );
}
