'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox as fetchBbox, type BboxMarker } from './api/geo.api';
import { getPlace } from '@/modules/places/api/places.api';
import type { Category } from '@/modules/categories/api/categories.api';
import type { GeoPoint } from '@/modules/places/types';
import {
  isValidCoord,
  clusterElement,
  placeElement,
  setMarkerSelected,
  buildPopupCard,
  popupState,
} from './mapMarkers';
import { useLocale } from '@/lib/LocaleContext';
import { getMapCopy } from './map.copy';
import styles from './map.module.css';

// PLACE-026 (OD2-8): nguồn tile cấu hình được qua NEXT_PUBLIC_MAP_TILE_URL — mặc định GIỮ
// NGUYÊN URL OpenStreetMap hiện tại (không cần API key, không đổi hành vi hiện có).
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Map/home upgrade (Phase 6.1): NEXT_PUBLIC_MAP_STYLE_URL cho một style MapLibre-compatible ĐẦY
// ĐỦ (vector, ví dụ MapTiler/Stadia "style.json" kèm key riêng trong chính URL đó) — KHÔNG commit
// key nào vào code, biến này rỗng theo mặc định nên không đổi hành vi hiện có. Khi đặt, style ĐÓ
// thắng hoàn toàn (MapLibre nhận thẳng URL, tự fetch); khi KHÔNG đặt, lùi về style raster OSM cũ,
// tương thích ngược 100% với `NEXT_PUBLIC_MAP_TILE_URL` đã có.
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL;

const RASTER_STYLE: StyleSpecification = {
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
const PHU_QUOC_ZOOM = 10;

interface MapViewProps {
  focusPoint?: GeoPoint | null;
  category?: string;
  ward?: string;
  categories?: Category[];
}

// Client Component: MapLibre + basemap cấu hình được (vector qua NEXT_PUBLIC_MAP_STYLE_URL, hoặc
// raster OSM/NEXT_PUBLIC_MAP_TILE_URL mặc định). Nạp marker theo bbox mỗi lần di chuyển/zoom, lọc
// lại khi `category`/`ward` đổi (KHÔNG di chuyển viewport — tránh jumping khi đổi bộ lọc).
// `focusPoint` (tuỳ chọn): khi thay đổi → fly tới điểm (đồng bộ list→map ở trang Explore).
export function MapView({ focusPoint, category, ward, categories }: MapViewProps = {}) {
  const locale = useLocale();
  const copy = getMapCopy(locale);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const selectedMarkerElRef = useRef<HTMLElement | null>(null);
  const filtersRef = useRef({ category, ward });
  const categoriesRef = useRef(categories);
  // PR A: cùng pattern `categoriesRef` — `openPlacePopup` sống trong effect mount chạy MỘT LẦN,
  // đọc `locale` qua ref thay vì đóng gói trực tiếp giá trị lúc mount (locale thực tế không đổi
  // giữa client-side navigation trong PR A vì chưa có selector, nhưng giữ đúng pattern an toàn).
  const localeRef = useRef(locale);
  const copyRef = useRef(copy);
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
    copyRef.current = copy;
  }, [locale, copy]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // `openPlacePopup` sống TRONG effect mount (không phải biến ngoài) — đọc `categories` qua
    // categoriesRef thay vì đóng gói trực tiếp props, để mount effect chỉ chạy MỘT LẦN ([]) mà
    // vẫn không vi phạm react-hooks/exhaustive-deps (không có closure nào trỏ ra props đổi theo render).
    function selectMarker(el: HTMLElement | null): void {
      if (selectedMarkerElRef.current && selectedMarkerElRef.current !== el) {
        setMarkerSelected(selectedMarkerElRef.current, false);
      }
      if (el) setMarkerSelected(el, true);
      selectedMarkerElRef.current = el;
    }

    async function openPlacePopup(
      map: maplibregl.Map,
      m: Extract<BboxMarker, { type: 'place' }>,
      markerEl: HTMLElement,
    ): Promise<void> {
      popupRef.current?.remove();
      selectMarker(markerEl);
      const popup = new maplibregl.Popup({ offset: 20, closeButton: true, maxWidth: '260px' })
        .setLngLat([m.lng, m.lat])
        .setDOMContent(popupState('Đang tải…'))
        .addTo(map);
      popup.on('close', () => selectMarker(null));
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
      // string URL (vector, khi cấu hình) hoặc StyleSpecification raster — cả hai đều là kiểu
      // `style` hợp lệ của maplibregl.Map; ép kiểu vì typings của thư viện tách hai overload này.
      style: (STYLE_URL || RASTER_STYLE) as StyleSpecification,
      center: PHU_QUOC_CENTER,
      zoom: PHU_QUOC_ZOOM,
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
            const ariaLabel = copyRef.current.clusterAriaLabel(m.count);
            const marker = new maplibregl.Marker({
              element: clusterElement(
                m.count,
                () => map.flyTo({ center: [m.lng, m.lat], zoom: Math.min(map.getZoom() + 2, 20) }),
                ariaLabel,
              ),
            })
              .setLngLat([m.lng, m.lat])
              .addTo(map);
            // `Marker.addTo()` GHI ĐÈ `aria-label` bằng chuỗi "Map marker" chung của chính thư viện
            // (maplibre-gl, Marker.prototype.addTo — vô điều kiện, xảy ra SAU khi nhận `element`
            // tuỳ biến) — phải đặt lại nhãn thật NGAY SAU addTo(), nếu không mọi marker (kể cả
            // cụm/địa điểm khác nhau) đều bị trình đọc màn hình đọc thành cùng một câu chung chung.
            marker.getElement().setAttribute('aria-label', ariaLabel);
            return marker;
          }
          const el = placeElement(m.title, () => void openPlacePopup(map, m, el));
          // anchor: 'bottom' — đầu nhọn SVG (không phải tâm hộp 40px) mới là toạ độ thật; xem chú
          // thích `.placeMarker` trong map.module.css.
          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map);
          marker.getElement().setAttribute('aria-label', m.title);
          return marker;
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
    <div className={styles.mapContainer}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Nút "Về Phú Quốc" (Phase 6.7) — chỉ đưa viewport về mặc định, KHÔNG yêu cầu quyền vị trí
          (đọc vị trí thật của người dùng là một tính năng khác, chưa có ở đây — không được ngầm
          đòi quyền chỉ để dùng bản đồ). */}
      <button
        type="button"
        className={styles.resetControl}
        onClick={() => mapRef.current?.flyTo({ center: PHU_QUOC_CENTER, zoom: PHU_QUOC_ZOOM })}
      >
        {copy.resetLabel}
      </button>
      {status === 'error' && (
        <div role="alert" className={styles.mapStatus}>
          {copy.errorStatus}
        </div>
      )}
      {status === 'empty' && (
        <div role="status" className={styles.mapStatus}>
          {copy.emptyStatus}
        </div>
      )}
    </div>
  );
}
