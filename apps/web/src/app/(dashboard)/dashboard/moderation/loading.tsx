import modStyles from '@/modules/moderation/moderation.module.css';

export default function ModerationQueueLoading() {
  return (
    <main aria-busy="true" aria-label="Đang tải hàng chờ kiểm duyệt">
      <div className={modStyles.queue}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={modStyles.skelRow} />
        ))}
      </div>
    </main>
  );
}
