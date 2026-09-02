'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox as fetchBbox, type BboxMarker } from './api/geo.api';
import { getPlace } from '@/modules/places/api/places.api';
import type { Category } from '@/modules/categories/api/categories.api';
import type { GeoPoint } from '@/modules/places/types';
import { isValidCoord, clusterElement, placeElement, buildPopupCard, popupState } from './mapMarkers';
import { useLocale } from '@/lib/LocaleContext';
import styles from './map.module.css';

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
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const filtersRef = useRef({ category, ward });
  const categoriesRef = useRef(categories);
  // PR A: cùng pattern `categoriesRef` — `openPlacePopup` sống trong effect mount chạy MỘT LẦN,
  // đọc `locale` qua ref thay vì đóng gói trực tiếp giá trị lúc mount (locale thực tế không đổi
  // giữa client-side navigation trong PR A vì chưa có selector, nhưng giữ đúng pattern an toàn).
  const localeRef = useRef(locale);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  // Đếm request bbox — mỗi refresh() ghi lại số thứ tự của CHÍNH nó trước khi await, rồi so lại
  // sau khi resolve. Đổi filter trong lúc một refresh do pan/zoom trước đó còn đang bay có thể
  // khiến request CŨ hoàn thành SAU request MỚI (mạng không đảm bảo thứ tự) — không có guard này,
  // kết quả cũ (lọc sai) sẽ ghi đè lên kết quả mới, làm marker sai/nhấp nháy về trạng thái cũ.
  const requestSeqRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<'ok' | 'empty' | 'error'>('ok');

  useEffect(() => {
    filtersRef.current = { category, ward };
  }, [category, ward]);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

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
        if (popupRef.current === popup)
          popup.setDOMContent(buildPopupCard(detail, categoriesRef.current, localeRef.current));
      } catch {
        if (popupRef.current === popup) popup.setDOMContent(popupState('Không tải được thông tin địa điểm.'));
      }
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: PHU_QUOC_CENTER,
      zoom: 10,
      // Khớp trần zoom BboxQueryDto/GeoService.bbox() (1..20) — không có dòng này, MapLibre mặc
      // định cho zoom tới 22, người dùng cuộn/pinch quá 20 sẽ khiến MỌI request bbox kế tiếp bị
      // backend từ chối 400 (marker ngừng cập nhật) dù nền bản đồ vẫn hiển thị bình thường.
      maxZoom: 20,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({}), 'top-right');

    const refresh = async (): Promise<void> => {
      const b = map.getBounds();
      const mySeq = ++requestSeqRef.current;
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
        // Request cũ hơn hoàn thành SAU request mới (pan/zoom rồi đổi filter trước khi request đầu
        // trả về) — bỏ qua để không ghi đè marker mới bằng dữ liệu đã lỗi thời.
        if (mySeq !== requestSeqRef.current) return;
        const valid = markers.filter((m) => isValidCoord(m.lng, m.lat));
        markersRef.current.forEach((mk) => mk.remove());
        markersRef.current = valid.map((m) => {
          if (m.type === 'cluster') {
            return new maplibregl.Marker({
              element: clusterElement(m.count, () =>
                map.flyTo({ center: [m.lng, m.lat], zoom: Math.min(map.getZoom() + 2, 20) }),
              ),
            })
              .setLngLat([m.lng, m.lat])
              .addTo(map);
          }
          return new maplibregl.Marker({ element: placeElement(m.title, () => void openPlacePopup(map, m)) })
            .setLngLat([m.lng, m.lat])
            .addTo(map);
        });
        setStatus(valid.length === 0 ? 'empty' : 'ok');
      } catch {
        if (mySeq !== requestSeqRef.current) return;
        // Giữ marker hiện có (không xoá) — chỉ báo lỗi, không làm mất dữ liệu đã hiển thị đúng.
        setStatus('error');
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

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '70vh', borderRadius: 8 }} />
      {status === 'error' && (
        <div role="alert" className={styles.mapStatus}>
          Không tải được địa điểm. Di chuyển bản đồ để thử lại.
        </div>
      )}
      {status === 'empty' && (
        <div role="status" className={styles.mapStatus}>
          Không có địa điểm nào trong khu vực này.
        </div>
      )}
    </div>
  );
}
