import { useState } from 'react';

interface ProductImageProps {
  src: string | null;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  placeholderIconClassName?: string;
}

/** Показывает фото товара или плейсхолдер, если src пустой или картинка не загрузилась */
export function ProductImage({
  src,
  alt,
  className,
  placeholderClassName,
  placeholderIconClassName,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    return (
      <div className={placeholderClassName || 'product-image-placeholder'}>
        <span className={placeholderIconClassName} aria-hidden>📦</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
