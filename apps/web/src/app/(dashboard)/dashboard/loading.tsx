import placesStyles from '@/modules/places/places.module.css';

// Skeleton cho /dashboard — phản ánh bố cục thật (tiêu đề + dòng chào + nút đăng xuất), KHÔNG
// phải lưới card (trang này không có danh sách). Route hiện là 'use client' không await dữ liệu
// ở Server Component, nên trong thực tế cửa sổ kích hoạt của boundary này rất ngắn (chỉ trong lúc
// RSC payload/bundle đang tải) — vẫn thêm để bao phủ đồng nhất mọi route.
export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="Đang tải bảng điều khiển">
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '35%', height: '1.8rem', margin: 0 }} />
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '50%' }} />
      <div className={placesStyles.skeleton} style={{ width: '8rem', height: '2.4rem', borderRadius: 8, marginTop: '1rem' }} />
    </main>
  );
}
