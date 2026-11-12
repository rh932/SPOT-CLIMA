import { redirect } from 'next/navigation';

export default function HomePage() {
  // A raiz do sistema não expõe nada por padrão: colaborador vai para /survey,
  // administrador vai para /admin.
  redirect('/survey');
}
