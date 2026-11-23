import type { Metadata } from 'next';
import { ConfirmProvider, ToastProvider } from '@/components/async';
import { GestorChrome } from './GestorChrome';

export const metadata: Metadata = {
  title: 'Spot Integra — Avaliações e Treinamentos',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SPOT Gestor', statusBarStyle: 'black-translucent' },
};

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  return (
    // Confirmação de sucesso disponível em todo o painel — salvar sem
    // nenhum retorno visível era o que fazia a pessoa repetir a ação.
    // .sp envolve os provedores de propósito: o aviso de sucesso e a confirmação
    // são desenhados por eles, fora de GestorChrome, e precisam do mesmo padrão.
    <div className="sp">
      <ToastProvider>
        <ConfirmProvider>
          <GestorChrome>{children}</GestorChrome>
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}
