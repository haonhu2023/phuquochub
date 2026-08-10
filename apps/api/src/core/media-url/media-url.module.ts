import { Global, Module } from '@nestjs/common';
import { MediaUrlService } from './media-url.service';

// Global — same convention as core/storage and core/redis. Media URLs are built in three separate
// modules (media register response, place gallery, review media), so a global provider avoids
// threading an import through each of them.
@Global()
@Module({
  providers: [MediaUrlService],
  exports: [MediaUrlService],
})
export class MediaUrlModule {}
