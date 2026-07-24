'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox as fetchBbox, type BboxMarker } from './api/geo.api';
import type { GeoPoint } from '@/modules/places/types';

// PLACE-026 (OD2-8): nguồn tile cấu hình được qua NEXT_PUBLIC_MAP_TILE_URL — mặc định GIỮ
// NGUYÊN URL OpenStreetMap hiện tại (không cần API key, không đổi hành vi hiện có). Đổi sang
// MapTiler production: đặt biến này ra URL tile MapTiler thật (kèm API key), không cần sửa code.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [TILE_URL],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const PHU_QUOC_CENTER: [number, number] = [103.98, 10.22];

function markerElement(m: BboxMarker): HTMLElement {
  const el = document.createElement('div');
  if (m.type === 'cluster') {
    el.textContent = String(m.count);
    Object.assign(el.style, {
      background: '#2563eb',
      color: '#fff',
      borderRadius: '50%',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer',
    } as CSSStyleDeclaration);
  } else {
    el.textContent = '📍';
    el.title = m.title;
    el.style.cursor = 'pointer';
    el.style.fontSize = '20px';
    el.onclick = () => {
      window.location.href = `/places/${m.slug}`;
    };
  }
  return el;
}

// Client Component: MapLibre + OSM raster. Nạp marker theo bbox mỗi lần di chuyển/zoom.
// `focusPoint` (tuỳ chọn): khi thay đổi → fly tới điểm (đồng bộ list→map ở trang Explore).
export function MapView({ focusPoint }: { focusPoint?: GeoPoint | null } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: PHU_QUOC_CENTER,
      zoom: 10,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({}), 'top-right');

    const refresh = async (): Promise<void> => {
      const b = map.getBounds();
      try {
        const markers = await fetchBbox({
          minLng: b.getWest(),
          minLat: b.getSouth(),
          maxLng: b.getEast(),
          maxLat: b.getNorth(),
          zoom: Math.round(map.getZoom()),
        });
        markersRef.current.forEach((mk) => mk.remove());
        markersRef.current = markers.map((m) =>
          new maplibregl.Marker({ element: markerElement(m) }).setLngLat([m.lng, m.lat]).addTo(map),
        );
      } catch {
        // Bỏ qua lỗi tải bbox (giữ marker hiện có).
      }
    };

    map.on('load', () => {
      setReady(true);
      void refresh();
    });
    map.on('moveend', refresh);

    return () => {
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Đồng bộ list→map: khi chọn kết quả, fly tới toạ độ địa điểm.
  useEffect(() => {
    if (!ready || !focusPoint || !mapRef.current) return;
    mapRef.current.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: 15 });
  }, [ready, focusPoint]);

  return <div ref={containerRef} style={{ width: '100%', height: '70vh', borderRadius: 8 }} />;
}
