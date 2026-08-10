'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox as fetchBbox, type BboxMarker } from './api/geo.api';
import { getPlace } from '@/modules/places/api/places.api';
import type { Category } from '@/modules/categories/api/categories.api';
import type { GeoPoint } from '@/modules/places/types';
import { isValidCoord, clusterElement, placeElement, buildPopupCard, popupState } from './mapMarkers';

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

interface MapViewProps {
  focusPoint?: GeoPoint | null;
  category?: string;
  ward?: string;
  categories?: Category[];
}

// Client Component: MapLibre + OSM raster. Nạp marker theo bbox mỗi lần di chuyển/zoom, lọc lại
// khi `category`/`ward` đổi (KHÔNG di chuyển viewport — tránh jumping khi đổi bộ lọc).
// `focusPoint` (tuỳ chọn): khi thay đổi → fly tới điểm (đồng bộ list→map ở trang Explore).
export function MapView({ focusPoint, category, ward, categories }: MapViewProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const filtersRef = useRef({ category, ward });
  const categoriesRef = useRef(categories);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    filtersRef.current = { category, ward };
  }, [category, ward]);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // `openPlacePopup` sống TRONG effect mount (không phải biến ngoài) — đọc `categories` qua
    // categoriesRef thay vì đóng gói trực tiếp props, để mount effect chỉ chạy MỘT LẦN ([]) mà
    // vẫn không vi phạm react-hooks/exhaustive-deps (không có closure nào trỏ ra props đổi theo render).
    async function openPlacePopup(map: maplibregl.Map, m: Extract<BboxMarker, { type: 'place' }>): Promise<void> {
      popupRef.current?.remove();
      const popup = new maplibregl.Popup({ offset: 16, closeButton: true, maxWidth: '260px' })
        .setLngLat([m.lng, m.lat])
        .setDOMContent(popupState('Đang tải…'))
        .addTo(map);
      popupRef.current = popup;
      try {
        const detail = await getPlace(m.slug);
        // Người dùng có thể đã đóng popup trong lúc chờ — không ghi đè popup khác đang mở.
        if (popupRef.current === popup) popup.setDOMContent(buildPopupCard(detail, categoriesRef.current));
      } catch {
        if (popupRef.current === popup) popup.setDOMContent(popupState('Không tải được thông tin địa điểm.'));
      }
    }

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
          category: filtersRef.current.category,
          ward: filtersRef.current.ward,
        });
        const valid = markers.filter((m) => isValidCoord(m.lng, m.lat));
        markersRef.current.forEach((mk) => mk.remove());
        markersRef.current = valid.map((m) => {
          if (m.type === 'cluster') {
            const el = clusterElement(m.count);
            el.onclick = () => map.flyTo({ center: [m.lng, m.lat], zoom: Math.min(map.getZoom() + 2, 20) });
            return new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
          }
          const el = placeElement(m.title);
          el.onclick = () => void openPlacePopup(map, m);
          return new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
        });
      } catch {
        // Bỏ qua lỗi tải bbox (giữ marker hiện có).
      }
    };
    refreshRef.current = refresh;

    map.on('load', () => {
      setReady(true);
      void refresh();
    });
    map.on('moveend', refresh);

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
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

  // Đổi bộ lọc → tải lại marker trong khung nhìn HIỆN TẠI, không di chuyển viewport.
  useEffect(() => {
    if (!ready) return;
    void refreshRef.current();
  }, [ready, category, ward]);

  return <div ref={containerRef} style={{ width: '100%', height: '70vh', borderRadius: 8 }} />;
}
