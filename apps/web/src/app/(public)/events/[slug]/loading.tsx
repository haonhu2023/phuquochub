// PLACE-041: loading UI cho /events/[slug] — xem hotels/[slug]/loading.tsx cho ghi chú.
export default function EventDetailLoading() {
  return (
    <article aria-busy="true" aria-label="Đang tải thông tin sự kiện">
      <p>Đang tải…</p>
    </article>
  );
}
