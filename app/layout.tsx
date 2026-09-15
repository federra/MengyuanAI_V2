import type { Metadata } from 'next';
import './globals.css';
import './business.css';
import './creative.css';
import './storyboard-sheet.css';
import './project-assets.css';
export const metadata: Metadata = {
  title: 'AI短片导演工作台',
  description: '从创意、剧本、资产到分镜与成片的创作工作台',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
