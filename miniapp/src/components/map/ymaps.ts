/**
 * Yandex Maps v3 SDK loader + reactify initialization.
 * Lazy-loads the SDK from CDN, then wraps native ymaps3 objects as React components.
 *
 * Usage:
 *   const { YMap, YMapDefaultSchemeLayer, ... } = await loadYmaps();
 */
import React from 'react';
import * as ReactDOM from 'react-dom';
import { getYmapsApiKey } from '../../api/ymapsConfig';

// Global ymaps3 is loaded from CDN script
declare const ymaps3: any;

const SDK_TIMEOUT_MS = 15_000;

let _promise: Promise<any> | null = null;
let _components: any = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Yandex Maps SDK load timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof ymaps3 !== 'undefined') {
      resolve();
      return;
    }
    const existing = document.getElementById('ymaps3-script');
    if (existing) {
      // Script tag exists but may have already loaded
      if (typeof ymaps3 !== 'undefined') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Yandex Maps SDK')));
      }
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
    _promise = withTimeout((async () => {
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

      // Load clusterer module from CDN (no npm package needed)
      // clusterByGrid is a plain function — take it directly, only reactify the component
      let YMapClusterer: any = null;
      let clusterByGrid: any = null;
      try {
        const ymaps3Clusterer = await ymaps3.import('@yandex/ymaps3-clusterer@0.0.1');
        clusterByGrid = ymaps3Clusterer.clusterByGrid;
        const reactified = reactify.module(ymaps3Clusterer);
        YMapClusterer = reactified.YMapClusterer;
      } catch (e) {
        console.warn('Failed to load ymaps3-clusterer, clustering disabled:', e);
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
        reactify,
      };
      return _components;
    })(), SDK_TIMEOUT_MS).catch((err) => {
      _promise = null; // Allow retry on next call
      throw err;
    });
  }
  return _promise;
}
