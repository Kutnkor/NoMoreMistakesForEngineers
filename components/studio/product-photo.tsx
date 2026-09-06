'use client';
/* oxlint-disable next/no-img-element -- Photographs are pre-resized local WebP assets; this static host has no image transformation endpoint. */
import { useState } from 'react';
import { ExternalLink, Maximize2, SlidersHorizontal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { productImages } from '@/lib/hardware/photos';
export function ProductPhoto({
  id,
  name,
  className = '',
  eager = false,
  inspect = false,
}: {
  id: string;
  name: string;
  className?: string;
  eager?: boolean;
  inspect?: boolean;
}) {
  const photo = productImages[id];
  const [failedSrc, setFailedSrc] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  if (id === 'filter-output')
    return (
      <div className={'product-photo virtual-photo ' + className}>
        <SlidersHorizontal size={34} />
        <span>Analog filter interface</span>
      </div>
    );
  const content =
    photo && failedSrc !== photo.src ? (
      <img
        src={photo.src}
        alt={
          name +
          (photo.match === 'representative'
            ? ' — representative product photograph'
            : ' — product image')
        }
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailedSrc(photo.src)}
      />
    ) : (
      <span className="photo-unavailable">
        {name}
        <small>Image unavailable</small>
      </span>
    );
  if (!inspect)
    return <div className={'product-photo ' + className}>{content}</div>;
  return (
    <>
      <button
        className={'product-photo inspect-photo ' + className}
        aria-label={name + ' enlarge image'}
        onClick={() => setOpen(true)}
      >
        {content}
        {photo && (
          <span className="photo-zoom">
            <Maximize2 size={15} />
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="product-lightbox">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>
              {photo?.match === 'representative'
                ? 'Representative product photograph; values and package styles may differ for the selected component.'
                : 'Product image. Use the pin labels on the board when wiring.'}
            </DialogDescription>
          </DialogHeader>
          <div className="lightbox-image">
            {photo && <img src={photo.src} alt={name} />}
          </div>
          {photo && (
            <div className="photo-credit">
              <span>
                {photo.attribution}
                {photo.note && <small>{photo.note}</small>}
                {photo.licenseUrl && (
                  <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
                    {photo.license ?? 'Image license'}
                  </a>
                )}
              </span>
              <a href={photo.sourcePage} target="_blank" rel="noreferrer">
                Image source <ExternalLink size={14} />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function PhotoCredit({ id }: { id: string }) {
  const photo = productImages[id];
  return photo ? (
    <a
      className="photo-source"
      href={photo.sourcePage}
      target="_blank"
      rel="noreferrer"
    >
      {photo.match === 'representative' ? 'Representative photograph' : 'Image'}
      : {photo.attribution}
      <ExternalLink size={12} />
    </a>
  ) : null;
}
