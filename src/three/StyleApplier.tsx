// Applica lo stile di resa alla scena del Canvas in cui è montato, a ogni frame (solo alle mesh nuove o cambiate).
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { applyStyle, STYLE_BG, type RenderStyle } from './styles';

export function StyleApplier({ style, background = true }: { style: RenderStyle; background?: boolean }) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (background) scene.background = new THREE.Color(STYLE_BG[style]);
    applyStyle(scene, style);
    invalidate();
  }, [scene, style, background, invalidate]);
  // priorità negativa: prima del render, così le mesh appena montate escono già con lo stile giusto
  useFrame(() => applyStyle(scene, style), -1);
  return null;
}
