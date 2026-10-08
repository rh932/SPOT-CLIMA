import type { Metadata } from 'next';
import { ConfirmProvider, ToastProvider } from '@/components/async';
import { GestorChrome } from './GestorChrome';

export const metadata: Metadata = {
  title: 'SPOT CLIMA — Avaliações e Treinamentos',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SPOT Gestor', statusBarStyle: 'black-translucent' },
};

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  return (
    // Confirmação de sucesso disponível em todo o painel — salvar sem
    // nenhum retorno visível era o que fazia a pessoa repetir a ação.
    <ToastProvider>
      <ConfirmProvider>
        <GestorChrome>{children}</GestorChrome>
      </ConfirmProvider>
    </ToastProvider>
  );
}
