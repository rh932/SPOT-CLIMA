import type { Metadata } from 'next';
import { ConfirmProvider, ToastProvider } from '@/components/async';
import { AdminChrome } from './AdminChrome';

export const metadata: Metadata = {
  title: 'SPOT CLIMA — Painel Administrativo',
  // Manifesto próprio: no iPhone, o atalho criado na tela de início abre o
  // start_url do manifesto, não a página em que ele foi criado. Com um só
  // manifesto (start_url /gestor), o atalho do admin abria o gestor.
  manifest: '/manifest-admin.webmanifest',
  appleWebApp: { capable: true, title: 'SPOT Admin', statusBarStyle: 'black-translucent' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Confirmação de sucesso disponível em todo o painel — salvar sem
    // nenhum retorno visível era o que fazia a pessoa repetir a ação.
    <ToastProvider>
      <ConfirmProvider>
        <AdminChrome>{children}</AdminChrome>
      </ConfirmProvider>
    </ToastProvider>
  );
}
