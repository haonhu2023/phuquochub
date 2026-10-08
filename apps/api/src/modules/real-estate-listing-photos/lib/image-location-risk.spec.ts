import { imageMayExposeLocation } from './image-location-risk';

const GPS_INFO_IFD_POINTER_TAG = 0x8825;
const GPS_LATITUDE_TAG = 0x0002;
const SOME_OTHER_TAG = 0x0110; // Model — EXIF chủ thiết bị, không liên quan vị trí.
const GPS_VERSION_ID_TAG = 0x0000; // GPS IFD có thể tồn tại nhưng không mang toạ độ thật.

function buildIfdEntry(tag: number, type: number, count: number, valueOrOffset: number): Buffer {
  const entry = Buffer.alloc(12);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(type, 2);
  entry.writeUInt32LE(count, 4);
  entry.writeUInt32LE(valueOrOffset, 8);
  return entry;
}

/** Dựng một TIFF (little-endian) tối giản với IFD0 chứa đúng 1 entry, tuỳ chọn trỏ tới GPS IFD. */
function buildTiff(opts: { ifd0Entry?: Buffer; gpsIfdEntries?: Buffer[] }): Buffer {
  const header = Buffer.alloc(8);
  header.write('II', 0, 'ascii');
  header.writeUInt16LE(0x002a, 2);
  header.writeUInt32LE(8, 4); // IFD0 bắt đầu ngay sau header.

  const ifd0Entries = opts.ifd0Entry ? [opts.ifd0Entry] : [];
  const ifd0 = Buffer.concat([
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(ifd0Entries.length, 0);
      return b;
    })(),
    ...ifd0Entries,
    Buffer.alloc(4), // next-IFD offset = 0
  ]);

  let gpsIfd = Buffer.alloc(0);
  if (opts.gpsIfdEntries) {
    gpsIfd = Buffer.concat([
      (() => {
        const b = Buffer.alloc(2);
        b.writeUInt16LE(opts.gpsIfdEntries!.length, 0);
        return b;
      })(),
      ...opts.gpsIfdEntries,
      Buffer.alloc(4),
    ]);
  }

  return Buffer.concat([header, ifd0, gpsIfd]);
}

function tiffWithGpsCoordinates(): Buffer {
  const gpsIfdOffset = 8 + 2 + 12 + 4; // header + ifd0Count + 1 entry + nextIfdOffset
  const ifd0Entry = buildIfdEntry(GPS_INFO_IFD_POINTER_TAG, 4, 1, gpsIfdOffset);
  return buildTiff({ ifd0Entry, gpsIfdEntries: [buildIfdEntry(GPS_LATITUDE_TAG, 5, 1, 0)] });
}

function tiffWithGpsIfdButNoCoordinates(): Buffer {
  const gpsIfdOffset = 8 + 2 + 12 + 4;
  const ifd0Entry = buildIfdEntry(GPS_INFO_IFD_POINTER_TAG, 4, 1, gpsIfdOffset);
  return buildTiff({ ifd0Entry, gpsIfdEntries: [buildIfdEntry(GPS_VERSION_ID_TAG, 1, 4, 0)] });
}

function tiffWithUnrelatedExifOnly(): Buffer {
  return buildTiff({ ifd0Entry: buildIfdEntry(SOME_OTHER_TAG, 2, 1, 0) });
}

function wrapJpeg(tiff?: Buffer): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  let app1 = Buffer.alloc(0);
  if (tiff) {
    const exifSig = Buffer.from('Exif\0\0', 'latin1');
    const payload = Buffer.concat([exifSig, tiff]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2, 0);
    app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), length, payload]);
  }
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x02]);
  const tail = Buffer.from([0x00, 0x00, 0xff, 0xd9]);
  return Buffer.concat([soi, app1, sos, tail]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function wrapPng(exifTiff?: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = exifTiff ? [pngChunk('eXIf', exifTiff)] : [pngChunk('IDAT', Buffer.alloc(0))];
  return Buffer.concat([signature, ...chunks, pngChunk('IEND', Buffer.alloc(0))]);
}

function webpChunk(fourCc: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length, 0);
  const padded = data.length % 2 === 1 ? Buffer.concat([data, Buffer.alloc(1)]) : data;
  return Buffer.concat([Buffer.from(fourCc, 'ascii'), size, padded]);
}

function wrapWebp(exifTiff?: Buffer): Buffer {
  const chunk = exifTiff ? webpChunk('EXIF', exifTiff) : webpChunk('VP8 ', Buffer.alloc(4));
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), chunk]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length, 0);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body]);
}

describe('imageMayExposeLocation', () => {
  it('JPEG có GPS IFD với GPSLatitude → true', () => {
    expect(imageMayExposeLocation(wrapJpeg(tiffWithGpsCoordinates()), 'image/jpeg')).toBe(true);
  });

  it('JPEG có GPS IFD nhưng KHÔNG có GPSLatitude/GPSLongitude → false (không chặn vô cớ)', () => {
    expect(imageMayExposeLocation(wrapJpeg(tiffWithGpsIfdButNoCoordinates()), 'image/jpeg')).toBe(false);
  });

  it('JPEG có EXIF (thông số máy ảnh) nhưng không có GPS IFD → false', () => {
    expect(imageMayExposeLocation(wrapJpeg(tiffWithUnrelatedExifOnly()), 'image/jpeg')).toBe(false);
  });

  it('JPEG hoàn toàn không có EXIF → false', () => {
    expect(imageMayExposeLocation(wrapJpeg(), 'image/jpeg')).toBe(false);
  });

  it('JPEG rỗng/hỏng → false, không throw', () => {
    expect(imageMayExposeLocation(Buffer.from([0xff, 0xd8]), 'image/jpeg')).toBe(false);
    expect(imageMayExposeLocation(Buffer.alloc(0), 'image/jpeg')).toBe(false);
  });

  it('PNG có chunk eXIf mang GPS → true', () => {
    expect(imageMayExposeLocation(wrapPng(tiffWithGpsCoordinates()), 'image/png')).toBe(true);
  });

  it('PNG không có chunk eXIf → false', () => {
    expect(imageMayExposeLocation(wrapPng(), 'image/png')).toBe(false);
  });

  it('WEBP có chunk EXIF mang GPS → true', () => {
    expect(imageMayExposeLocation(wrapWebp(tiffWithGpsCoordinates()), 'image/webp')).toBe(true);
  });

  it('WEBP không có chunk EXIF → false', () => {
    expect(imageMayExposeLocation(wrapWebp(), 'image/webp')).toBe(false);
  });

  it('content_type không thuộc 3 loại được nhận → false', () => {
    expect(imageMayExposeLocation(Buffer.alloc(10), 'application/octet-stream')).toBe(false);
  });
});
