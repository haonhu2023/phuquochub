// PLACE-041: loading UI cho /tours/[slug] — xem hotels/[slug]/loading.tsx cho ghi chú.
export default function TourDetailLoading() {
  return (
    <article aria-busy="true" aria-label="Đang tải thông tin tour">
      <p>Đang tải…</p>
    </article>
  );
}
