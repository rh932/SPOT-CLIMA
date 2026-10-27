import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Spot Integra — Pesquisa de Clima',
  manifest: '/manifest-survey.webmanifest',
  appleWebApp: { capable: true, title: 'Spot Integra', statusBarStyle: 'black-translucent' },
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
