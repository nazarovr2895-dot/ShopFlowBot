/**
 * Yandex Maps v3 SDK loader + reactify for adminpanel.
 * Mirrors miniapp/src/components/map/ymaps.ts but is self-contained.
 */
import React from 'react';
import * as ReactDOM from 'react-dom';

declare const ymaps3: any;

// --- API key storage ---
let _apiKey = '';

export function setYmapsApiKey(key: string): void {
  _apiKey = key;
}

export function getYmapsApiKey(): string {
  return _apiKey;
}

// --- SDK loader ---
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

export interface YmapsComponents {
  YMap: any;
  YMapDefaultSchemeLayer: any;
  YMapDefaultFeaturesLayer: any;
  YMapMarker: any;
  YMapListener: any;
  YMapControls: any;
  YMapZoomControl: any;
  reactify: any;
}

export async function loadYmaps(): Promise<YmapsComponents> {
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
      } = reactify.module(ymaps3);

      const { YMapZoomControl } = reactify.module(
        await ymaps3.import('@yandex/ymaps3-default-ui-theme'),
      );

      _components = {
        YMap,
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
        YMapMarker,
        YMapListener,
        YMapControls,
        YMapZoomControl,
        reactify,
      };
      return _components;
    })(), SDK_TIMEOUT_MS).catch((err) => {
      _promise = null;
      throw err;
    });
  }
  return _promise;
}
