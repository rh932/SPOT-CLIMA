'use client';

import { createContext, useContext } from 'react';

/**
 * Quem está logado, repartido pela casca para as telas não precisarem buscar
 * o nome de novo. `nome` vem de /api/auth/me e chega depois da primeira
 * pintura: enquanto for null, a tela usa um texto neutro.
 */
export const GestorSessaoContext = createContext<{ nome: string | null }>({ nome: null });

export const useGestorSessao = () => useContext(GestorSessaoContext);
