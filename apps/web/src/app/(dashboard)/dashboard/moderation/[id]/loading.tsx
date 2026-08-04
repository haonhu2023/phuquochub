import modStyles from '@/modules/moderation/moderation.module.css';

export default function ModerationCaseLoading() {
  return (
    <main aria-busy="true" aria-label="Đang tải chi tiết case">
      <div className={modStyles.skelRow} style={{ marginBottom: '1rem' }} />
      <div className={modStyles.skelRow} />
    </main>
  );
}
