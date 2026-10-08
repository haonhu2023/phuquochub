// "Kiểm metadata ảnh khi có nguy cơ lộ vị trí" (mục V đợt 4) — khi một tin bất động sản chọn
// address_precision='area' (chỉ hiển thị khu vực, không hiển thị vị trí chính xác), một bức ảnh
// vẫn có thể lộ chính xác vị trí đó qua EXIF GPS nhúng sẵn trong file (điện thoại/máy ảnh gắn tự
// động). Việc ẨN marker trên bản đồ không đủ nếu file ảnh chính nó mang toạ độ.
//
// Thiết kế: phát hiện RỦI RO, không cố "làm sạch" ảnh (không strip, không re-encode) — milestone
// này không có bất kỳ hạ tầng xử lý ảnh nào (resize/re-encode) để làm điều đó an toàn. Phát hiện
// thấy rủi ro ⇒ TỪ CHỐI upload, yêu cầu người đăng tải ảnh khác (hoặc đổi sang
// address_precision='exact' nếu họ thực sự muốn hiển thị vị trí). Từ chối rõ ràng, hiện ngay lúc
// đăng, an toàn hơn một bước "xoá metadata" thầm lặng mà người đăng không biết đã xảy ra.
//
// JPEG: phân tích CHÍNH XÁC — chỉ coi là rủi ro khi tìm thấy block GPS IFD (trỏ bởi tag 0x8825
// trong IFD0) và trong đó có ít nhất một trong hai tag GPSLatitude(0x0002)/GPSLongitude(0x0004).
// Một JPEG có EXIF nhưng KHÔNG có toạ độ (rất phổ biến — hầu hết thông số máy ảnh) không bị chặn.
//
// PNG/WEBP: ảnh điện thoại thực tế hầu như luôn lưu dạng JPEG; EXIF trong PNG (`eXIf` chunk) hoặc
// WEBP (`EXIF` chunk RIFF) hiếm gặp hơn nhiều và cấu trúc GPS-IFD-trong-EXIF-chunk vẫn CÙNG định
// dạng TIFF như JPEG — nên dùng LẠI đúng hàm parse TIFF ở dưới, không viết hai lần.

function readU16(buf: Buffer, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 2 > buf.length) return null;
  return littleEndian ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readU32(buf: Buffer, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 4 > buf.length) return null;
  return littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

const GPS_INFO_IFD_POINTER_TAG = 0x8825;
const GPS_LATITUDE_TAG = 0x0002;
const GPS_LONGITUDE_TAG = 0x0004;
const IFD_ENTRY_SIZE = 12;

/**
 * `tiff` bắt đầu đúng tại TIFF header (sau 6 byte "Exif\0\0" nếu nguồn là JPEG APP1, hoặc đúng
 * phần dữ liệu của chunk EXIF nếu nguồn là PNG/WEBP — cả hai đều là một TIFF structure chuẩn).
 * Trả `false` cho MỌI cấu trúc không đọc được/không khớp kỳ vọng — không throw, không chặn upload
 * vì lý do không liên quan (ảnh hỏng/lạ nhưng vô hại về vị trí).
 */
function tiffHasGpsCoordinates(tiff: Buffer): boolean {
  if (tiff.length < 8) return false;
  const marker = tiff.toString('ascii', 0, 2);
  if (marker !== 'II' && marker !== 'MM') return false;
  const littleEndian = marker === 'II';
  if (readU16(tiff, 2, littleEndian) !== 0x002a) return false;

  const ifd0Offset = readU32(tiff, 4, littleEndian);
  if (ifd0Offset == null) return false;
  const ifd0Count = readU16(tiff, ifd0Offset, littleEndian);
  if (ifd0Count == null) return false;

  let gpsIfdOffset: number | null = null;
  for (let i = 0; i < ifd0Count; i++) {
    const entryOffset = ifd0Offset + 2 + i * IFD_ENTRY_SIZE;
    const tag = readU16(tiff, entryOffset, littleEndian);
    if (tag == null) return false;
    if (tag === GPS_INFO_IFD_POINTER_TAG) {
      gpsIfdOffset = readU32(tiff, entryOffset + 8, littleEndian);
      break;
    }
  }
  if (gpsIfdOffset == null) return false;

  const gpsCount = readU16(tiff, gpsIfdOffset, littleEndian);
  if (gpsCount == null) return false;
  for (let i = 0; i < gpsCount; i++) {
    const entryOffset = gpsIfdOffset + 2 + i * IFD_ENTRY_SIZE;
    const tag = readU16(tiff, entryOffset, littleEndian);
    if (tag === GPS_LATITUDE_TAG || tag === GPS_LONGITUDE_TAG) return true;
  }
  return false;
}

const JPEG_SOS_MARKER = 0xda; // Start Of Scan — hết phần header chứa metadata, dừng quét ở đây.
const JPEG_APP1_MARKER = 0xe1;
const EXIF_SIGNATURE = 'Exif\0\0';

function jpegHasGpsExif(buf: Buffer): boolean {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return false;
    const marker = buf[offset + 1];
    if (marker === JPEG_SOS_MARKER) return false; // hết header — không có APP1 Exif.
    const length = buf.readUInt16BE(offset + 2); // gồm cả 2 byte length này.
    if (length < 2) return false;
    if (marker === JPEG_APP1_MARKER) {
      const payloadStart = offset + 4;
      const payloadEnd = offset + 2 + length;
      if (payloadEnd > buf.length) return false;
      if (buf.toString('latin1', payloadStart, payloadStart + 6) === EXIF_SIGNATURE) {
        return tiffHasGpsCoordinates(buf.subarray(payloadStart + 6, payloadEnd));
      }
    }
    offset += 2 + length;
  }
  return false;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngHasGpsExif(buf: Buffer): boolean {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const dataLength = buf.readUInt32BE(offset);
    const chunkType = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (chunkType === 'eXIf') {
      const dataEnd = dataStart + dataLength;
      if (dataEnd > buf.length) return false;
      return tiffHasGpsCoordinates(buf.subarray(dataStart, dataEnd));
    }
    if (chunkType === 'IEND') return false;
    offset = dataStart + dataLength + 4; // +4 cho CRC cuối chunk.
  }
  return false;
}

function webpHasGpsExif(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return false;
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const fourCc = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4); // RIFF dùng little-endian cho size chunk.
    const dataStart = offset + 8;
    if (fourCc === 'EXIF') {
      const dataEnd = dataStart + chunkSize;
      if (dataEnd > buf.length) return false;
      return tiffHasGpsCoordinates(buf.subarray(dataStart, dataEnd));
    }
    offset = dataStart + chunkSize + (chunkSize % 2); // chunk đệm tới số byte chẵn.
  }
  return false;
}

/** Trả `true` khi bytes của ảnh mang toạ độ GPS nhúng sẵn (EXIF) — xem phần giải thích ở đầu file. */
export function imageMayExposeLocation(buffer: Buffer, contentType: string): boolean {
  switch (contentType) {
    case 'image/jpeg':
      return jpegHasGpsExif(buffer);
    case 'image/png':
      return pngHasGpsExif(buffer);
    case 'image/webp':
      return webpHasGpsExif(buffer);
    default:
      return false;
  }
}
