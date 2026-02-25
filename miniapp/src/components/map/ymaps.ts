/**
 * Yandex Maps v3 SDK loader + reactify initialization.
 * Lazy-loads the SDK from CDN, then wraps native ymaps3 objects as React components.
 *
 * Usage:
 *   const { YMap, YMapDefaultSchemeLayer, ... } = await loadYmaps();
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { getYmapsApiKey } from '../../api/ymapsConfig';

// Global ymaps3 is loaded from CDN script
declare const ymaps3: any;

let _promise: Promise<any> | null = null;
let _components: any = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof ymaps3 !== 'undefined') {
      resolve();
      return;
    }
    const existing = document.getElementById('ymaps3-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Yandex Maps SDK')));
      return;
    }
    const key = getYmapsApiKey();
    if (!key) {
      reject(new Error('Yandex Maps API key not set'));
      return;
    }
    const script = document.createElement('script');
    script.id = 'ymaps3-script';
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Yandex Maps SDK'));
    document.head.appendChild(script);
  });
}

export async function loadYmaps() {
  if (_components) return _components;

  if (!_promise) {
    _promise = (async () => {
      await injectScript();
      await ymaps3.ready;

      const ymaps3Reactify = await ymaps3.import('@yandex/ymaps3-reactify');
      const reactify = ymaps3Reactify.reactify.bindTo(React, ReactDOM);

      const {
        YMap,
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
        YMapMarker,
        YMapListener,
        YMapControls,
        YMapDefaultMarker,
      } = reactify.module(ymaps3);

      // Import clusterer module
      let YMapClusterer: any = null;
      let clusterByGrid: any = null;
      try {
        const clustererModule = await ymaps3.import('@yandex/ymaps3-clusterer@0.0.1');
        const reactifiedClusterer = reactify.module(clustererModule);
        YMapClusterer = reactifiedClusterer.YMapClusterer;
        clusterByGrid = clustererModule.clusterByGrid;
      } catch {
        console.warn('[YMaps] Clusterer module not available');
      }

      _components = {
        YMap,
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
        YMapMarker,
        YMapListener,
        YMapControls,
        YMapDefaultMarker,
        YMapClusterer,
        clusterByGrid,
      };
      return _components;
    })();
  }
  return _promise;
}
