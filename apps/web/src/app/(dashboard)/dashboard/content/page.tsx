import { SiteContentView } from '@/modules/site-content/SiteContentView';

export const metadata = { title: 'Nội dung website — PhuQuocHub' };

export default function SiteContentPage() {
  return (
    <main>
      <h1>Nội dung website</h1>
      <SiteContentView />
    </main>
  );
}
